/**
 * Phase 262 (D + G) — variable-rate derivation + management alerts.
 *
 * Pure functions over a loan's pricing attributes and the operator-entered
 * index book. Computes the fully-indexed rate (index value + spread, clamped to
 * floor/ceiling), reset timing, floor/ceiling status, and the management alerts
 * (mismatch, reset due/overdue, missing index/spread, payment-61 approaching,
 * floor/ceiling triggered). No fabricated data: when an input is missing the
 * derived field is undefined, never guessed.
 */

import {
  type RateIndexBook,
  type RateIndexType,
  indexValueFor,
  normalizeIndexType,
} from './rateIndexModel';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Rate equality tolerance, in percentage points (1bp). */
const RATE_EPSILON = 0.01;

export type InterestRateType = 'Fixed' | 'Variable' | 'Adjustable' | string;

export interface VariableRateLoanInput {
  readonly loanNumber: string;
  readonly borrower: string | undefined;
  readonly interestRateType: InterestRateType | undefined;
  /** Free-text or normalized index label; normalized internally. */
  readonly index: string | undefined;
  readonly spread: number | null | undefined;
  readonly currentNoteRate: number | null | undefined;
  readonly floor: number | null | undefined;
  readonly ceiling: number | null | undefined;
  readonly nextRateChangeDate: string | null | undefined;
  readonly firstResetDate?: string | null;
  readonly firstResetPaymentNumber?: number | null;
  readonly resetFrequency?: string | null;
  readonly payment61Reset?: boolean | null;
  readonly assignedOfficer?: string | null;
  readonly crmCompany?: string | null;
  readonly crmContact?: string | null;
}

export type FloorCeilingStatus = 'at-floor' | 'at-ceiling' | 'within' | 'unknown';

export type ResetBucket = 'overdue' | 'due-30' | 'due-60' | 'due-90' | 'beyond-90' | 'none';

export interface VariableRateRow {
  readonly loanNumber: string;
  readonly borrower: string | undefined;
  readonly isVariable: boolean;
  readonly indexType: RateIndexType | undefined;
  readonly indexValue: number | undefined;
  readonly indexEffectiveDate: string | undefined;
  readonly spread: number | undefined;
  readonly currentNoteRate: number | undefined;
  readonly fullyIndexedRate: number | undefined;
  /** currentNoteRate − fullyIndexedRate (undefined if either missing). */
  readonly difference: number | undefined;
  readonly floor: number | undefined;
  readonly ceiling: number | undefined;
  readonly floorCeilingStatus: FloorCeilingStatus;
  readonly nextResetDate: string | undefined;
  readonly resetDueDays: number | undefined;
  readonly resetBucket: ResetBucket;
  readonly payment61Reset: boolean;
  readonly assignedOfficer: string | undefined;
  readonly crmCompany: string | undefined;
  readonly crmContact: string | undefined;
  readonly rateActionRequired: boolean;
}

export function isVariableRate(type: InterestRateType | undefined): boolean {
  const t = (type ?? '').trim().toLowerCase();
  return t === 'variable' || t === 'adjustable' || t === 'arm';
}

function n(v: number | null | undefined): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

function parseTime(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : t;
}

/** index value + spread, clamped to floor/ceiling. Undefined if inputs missing. */
export function computeFullyIndexedRate(
  indexValue: number | undefined,
  spread: number | undefined,
  floor: number | undefined,
  ceiling: number | undefined,
): number | undefined {
  if (indexValue === undefined || spread === undefined) return undefined;
  let rate = indexValue + spread;
  if (floor !== undefined && rate < floor) rate = floor;
  if (ceiling !== undefined && rate > ceiling) rate = ceiling;
  // Round to 3 decimals to avoid float noise.
  return Math.round(rate * 1000) / 1000;
}

function floorCeilingStatus(
  rate: number | undefined,
  floor: number | undefined,
  ceiling: number | undefined,
): FloorCeilingStatus {
  if (rate === undefined) return 'unknown';
  if (ceiling !== undefined && rate >= ceiling - RATE_EPSILON) return 'at-ceiling';
  if (floor !== undefined && rate <= floor + RATE_EPSILON) return 'at-floor';
  if (floor === undefined && ceiling === undefined) return 'unknown';
  return 'within';
}

function resetBucket(days: number | undefined): ResetBucket {
  if (days === undefined) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 30) return 'due-30';
  if (days <= 60) return 'due-60';
  if (days <= 90) return 'due-90';
  return 'beyond-90';
}

export function deriveVariableRateRow(
  input: VariableRateLoanInput,
  book: RateIndexBook,
  now: Date,
): VariableRateRow {
  const isVariable = isVariableRate(input.interestRateType);
  const indexType = normalizeIndexType(input.index);
  const reading = indexValueFor(book, indexType);
  const indexValue = reading?.value;
  const spread = n(input.spread);
  const floor = n(input.floor);
  const ceiling = n(input.ceiling);
  const currentNoteRate = n(input.currentNoteRate);

  const fullyIndexedRate = isVariable
    ? computeFullyIndexedRate(indexValue, spread, floor, ceiling)
    : undefined;
  const difference =
    currentNoteRate !== undefined && fullyIndexedRate !== undefined
      ? Math.round((currentNoteRate - fullyIndexedRate) * 1000) / 1000
      : undefined;

  const nextResetIso = input.nextRateChangeDate ?? input.firstResetDate ?? undefined;
  const resetTime = parseTime(nextResetIso);
  const resetDueDays =
    resetTime !== undefined ? Math.ceil((resetTime - now.getTime()) / MS_PER_DAY) : undefined;
  const bucket = isVariable ? resetBucket(resetDueDays) : 'none';

  const fcStatus = floorCeilingStatus(fullyIndexedRate, floor, ceiling);

  const rateActionRequired =
    isVariable &&
    (((spread === undefined || indexType === undefined) /* missing pricing */) ||
      bucket === 'overdue' ||
      bucket === 'due-30' ||
      (difference !== undefined && Math.abs(difference) > RATE_EPSILON) ||
      fcStatus === 'at-floor' ||
      fcStatus === 'at-ceiling');

  return {
    loanNumber: input.loanNumber,
    borrower: input.borrower,
    isVariable,
    indexType,
    indexValue,
    indexEffectiveDate: reading?.effectiveDate,
    spread,
    currentNoteRate,
    fullyIndexedRate,
    difference,
    floor,
    ceiling,
    floorCeilingStatus: fcStatus,
    nextResetDate: nextResetIso ?? undefined,
    resetDueDays,
    resetBucket: bucket,
    payment61Reset: input.payment61Reset === true,
    assignedOfficer: input.assignedOfficer ?? undefined,
    crmCompany: input.crmCompany ?? undefined,
    crmContact: input.crmContact ?? undefined,
    rateActionRequired,
  };
}

/** Only the variable/adjustable loans, derived. */
export function deriveVariableRateRows(
  loans: readonly VariableRateLoanInput[],
  book: RateIndexBook,
  now: Date,
): VariableRateRow[] {
  return loans.map((l) => deriveVariableRateRow(l, book, now)).filter((r) => r.isVariable);
}

// ---------------------------------------------------------------------------
// Management alerts (G)
// ---------------------------------------------------------------------------

export type RateAlertType =
  | 'missing-index-spread'
  | 'rate-mismatch'
  | 'reset-due-30'
  | 'reset-overdue'
  | 'payment-61-approaching'
  | 'floor-ceiling-triggered';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface RateAlert {
  readonly loanNumber: string;
  readonly type: RateAlertType;
  readonly severity: AlertSeverity;
  readonly message: string;
}

export function deriveRateAlerts(rows: readonly VariableRateRow[]): RateAlert[] {
  const alerts: RateAlert[] = [];
  for (const r of rows) {
    if (!r.isVariable) continue;
    if (r.spread === undefined || r.indexType === undefined) {
      alerts.push({ loanNumber: r.loanNumber, type: 'missing-index-spread', severity: 'warning', message: 'Variable loan is missing its index or spread.' });
    }
    if (r.resetBucket === 'overdue') {
      alerts.push({ loanNumber: r.loanNumber, type: 'reset-overdue', severity: 'critical', message: `Rate reset is overdue by ${Math.abs(r.resetDueDays ?? 0)} day(s).` });
    } else if (r.resetBucket === 'due-30') {
      alerts.push({ loanNumber: r.loanNumber, type: 'reset-due-30', severity: 'warning', message: `Rate reset is due in ${r.resetDueDays} day(s).` });
    }
    if (r.difference !== undefined && Math.abs(r.difference) > RATE_EPSILON) {
      alerts.push({ loanNumber: r.loanNumber, type: 'rate-mismatch', severity: 'warning', message: `Current note rate differs from the fully-indexed rate by ${r.difference > 0 ? '+' : ''}${r.difference.toFixed(2)}%.` });
    }
    if (r.floorCeilingStatus === 'at-floor' || r.floorCeilingStatus === 'at-ceiling') {
      alerts.push({ loanNumber: r.loanNumber, type: 'floor-ceiling-triggered', severity: 'info', message: `Fully-indexed rate is ${r.floorCeilingStatus === 'at-floor' ? 'at the rate floor' : 'at the rate ceiling'}.` });
    }
    if (r.payment61Reset && (r.resetBucket === 'due-30' || r.resetBucket === 'due-60' || r.resetBucket === 'due-90')) {
      alerts.push({ loanNumber: r.loanNumber, type: 'payment-61-approaching', severity: 'warning', message: 'Payment-61 rate reset is approaching.' });
    }
  }
  return alerts;
}

// ---------------------------------------------------------------------------
// Payment-61 / 10-year-term-5-year-reset preset (D)
// ---------------------------------------------------------------------------

export interface ResetPreset {
  readonly termMonths: number;
  readonly initialFixedPeriodMonths: number;
  readonly firstResetPaymentNumber: number;
  readonly payment61Reset: boolean;
}

/** "10-year term / 5-year rate reset / payment 61". */
export const PAYMENT_61_PRESET: ResetPreset = Object.freeze({
  termMonths: 120,
  initialFixedPeriodMonths: 60,
  firstResetPaymentNumber: 61,
  payment61Reset: true,
});

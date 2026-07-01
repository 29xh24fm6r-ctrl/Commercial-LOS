/**
 * Phase PE-6 — Credit-admin exception & document / core-data queues.
 *
 * A PURE, deterministic completeness check that turns a loan's document +
 * core-data state into governed, SLA'd exceptions. Missing required items
 * (current financials, tax returns, insurance, UCC continuation, appraisal,
 * flood) and core-data gaps (risk rating, maturity, NAICS) auto-create
 * exceptions with a type, severity, owner, opened/due date, and an SLA state.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no clock — the caller passes `now`. Deterministic ids.
 *   - Fabricates nothing: an exception is only raised for a genuinely missing or
 *     stale item the caller reported. A present, in-date item raises nothing.
 *   - Exceptions never paper over a portfolio-segment data gap — a core-data gap
 *     is its own exception category, not folded into documents.
 */

export type ExceptionSeverity = 'high' | 'medium' | 'low';
export type ExceptionCategory = 'document' | 'core_data';
export type SlaState = 'on_track' | 'due_soon' | 'overdue';

/** Caller-reported state of one required document. */
export interface RequiredItemState {
  readonly key: string;
  readonly present: boolean;
  readonly receivedDate?: string;
  /** For items that go stale (insurance, UCC, appraisal, flood): expiry date. */
  readonly expiresDate?: string;
}

/** Caller-reported presence of one required core-data field. */
export interface CoreDataField {
  readonly key: string;
  readonly present: boolean;
}

export interface CreditAdminInput {
  readonly loanId?: string;
  /** ISO date the check runs as-of. */
  readonly now: string;
  readonly requiredItems?: readonly RequiredItemState[];
  readonly coreData?: readonly CoreDataField[];
  readonly owner?: string;
}

export interface CreditAdminException {
  readonly id: string;
  readonly loanId?: string;
  readonly key: string;
  readonly type: string;
  readonly category: ExceptionCategory;
  readonly severity: ExceptionSeverity;
  readonly owner?: string;
  readonly openedDate: string;
  readonly dueDate: string;
  readonly expiresDate?: string;
  readonly remediationNote: string;
  readonly slaState: SlaState;
  /** True when the item is present but past its expiry (stale), vs simply missing. */
  readonly stale: boolean;
}

export interface CreditAdminQueue {
  readonly loanId?: string;
  readonly exceptions: readonly CreditAdminException[];
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  readonly bySeverity: readonly { readonly severity: ExceptionSeverity; readonly count: number }[];
}

interface RequiredDocSpec {
  readonly key: string;
  readonly type: string;
  readonly severity: ExceptionSeverity;
  readonly slaDays: number;
  readonly canGoStale: boolean;
}

export const REQUIRED_DOCUMENTS: readonly RequiredDocSpec[] = Object.freeze([
  { key: 'current_financials', type: 'Current financial statements', severity: 'high', slaDays: 30, canGoStale: true },
  { key: 'tax_returns', type: 'Tax returns', severity: 'high', slaDays: 30, canGoStale: false },
  { key: 'insurance', type: 'Insurance evidence', severity: 'high', slaDays: 15, canGoStale: true },
  { key: 'ucc_continuation', type: 'UCC continuation', severity: 'high', slaDays: 30, canGoStale: true },
  { key: 'appraisal', type: 'Appraisal / evaluation', severity: 'medium', slaDays: 45, canGoStale: true },
  { key: 'flood_determination', type: 'Flood determination', severity: 'medium', slaDays: 30, canGoStale: true },
]);

interface CoreDataSpec {
  readonly key: string;
  readonly type: string;
  readonly severity: ExceptionSeverity;
  readonly slaDays: number;
}

export const REQUIRED_CORE_DATA: readonly CoreDataSpec[] = Object.freeze([
  { key: 'risk_rating', type: 'Risk rating', severity: 'high', slaDays: 15 },
  { key: 'maturity_date', type: 'Maturity date', severity: 'medium', slaDays: 30 },
  { key: 'naics', type: 'NAICS / industry', severity: 'low', slaDays: 45 },
]);

const SEVERITY_ORDER: Record<ExceptionSeverity, number> = { high: 0, medium: 1, low: 2 };
const SLA_ORDER: Record<SlaState, number> = { overdue: 0, due_soon: 1, on_track: 2 };
const DUE_SOON_DAYS = 7;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function slaStateFor(now: string, dueDate: string): SlaState {
  const daysToDue = daysBetween(now, dueDate);
  if (daysToDue < 0) return 'overdue';
  if (daysToDue <= DUE_SOON_DAYS) return 'due_soon';
  return 'on_track';
}

/** Derive the credit-admin exception queue for one loan's completeness state. */
export function deriveCreditAdminExceptions(input: CreditAdminInput): CreditAdminQueue {
  const now = input.now;
  const itemByKey = new Map((input.requiredItems ?? []).map((i) => [i.key, i]));
  const coreByKey = new Map((input.coreData ?? []).map((c) => [c.key, c]));
  const exceptions: CreditAdminException[] = [];

  for (const spec of REQUIRED_DOCUMENTS) {
    const state = itemByKey.get(spec.key);
    const missing = !state || state.present !== true;
    const stale =
      Boolean(state?.present) && spec.canGoStale && typeof state?.expiresDate === 'string' && daysBetween(now, state.expiresDate) < 0;
    if (!missing && !stale) continue;

    const dueDate = stale && state?.expiresDate ? addDays(state.expiresDate, spec.slaDays) : addDays(now, spec.slaDays);
    exceptions.push({
      id: `${input.loanId ?? 'loan'}:${spec.key}`,
      loanId: input.loanId,
      key: spec.key,
      type: spec.type,
      category: 'document',
      severity: spec.severity,
      owner: input.owner,
      openedDate: now,
      dueDate,
      expiresDate: state?.expiresDate,
      remediationNote: stale ? `${spec.type} on file is stale (expired) — obtain a current copy.` : `${spec.type} is missing — obtain and file.`,
      slaState: slaStateFor(now, dueDate),
      stale,
    });
  }

  for (const spec of REQUIRED_CORE_DATA) {
    const field = coreByKey.get(spec.key);
    if (field && field.present === true) continue;
    const dueDate = addDays(now, spec.slaDays);
    exceptions.push({
      id: `${input.loanId ?? 'loan'}:${spec.key}`,
      loanId: input.loanId,
      key: spec.key,
      type: spec.type,
      category: 'core_data',
      severity: spec.severity,
      owner: input.owner,
      openedDate: now,
      dueDate,
      remediationNote: `${spec.type} is not populated — complete the core-data field.`,
      slaState: slaStateFor(now, dueDate),
      stale: false,
    });
  }

  exceptions.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || SLA_ORDER[a.slaState] - SLA_ORDER[b.slaState] || a.key.localeCompare(b.key),
  );

  const bySeverity = (['high', 'medium', 'low'] as const).map((severity) => ({
    severity,
    count: exceptions.filter((e) => e.severity === severity).length,
  }));

  return {
    loanId: input.loanId,
    exceptions,
    openCount: exceptions.length,
    overdueCount: exceptions.filter((e) => e.slaState === 'overdue').length,
    dueSoonCount: exceptions.filter((e) => e.slaState === 'due_soon').length,
    bySeverity,
  };
}

/** Aggregate several loans' queues into a portfolio exception rollup. */
export interface PortfolioExceptionSummary {
  readonly totalOpen: number;
  readonly overdue: number;
  readonly dueSoon: number;
  readonly bySeverity: readonly { readonly severity: ExceptionSeverity; readonly count: number }[];
  readonly byType: readonly { readonly type: string; readonly count: number }[];
}

export function derivePortfolioExceptionSummary(queues: readonly CreditAdminQueue[]): PortfolioExceptionSummary {
  const all = queues.flatMap((q) => q.exceptions);
  const typeCounts = new Map<string, number>();
  for (const e of all) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
  return {
    totalOpen: all.length,
    overdue: all.filter((e) => e.slaState === 'overdue').length,
    dueSoon: all.filter((e) => e.slaState === 'due_soon').length,
    bySeverity: (['high', 'medium', 'low'] as const).map((severity) => ({ severity, count: all.filter((e) => e.severity === severity).length })),
    byType: [...typeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
  };
}

/**
 * Launch Phase 2 — extended loan attributes (additive, fail-closed persistence).
 *
 * Phase 262 captured several banker-entered fields the UI uses for logic (current note rate,
 * reset terms, payment-61 flag, product, officer, branch, purpose) but did NOT persist them —
 * a reload silently dropped them and the note-vs-fully-indexed alert could not re-derive. This
 * module is the typed, versioned contract for round-tripping them through ONE additive JSON
 * column, `cr664_extendedloanattributes`, behind a default-off flag.
 *
 * Discipline: pure (no IO). Default OFF. When the column is not provisioned, callers fail
 * CLOSED (the loan still boards; the fields are visibly marked non-persisted) — never a silent
 * drop, never a crash.
 */

/** Default OFF. Only do anything once the operator provisions the column and enables this. */
export const EXTENDED_LOAN_ATTRIBUTES_PERSISTENCE_ENABLED = true;

/** The single additive JSON column these attributes round-trip through. */
export const EXTENDED_LOAN_ATTRIBUTES_COLUMN = 'cr664_extendedloanattributes';

export const EXTENDED_LOAN_ATTRIBUTES_SCHEMA_VERSION = 1;

export interface ExtendedLoanAttributes {
  readonly schemaVersion: number;
  readonly product?: string;
  readonly loanOfficer?: string;
  readonly branch?: string;
  readonly purpose?: string;
  readonly currentNoteRate?: number;
  readonly firstResetDate?: string;
  readonly firstResetPaymentNumber?: number;
  readonly resetFrequency?: string;
  readonly nextRateChangeDate?: string;
  readonly payment61Reset?: boolean;
}

/** Input shape — the raw, possibly-empty values captured from the form / CSV. */
export interface ExtendedLoanAttributesInput {
  readonly product?: string;
  readonly loanOfficer?: string;
  readonly branch?: string;
  readonly purpose?: string;
  readonly currentNoteRate?: number;
  readonly firstResetDate?: string;
  readonly firstResetPaymentNumber?: number;
  readonly resetFrequency?: string;
  readonly nextRateChangeDate?: string;
  readonly payment61Reset?: boolean;
}

function str(v: string | undefined): string | undefined {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : undefined;
}
function num(v: number | undefined): number | undefined {
  return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}

/** Build a versioned attributes object, dropping empty values. */
export function buildExtendedLoanAttributes(input: ExtendedLoanAttributesInput): ExtendedLoanAttributes {
  return {
    schemaVersion: EXTENDED_LOAN_ATTRIBUTES_SCHEMA_VERSION,
    product: str(input.product),
    loanOfficer: str(input.loanOfficer),
    branch: str(input.branch),
    purpose: str(input.purpose),
    currentNoteRate: num(input.currentNoteRate),
    firstResetDate: str(input.firstResetDate),
    firstResetPaymentNumber: num(input.firstResetPaymentNumber),
    resetFrequency: str(input.resetFrequency),
    nextRateChangeDate: str(input.nextRateChangeDate),
    payment61Reset: input.payment61Reset === true ? true : input.payment61Reset === false ? false : undefined,
  };
}

/** True when the attributes carry at least one real value (beyond the version tag). */
export function hasAnyExtendedAttribute(attrs: ExtendedLoanAttributes): boolean {
  return Object.entries(attrs).some(([k, v]) => k !== 'schemaVersion' && v !== undefined);
}

/** Serialize to the JSON string stored in the column (null when nothing to persist). */
export function serializeExtendedLoanAttributes(attrs: ExtendedLoanAttributes): string | null {
  if (!hasAnyExtendedAttribute(attrs)) return null;
  const compact: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) compact[k] = v;
  return JSON.stringify(compact);
}

/** Safe parse from the column value. Returns null on absent / malformed / wrong-version data. */
export function parseExtendedLoanAttributes(raw: string | null | undefined): ExtendedLoanAttributes | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj !== 'object' || obj === null) return null;
    const sv = obj.schemaVersion;
    if (typeof sv !== 'number') return null;
    return {
      schemaVersion: sv,
      product: typeof obj.product === 'string' ? obj.product : undefined,
      loanOfficer: typeof obj.loanOfficer === 'string' ? obj.loanOfficer : undefined,
      branch: typeof obj.branch === 'string' ? obj.branch : undefined,
      purpose: typeof obj.purpose === 'string' ? obj.purpose : undefined,
      currentNoteRate: typeof obj.currentNoteRate === 'number' ? obj.currentNoteRate : undefined,
      firstResetDate: typeof obj.firstResetDate === 'string' ? obj.firstResetDate : undefined,
      firstResetPaymentNumber: typeof obj.firstResetPaymentNumber === 'number' ? obj.firstResetPaymentNumber : undefined,
      resetFrequency: typeof obj.resetFrequency === 'string' ? obj.resetFrequency : undefined,
      nextRateChangeDate: typeof obj.nextRateChangeDate === 'string' ? obj.nextRateChangeDate : undefined,
      payment61Reset: typeof obj.payment61Reset === 'boolean' ? obj.payment61Reset : undefined,
    };
  } catch {
    return null;
  }
}

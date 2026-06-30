/**
 * Stage Advancement — approval-authority matrix (Phase 6).
 *
 * ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 * │ TEMPLATE — NOT OGB-RATIFIED CREDIT POLICY.                                                 │
 * │ These amount bands and authority tiers are a defensible industry-standard starting point. │
 * │ Matt + OGB credit/compliance must confirm the real matrix before it is treated as binding.│
 * │ Editing the bands below requires NO logic change — the engine reads this config only.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Encodes the CREDIT_APPROVAL exit-gate authority check: an approval record satisfies the gate only
 * if the recorded approver's authority is at least the level required for the loan amount. Pure and
 * FAIL-CLOSED: a missing/invalid amount or approval record yields "not satisfied".
 */

export type ApprovalAuthorityLevel =
  | 'BANKER_PLUS_CREDIT_OFFICER'
  | 'CREDIT_MANAGER'
  | 'SENIOR_CREDIT_OFFICER_CCO'
  | 'CREDIT_COMMITTEE';

/** Increasing authority — a higher rank covers everything a lower rank covers. */
export const AUTHORITY_RANK: Readonly<Record<ApprovalAuthorityLevel, number>> = Object.freeze({
  BANKER_PLUS_CREDIT_OFFICER: 1,
  CREDIT_MANAGER: 2,
  SENIOR_CREDIT_OFFICER_CCO: 3,
  CREDIT_COMMITTEE: 4,
});

export interface AuthorityBand {
  /** Inclusive upper bound for this band, or null for the unbounded top band. */
  readonly maxAmount: number | null;
  readonly required: ApprovalAuthorityLevel;
  readonly label: string;
}

/**
 * TEMPLATE bands (ascending). Ratify against OGB credit policy. Amounts in USD.
 *   up to 250,000            → Banker + 1 Credit Officer
 *   250,001 to 1,000,000     → Credit Manager
 *   1,000,001 to 5,000,000   → Senior Credit Officer / CCO
 *   over 5,000,000           → Credit Committee
 */
export const APPROVAL_AUTHORITY_MATRIX: readonly AuthorityBand[] = Object.freeze([
  Object.freeze({ maxAmount: 250_000, required: 'BANKER_PLUS_CREDIT_OFFICER', label: 'up to 250,000 USD' }),
  Object.freeze({ maxAmount: 1_000_000, required: 'CREDIT_MANAGER', label: '250,001 to 1,000,000 USD' }),
  Object.freeze({ maxAmount: 5_000_000, required: 'SENIOR_CREDIT_OFFICER_CCO', label: '1,000,001 to 5,000,000 USD' }),
  Object.freeze({ maxAmount: null, required: 'CREDIT_COMMITTEE', label: 'over 5,000,000 USD' }),
]) as readonly AuthorityBand[];

/** Marker so surfaces can clearly badge this as a template, not ratified policy. */
export const APPROVAL_AUTHORITY_MATRIX_IS_TEMPLATE = true as const;

export interface ApprovalRecord {
  readonly approverAuthority: ApprovalAuthorityLevel;
}

function isValidAmount(amount: number | undefined | null): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

/**
 * The authority level required to approve a loan of the given amount. Returns undefined for an
 * invalid/absent amount (fail-closed — the caller must treat undefined as "not satisfiable").
 */
export function requiredAuthority(amount: number | undefined | null): ApprovalAuthorityLevel | undefined {
  if (!isValidAmount(amount)) return undefined;
  for (const band of APPROVAL_AUTHORITY_MATRIX) {
    if (band.maxAmount === null || amount <= band.maxAmount) return band.required;
  }
  return undefined; // unreachable given the null top band, but fail-closed by default
}

/**
 * Whether an approval record satisfies the authority requirement for the amount. FAIL-CLOSED:
 * false when the amount is invalid, the record is missing, or the approver's authority is below the
 * required level.
 */
export function approvalSatisfies(
  record: ApprovalRecord | undefined | null,
  amount: number | undefined | null,
): boolean {
  const required = requiredAuthority(amount);
  if (!required) return false;
  if (!record) return false;
  const have = AUTHORITY_RANK[record.approverAuthority];
  if (typeof have !== 'number') return false;
  return have >= AUTHORITY_RANK[required];
}

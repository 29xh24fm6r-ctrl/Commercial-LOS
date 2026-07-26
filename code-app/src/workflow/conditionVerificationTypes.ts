/**
 * Final LOS Completion arc — Workstream E. Durable Condition Verification Record.
 *
 * Closes the DOCUMENTATION:conditions_precedent / :collateral_verified / :insurance_verified
 * untracked() gaps in loanWorkflowRequirementRegistry.ts — until now none of these three closing
 * conditions was persisted as its own record. A single table parameterized by `conditionType`
 * covers all three, since they share the exact same lifecycle (verified/waived/failed, with notes,
 * actor, timestamp, and an append-only re-verification chain via `supersedesRecordId`).
 */

export type ConditionType = 'CONDITIONS_PRECEDENT' | 'COLLATERAL' | 'INSURANCE';

export const CONDITION_TYPES: readonly ConditionType[] = ['CONDITIONS_PRECEDENT', 'COLLATERAL', 'INSURANCE'];

export type ConditionVerificationStatus = 'CLEARED' | 'WAIVED' | 'FAILED';

export const CONDITION_VERIFICATION_STATUSES: readonly ConditionVerificationStatus[] = [
  'CLEARED',
  'WAIVED',
  'FAILED',
];

/** Statuses that satisfy the condition — a FAILED verification does NOT clear its requirement. */
export const AFFIRMATIVE_CONDITION_STATUSES: ReadonlySet<ConditionVerificationStatus> = new Set([
  'CLEARED',
  'WAIVED',
]);

export interface ConditionVerificationRecord {
  readonly recordId: string;
  readonly dealId: string;
  readonly conditionType: ConditionType;
  readonly status: ConditionVerificationStatus;
  /** REQUIRED — a blank notes field is denied by submitConditionVerificationAction() before any
   *  write is attempted; describes what was verified/waived and why. */
  readonly notes: string;
  readonly verifiedByActorEmail: string;
  readonly verifiedAtIso: string;
  readonly correlationId: string;
  readonly supersedesRecordId: string | undefined;
}

export interface ConditionDeepFactReadiness {
  readonly met: boolean;
  /** Policy-safe reason when not met (empty when met). */
  readonly reason: string;
}

export interface ConditionVerificationReadiness {
  /** DOCUMENTATION:conditions_precedent */
  readonly conditionsPrecedent: ConditionDeepFactReadiness;
  /** DOCUMENTATION:collateral_verified */
  readonly collateralVerified: ConditionDeepFactReadiness;
  /** DOCUMENTATION:insurance_verified */
  readonly insuranceVerified: ConditionDeepFactReadiness;
  /** The head-of-chain record per condition type, if any (for downstream display). */
  readonly currentRecords: Readonly<Record<ConditionType, ConditionVerificationRecord | undefined>>;
}

const NOT_MET_REASON: Readonly<Record<ConditionType, string>> = {
  CONDITIONS_PRECEDENT: 'Conditions precedent have not been cleared for this deal.',
  COLLATERAL: 'Collateral has not been verified for this deal.',
  INSURANCE: 'Insurance has not been verified for this deal.',
};

/**
 * Resolves the head-of-chain record for one (deal, conditionType) pair via the append-only chain's
 * structural linkage (`supersedesRecordId`), NOT by comparing timestamps — same discipline
 * `evaluateCommitmentReadiness` (commitmentRecordTypes.ts) uses, for the same reason: two records
 * minted in the same request can carry colliding timestamps.
 */
function headFor(
  records: readonly ConditionVerificationRecord[],
  conditionType: ConditionType,
): ConditionVerificationRecord | undefined {
  const forType = records.filter((r) => r.conditionType === conditionType);
  const supersededIds = new Set(
    forType.map((r) => r.supersedesRecordId).filter((id): id is string => Boolean(id)),
  );
  const heads = forType.filter((r) => !supersededIds.has(r.recordId));
  return [...heads].sort((a, b) => (b.verifiedAtIso ?? '').localeCompare(a.verifiedAtIso ?? ''))[0];
}

/**
 * Fail-closed Condition Verification readiness (Final LOS Completion arc, Workstream E/K). Never
 * fabricates a verification: an empty list or a deal-id mismatch fails closed as not-met for every
 * condition type.
 */
export function evaluateConditionVerificationReadiness(
  records: readonly ConditionVerificationRecord[] | undefined,
  expectedDealId: string,
): ConditionVerificationReadiness {
  const forDeal = (records ?? []).filter((r) => r.dealId === expectedDealId);

  const currentRecords: Record<ConditionType, ConditionVerificationRecord | undefined> = {
    CONDITIONS_PRECEDENT: headFor(forDeal, 'CONDITIONS_PRECEDENT'),
    COLLATERAL: headFor(forDeal, 'COLLATERAL'),
    INSURANCE: headFor(forDeal, 'INSURANCE'),
  };

  function factFor(conditionType: ConditionType): ConditionDeepFactReadiness {
    const rec = currentRecords[conditionType];
    if (rec && AFFIRMATIVE_CONDITION_STATUSES.has(rec.status)) return { met: true, reason: '' };
    return { met: false, reason: NOT_MET_REASON[conditionType] };
  }

  return {
    conditionsPrecedent: factFor('CONDITIONS_PRECEDENT'),
    collateralVerified: factFor('COLLATERAL'),
    insuranceVerified: factFor('INSURANCE'),
    currentRecords,
  };
}

/**
 * Final LOS Completion arc — Workstream J. Durable Adverse Action Record.
 *
 * Closes the DECLINE:adverse_action untracked() gap in loanWorkflowRequirementRegistry.ts —
 * confirmed by direct search (see docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md) that no
 * adverse-action documentation concept existed anywhere in this codebase before this record.
 *
 * Scope, deliberately narrow: `canonicalStageTransition.ts` already flags every DECLINE as
 * `adverseActionPending: true` — a real, computed fact, not fabricated here. What was missing is a
 * durable place for an authorized credit officer to record that the downstream adverse-action
 * notification/documentation obligation was actually completed. This record tracks completion ONLY
 * — same discipline as `bookingQcCheckTypes.ts` tracking pass/fail/waive without defining what a QC
 * review must check. It does NOT define, enforce, or validate the regulatory content of an
 * adverse-action notice (what it must say, when it must be sent, who receives it) — that is a
 * product/legal-policy decision explicitly out of scope for this arc (see
 * `docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md` §3.3).
 *
 * Append-only: a correction is recorded as a NEW row via `supersedesRecordId`, never mutating a
 * prior one — same discipline `commitmentRecordTypes.ts` / `conditionVerificationTypes.ts` /
 * `executedDocumentAttestationTypes.ts` / `bookingQcCheckTypes.ts` all use.
 */

export type AdverseActionRecordStatus = 'SENT' | 'WAIVED';

export const ADVERSE_ACTION_RECORD_STATUSES: readonly AdverseActionRecordStatus[] = ['SENT', 'WAIVED'];

export interface AdverseActionRecord {
  readonly recordId: string;
  readonly dealId: string;
  readonly status: AdverseActionRecordStatus;
  /** REQUIRED — a blank notes field is denied by submitAdverseActionAction() before any write is
   *  attempted; describes what was sent/documented (or why the obligation was waived). */
  readonly notes: string;
  readonly recordedByActorEmail: string;
  readonly recordedAtIso: string;
  readonly correlationId: string;
  readonly supersedesRecordId: string | undefined;
}

export interface AdverseActionReadiness {
  /** DECLINE:adverse_action */
  readonly adverseActionDocumented: { readonly met: boolean; readonly reason: string };
  /** The head-of-chain record, if any (for downstream display). */
  readonly currentRecord: AdverseActionRecord | undefined;
}

const NOT_MET = {
  met: false,
  reason: 'The adverse-action notification/documentation obligation for this decline has not been recorded.',
} as const;

/**
 * Resolves the head-of-chain record via the append-only chain's structural linkage
 * (`supersedesRecordId`), NOT by comparing timestamps — same discipline
 * `evaluateBookingQcReadiness` / `evaluateExecutedDocumentAttestationReadiness` /
 * `evaluateConditionVerificationReadiness` / `evaluateCommitmentReadiness` use.
 */
function headOfChain(records: readonly AdverseActionRecord[]): AdverseActionRecord | undefined {
  const supersededIds = new Set(
    records.map((r) => r.supersedesRecordId).filter((id): id is string => Boolean(id)),
  );
  const heads = records.filter((r) => !supersededIds.has(r.recordId));
  return [...heads].sort((a, b) => (b.recordedAtIso ?? '').localeCompare(a.recordedAtIso ?? ''))[0];
}

/**
 * Fail-closed Adverse Action readiness (Final LOS Completion arc, Workstream J). Never fabricates a
 * record: an empty list or a deal-id mismatch fails closed as not-met. Both SENT and WAIVED count as
 * documented — this function only checks that a decision was made and recorded, not which one.
 */
export function evaluateAdverseActionReadiness(
  records: readonly AdverseActionRecord[] | undefined,
  expectedDealId: string,
): AdverseActionReadiness {
  const forDeal = (records ?? []).filter((r) => r.dealId === expectedDealId);
  const current = headOfChain(forDeal);
  const met = current !== undefined;
  return {
    adverseActionDocumented: met ? { met: true, reason: '' } : NOT_MET,
    currentRecord: current,
  };
}

/**
 * Stage Advancement - approval-authority policy (Phase 6).
 *
 * OGB policy: single authorized-approver gate, no amount tiers (founder decision 2026-06-30).
 *
 * This module is the editable policy point for the CREDIT_APPROVAL exit-gate authority check. If OGB
 * later adds amount limits, committee thresholds, or delegated authority levels, that future config
 * belongs here. Today, every deal follows the same path: an approval must be recorded by an actor
 * whose approver role/entitlement has already been verified by the caller.
 *
 * Pure and FAIL-CLOSED: a missing record, missing approval, or unverified approver yields false.
 */

export interface ApprovalRecord {
  readonly approvalRecorded: boolean;
  /**
   * True only when the recorded actor has the OGB approver role/entitlement. The entitlement lookup
   * is intentionally outside this pure policy helper; callers pass the verified result here.
   */
  readonly approverIsAuthorized: boolean;
}

/**
 * Whether an approval record satisfies OGB's current authority requirement. There is deliberately no
 * loan-amount parameter: OGB has ratified a single authorized-approver gate with no amount tiers.
 */
export function approvalSatisfies(record: ApprovalRecord | undefined | null): boolean {
  return record?.approvalRecorded === true && record.approverIsAuthorized === true;
}

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
 *
 * NOTE (2026-07-14, docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md finding H3): a SEPARATE,
 * unreconciled multi-tier ($5M/$15M/$50M) committee model exists in `deriveCreditCommitteeRoute.ts`
 * / `deriveConfigurableWorkflowRoute.ts`. If OGB's policy ever grows amount tiers, reconcile with
 * that model rather than maintaining two independent answers to "who must approve this loan."
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

/**
 * INTERIM approval-authority proxy (2026-07-14 remediation).
 *
 * `approvalSatisfies` above models the intended OGB policy but has never been wired to a live
 * signal — there is no per-user approval limit or committee-membership field anywhere in the
 * Dataverse schema today (see docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, finding C3).
 * The only role-shaped field that exists and is already fetched for every banker session is
 * cr664_Banker.cr664_roletype (job function: CommercialBanker / RelationshipManager /
 * PortfolioManager / Support) — NOT a true approval entitlement.
 *
 * Until a real approval-authority field exists, this function is the sole gate on advancing a
 * deal OUT of CREDIT_APPROVAL: Relationship Managers and Portfolio Managers are treated as
 * authorized approvers; Commercial Bankers and Support are not. This is a coarse, honest
 * placeholder — it verifies job function, not that a specific approval was actually recorded —
 * and should be replaced once a real Dataverse approval-authority/committee-membership field is
 * added.
 */
export type InterimApproverRoleType = 'CommercialBanker' | 'RelationshipManager' | 'PortfolioManager' | 'Support';

const INTERIM_AUTHORIZED_APPROVER_ROLES: ReadonlySet<string> = new Set<InterimApproverRoleType>([
  'RelationshipManager',
  'PortfolioManager',
]);

export function isInterimAuthorizedApproverRole(roleType: string | undefined): boolean {
  return roleType !== undefined && INTERIM_AUTHORIZED_APPROVER_ROLES.has(roleType);
}

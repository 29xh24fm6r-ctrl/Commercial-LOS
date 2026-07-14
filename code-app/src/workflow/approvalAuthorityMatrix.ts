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
 * RECONCILED (2026-07-14, second pass): `deriveCreditCommitteeRoute.ts` / `deriveConfigurableWorkflowRoute.ts`
 * previously carried a separate, unreconciled multi-tier ($5M/$15M/$50M) amount-based committee
 * model (audit finding H3) — that model has since been removed there in favor of this same
 * single-authorized-approver, no-amount-tiers policy (a committee is now only in play when a
 * routing rule explicitly sets a committeePolicy, never merely from crossing a dollar amount).
 * The live per-actor authority check itself is `evaluateCreditApprovalAuthority` in
 * `creditApprovalAuthority.ts`, not this module (see the SUPERSEDED note below) — but the policy
 * shape (no amount tiers) is now consistent across both the routing/visibility layer and the
 * individual-authority layer.
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
 * SUPERSEDED (2026-07-14, second pass): this job-function role proxy was an interim stand-in
 * used only until real authority fields existed. They now exist —
 * cr664_Banker.cr664_approvallimit / cr664_creditcommitteemember / cr664_approvaloverrideauthority
 * (see scripts/dataverse/create-banker-credit-authority-fields.ps1). The live CREDIT_APPROVAL exit
 * gate now calls `evaluateCreditApprovalAuthority` in `creditApprovalAuthority.ts` instead of this
 * function. Kept here, unused by the live path, as history/audit trail — do not wire this back in.
 */
export type InterimApproverRoleType = 'CommercialBanker' | 'RelationshipManager' | 'PortfolioManager' | 'Support';

const INTERIM_AUTHORIZED_APPROVER_ROLES: ReadonlySet<string> = new Set<InterimApproverRoleType>([
  'RelationshipManager',
  'PortfolioManager',
]);

export function isInterimAuthorizedApproverRole(roleType: string | undefined): boolean {
  return roleType !== undefined && INTERIM_AUTHORIZED_APPROVER_ROLES.has(roleType);
}

/**
 * Governance initiative (2026-07-21) — canonical Dataverse schema name for the governed-action
 * reason field, in ONE SDK-free place so the deployment/provisioning plan
 * (docs/governance/DEPLOYMENT_AND_ROLLBACK_PLAN.md), the live transition wiring
 * (buildLiveCanonicalTransitionDeps.ts), and the provisioning script
 * (scripts/dataverse/create-governed-transition-reason-field.ps1) cannot drift apart.
 *
 * WHY THIS FIELD EXISTS: the Dataverse plugin that enforces reason-required for RETURN/DECLINE/
 * WITHDRAW (docs/governance/CANONICAL_TRANSITION_POLICY_CONTRACT.md §3.2-3.4) only sees the fields
 * on the `cr664_loandeals` Update request it fires on — it has no visibility into the SEPARATE
 * `cr664_auditevents` create call this app's audit sink makes (a different entity, a different
 * message, not gated by this plugin). Today the reason text is written ONLY into the audit event's
 * free-text notes — a direct Web API caller could set the deal to DECLINED with zero reason and
 * the plugin (as scoped without this field) could not detect it. This column closes that gap by
 * putting the reason on the SAME record/request the plugin already inspects.
 *
 * This column does NOT yet exist in the live org — reason enforcement stays fail-closed (advisory
 * client-side only) behind `GOVERNANCE_REASON_FIELD_ENABLED` until an operator provisions it and
 * regenerates the SDK. See the provisioning plan for the exact sequence.
 */

/** Singular logical table name (used by `pac code add-data-source -t` / the Plugin Registration Tool). */
export const LOAN_DEAL_TABLE_LOGICAL = 'cr664_loandeal' as const;

/**
 * The free-text reason column. Written by the client on every RETURN ("return reason"),
 * DECLINE (structured code + optional detail, concatenated), and WITHDRAW (withdrawal reason)
 * request, alongside the stage/status write — never on ADVANCE, which has no reason requirement.
 * This is the schema blocker for full server-side reason enforcement.
 */
export const GOVERNED_TRANSITION_REASON_COLUMN = 'cr664_governedactionreason' as const;

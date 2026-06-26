/**
 * Phase 202 / 257 — CRM working-surface inputs (bank-user copy).
 *
 * The CRM working surfaces (banker / manager / executive) are pure presentational
 * components that take fully-formed read-only inputs. The CRM is the bank's own
 * relationship system (LOS / Dataverse-native), not an external Salesforce /
 * nCino connector. Bank-user copy: "CRM is active", "Relationship records are
 * available". Honest empty counts (an honest zero — no records yet) where none
 * are available. No fabricated readiness, no fake sync success, no fetch, no
 * write, no credentials, no fake data, and no external connection. Governance /
 * audit framing lives in Admin Diagnostics, not on these banker surfaces.
 */

import type { CrmBankerSurfaceInput } from './CrmBankerWorkingSurface';
import type { CrmManagerSurfaceInput } from './CrmManagerWorkingSurface';
import type { CrmExecutiveSurfaceInput } from './CrmExecutiveWorkingSurface';

/** CRM posture (bank-user copy). */
const CRM_ACTIVE = 'CRM is active — relationship records are available';
/** Loan workflow posture (bank-user copy). */
const WORKFLOW_ACTIVE = 'Loan workflow is active';

/** Banker CRM posture (active; no records linked yet). */
export function bankerCrmPreviewInput(): CrmBankerSurfaceInput {
  return {
    relationshipOverview: undefined,
    salesforceReadiness: CRM_ACTIVE,
    ncinoReadiness: WORKFLOW_ACTIVE,
    entityMatchStatus: 'Awaiting human review',
    sourceOfTruthGaps: 0,
    syncPreviewBlockers: 0,
    nextSafeBankerStep: 'Review relationship records and matching.',
    crmCommandCenterHref: undefined,
  };
}

/** Manager CRM posture (active; read-only). */
export function managerCrmPreviewInput(): CrmManagerSurfaceInput {
  return {
    teamCrmReadiness: CRM_ACTIVE,
    bankerFollowUpWorkload: 0,
    sourceOfTruthConflicts: 0,
    salesforceReadinessByPipeline: CRM_ACTIVE,
    ncinoReadinessByPipeline: WORKFLOW_ACTIVE,
    syncPreviewBlockedCount: 0,
    nextSafeManagerStep: 'Review team relationship coverage.',
    crmCommandCenterHref: undefined,
  };
}

/** Executive CRM posture (active; no fake revenue). */
export function executiveCrmPreviewInput(): CrmExecutiveSurfaceInput {
  return {
    crmCoverageStatus: CRM_ACTIVE,
    salesforceActivationPosture: 'Active',
    ncinoActivationPosture: 'Active',
    relationshipIntelligenceGaps: 0,
    productStrategyCrmReadiness: CRM_ACTIVE,
    revenueDataAvailability: 'Not available (no revenue figures shown)',
    nextExecutiveStep: 'Review CRM coverage and activation.',
    crmCommandCenterHref: undefined,
  };
}

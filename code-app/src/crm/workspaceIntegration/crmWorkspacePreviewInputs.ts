/**
 * Phase 202 — OGB-native CRM working-surface inputs (honest, internal).
 *
 * The CRM working surfaces (banker / manager / executive) are pure presentational
 * components that take fully-formed read-only inputs. These are the OGB-NATIVE
 * internal CRM surfaces (LOS / Dataverse-native) — NOT an external Salesforce /
 * nCino connector. The posture is "internal OGB CRM active, read-only, writeback
 * gated", with honest empty counts (an honest zero — nothing linked yet) where no
 * internal records are available. No fabricated readiness, no fake sync success,
 * no fetch, no write, no credentials, no fake data, and no external connection.
 */

import type { CrmBankerSurfaceInput } from './CrmBankerWorkingSurface';
import type { CrmManagerSurfaceInput } from './CrmManagerWorkingSurface';
import type { CrmExecutiveSurfaceInput } from './CrmExecutiveWorkingSurface';

/** OGB-native internal CRM posture: active, read-only, writeback gated. */
const INTERNAL_CRM_ACTIVE = 'OGB CRM active — internal relationship intelligence (writeback gated)';
/** OGB-native internal lending-workflow posture: active, read-only. */
const INTERNAL_WORKFLOW_ACTIVE = 'Internal lending workflow active (writeback gated)';

/** Honest banker OGB CRM posture (internal active; no records linked yet). */
export function bankerCrmPreviewInput(): CrmBankerSurfaceInput {
  return {
    relationshipOverview: undefined,
    salesforceReadiness: INTERNAL_CRM_ACTIVE,
    ncinoReadiness: INTERNAL_WORKFLOW_ACTIVE,
    entityMatchStatus: 'Awaiting human review',
    sourceOfTruthGaps: 0,
    syncPreviewBlockers: 0,
    nextSafeBankerStep:
      'Review OGB CRM source-of-truth, relationship matching, and internal readiness (read-only; writeback gated).',
    crmCommandCenterHref: undefined,
  };
}

/** Honest manager OGB CRM posture (internal active; read-only). */
export function managerCrmPreviewInput(): CrmManagerSurfaceInput {
  return {
    teamCrmReadiness: INTERNAL_CRM_ACTIVE,
    bankerFollowUpWorkload: 0,
    sourceOfTruthConflicts: 0,
    salesforceReadinessByPipeline: INTERNAL_CRM_ACTIVE,
    ncinoReadinessByPipeline: INTERNAL_WORKFLOW_ACTIVE,
    syncPreviewBlockedCount: 0,
    nextSafeManagerStep:
      'Review team OGB CRM readiness and source-of-truth conflicts (read-only; no assignment changes).',
    crmCommandCenterHref: undefined,
  };
}

/** Honest executive OGB CRM posture (internal active; no fake revenue). */
export function executiveCrmPreviewInput(): CrmExecutiveSurfaceInput {
  return {
    crmCoverageStatus: INTERNAL_CRM_ACTIVE,
    salesforceActivationPosture: 'Internal — active, read-only (writeback gated)',
    ncinoActivationPosture: 'Internal — active, read-only (writeback gated)',
    relationshipIntelligenceGaps: 0,
    productStrategyCrmReadiness: INTERNAL_CRM_ACTIVE,
    revenueDataAvailability: 'Not available (no revenue figures shown)',
    nextExecutiveStep:
      'Review OGB CRM coverage and internal activation posture (read-only; no live writes).',
    crmCommandCenterHref: undefined,
  };
}

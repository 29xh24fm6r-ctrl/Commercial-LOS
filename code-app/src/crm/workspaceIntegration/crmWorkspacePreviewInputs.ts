/**
 * BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 — honest CRM preview inputs.
 *
 * The CRM working surfaces (banker / manager / executive) are pure presentational
 * components that take fully-formed read-only inputs. The live workspaces have no
 * CRM data provider wired in yet, so these builders return an HONEST preview /
 * not-yet-connected posture — NOT fabricated readiness or fake sync success. Every
 * readiness field states it is preview / not connected, all counts are an honest
 * zero (nothing has been loaded), and the next step is a real, safe review action
 * with no live connection. No fetch, no write, no credentials, no fake data.
 */

import type { CrmBankerSurfaceInput } from './CrmBankerWorkingSurface';
import type { CrmManagerSurfaceInput } from './CrmManagerWorkingSurface';
import type { CrmExecutiveSurfaceInput } from './CrmExecutiveWorkingSurface';

const NOT_CONNECTED = 'Preview — external connection disabled';

/** Honest banker CRM preview posture (no provider data available yet). */
export function bankerCrmPreviewInput(): CrmBankerSurfaceInput {
  return {
    relationshipOverview: undefined,
    salesforceReadiness: NOT_CONNECTED,
    ncinoReadiness: NOT_CONNECTED,
    entityMatchStatus: 'Awaiting human review',
    sourceOfTruthGaps: 0,
    syncPreviewBlockers: 0,
    nextSafeBankerStep:
      'Review CRM source-of-truth, matching, sync preview, and dry-run posture (no live connection).',
    crmCommandCenterHref: undefined,
  };
}

/** Honest manager CRM preview posture (no provider data available yet). */
export function managerCrmPreviewInput(): CrmManagerSurfaceInput {
  return {
    teamCrmReadiness: NOT_CONNECTED,
    bankerFollowUpWorkload: 0,
    sourceOfTruthConflicts: 0,
    salesforceReadinessByPipeline: NOT_CONNECTED,
    ncinoReadinessByPipeline: NOT_CONNECTED,
    syncPreviewBlockedCount: 0,
    nextSafeManagerStep:
      'Review team CRM readiness and source-of-truth conflicts (read-only; no assignment changes).',
    crmCommandCenterHref: undefined,
  };
}

/** Honest executive CRM preview posture (no provider data; no fake revenue). */
export function executiveCrmPreviewInput(): CrmExecutiveSurfaceInput {
  return {
    crmCoverageStatus: NOT_CONNECTED,
    salesforceActivationPosture: 'Disabled by default (read-only)',
    ncinoActivationPosture: 'Disabled by default (read-only)',
    relationshipIntelligenceGaps: 0,
    productStrategyCrmReadiness: NOT_CONNECTED,
    revenueDataAvailability: 'Not available (no revenue figures shown)',
    nextExecutiveStep:
      'Review CRM coverage and activation posture (read-only; no live writes).',
    crmCommandCenterHref: undefined,
  };
}

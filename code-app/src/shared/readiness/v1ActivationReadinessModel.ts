/**
 * Phase 203 — V1 activation readiness model.
 *
 * PURE, READ-ONLY, OFFLINE, DETERMINISTIC. `deriveV1ActivationReadiness()`
 * answers, inside the product, whether the OGB LOS is ready for V1 release. It
 * is derived only from existing gate constants — no SDK call, no Dataverse
 * read/write, no fetch, no schema, and it flips no gate. Unsafe write categories
 * report GATED from their real constants; the OGB-native read surfaces report
 * ACTIVE; the overall posture mirrors the deterministic full-system posture.
 *
 * It lives under `src/shared/` and therefore must not import any role directory
 * (banker / manager / team / executive / admin) — Phase 48 isolation — so the
 * deterministic safe statuses are stated here rather than imported from the
 * admin-side activation / launch models (which report the same values).
 */

import { CRM_LIVE_PERSISTENCE_ENABLED } from '../../crm/crmFeatureFlags';
import { BANKER_CREATE_PILOT_ENABLED } from '../../deals/bankerCreatePilotConfig';
import {
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../../deals/dealOriginationFeatureFlags';

export type OverallPosture = 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
export type ActiveStatus = 'ACTIVE' | 'INACTIVE';
export type CapabilityStatus = 'ENABLED' | 'GATED';
export type RequirementStatus = 'NOT_REQUIRED' | 'REQUIRED';
export type PresenceStatus = 'NOT_PRESENT' | 'PRESENT';

export interface V1ActivationReadiness {
  readonly overallPosture: OverallPosture;
  readonly ogbCrmStatus: ActiveStatus;
  readonly internalLendingWorkflowStatus: ActiveStatus;
  readonly newDealCreatePilot: CapabilityStatus;
  readonly crmWriteback: CapabilityStatus;
  readonly borrowerCommunications: CapabilityStatus;
  readonly checklistGeneration: CapabilityStatus;
  readonly broadWorkflowWrites: CapabilityStatus;
  readonly externalConnectors: RequirementStatus;
  readonly fakeSampleDataDependency: PresenceStatus;
  readonly schemaMigrationDependency: RequirementStatus;
  readonly permissionRouteExpansion: PresenceStatus;
}

const active = (b: boolean): ActiveStatus => (b ? 'ACTIVE' : 'INACTIVE');
const cap = (enabled: boolean): CapabilityStatus => (enabled ? 'ENABLED' : 'GATED');

export function deriveV1ActivationReadiness(): V1ActivationReadiness {
  return {
    // Deterministic overall posture — mirrors the full-system launch
    // recommendation (CONDITIONAL_GO): foundation active + pilot enabled, with
    // unsafe write categories gated and final operator signoff pending.
    overallPosture: 'CONDITIONAL_GO',

    // OGB-native internal read surfaces are active (Phase 202 posture).
    ogbCrmStatus: active(true),
    internalLendingWorkflowStatus: active(true),

    // Certified pilot (from the pilot switch constant).
    newDealCreatePilot: cap(Boolean(BANKER_CREATE_PILOT_ENABLED)),

    // Unsafe write categories — derived from their real gate constants.
    crmWriteback: cap(Boolean(CRM_LIVE_PERSISTENCE_ENABLED)), // false → GATED
    borrowerCommunications: cap(Boolean(BORROWER_MESSAGING_ENABLED)),
    checklistGeneration: cap(Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED)),
    // Workflow derivers are read-only decision support (no write enablement seam).
    broadWorkflowWrites: 'GATED',

    // Release-safety posture — OGB-native, no external dependency.
    externalConnectors: 'NOT_REQUIRED',
    fakeSampleDataDependency: 'NOT_PRESENT',
    schemaMigrationDependency: 'NOT_REQUIRED',
    permissionRouteExpansion: 'NOT_PRESENT',
  };
}

import {
  AUTO_STAGE_ADVANCE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { bankerCreatePilotGateValues } from '../deals/bankerCreatePilotConfig';

/**
 * Phase 241 — Production environment verification artifact.
 *
 * This is the OPERATOR-OWNED certification layer that gates the live cutover. Each
 * toggle in PRODUCTION_ENVIRONMENT_CERTIFICATION asserts that the operator has
 * COMPLETED AND VERIFIED the specific external environment steps for that domain
 * (listed in ENVIRONMENT_VERIFICATION_STEPS). These are NOT runtime probes and they
 * MUST NOT be set true without the real evidence — doing so would be a fake
 * verification, which is forbidden.
 *
 * A live domain "resolves enabled" ONLY when BOTH are true:
 *   1. the operator certification toggle (environment work done + verified), AND
 *   2. the underlying feature gate flag (read live from source).
 * Both default to false, so every domain is disabled by default and full launch is
 * not achieved. Flip the certification toggle AND the matching feature flag together
 * only after the listed external steps exist.
 */

export const ACTIVATION_DOMAIN_KEYS = [
  'newDealCreate',
  'crmWriteback',
  'documentChecklist',
  'borrowerSend',
  'stageAdvancement',
  'portfolioBoarding',
] as const;
export type ActivationDomainKey = (typeof ACTIVATION_DOMAIN_KEYS)[number];

export type DomainEnvironmentCertification = Record<ActivationDomainKey, boolean>;

export const DOMAIN_LABELS: Record<ActivationDomainKey, string> = {
  newDealCreate: 'New Deal create',
  crmWriteback: 'CRM writeback / live persistence',
  documentChecklist: 'Document checklist generation',
  borrowerSend: 'Borrower communication send',
  stageAdvancement: 'Stage advancement',
  portfolioBoarding: 'Portfolio boarding live persistence',
};

/**
 * OPERATOR-OWNED certification toggles. Setting a toggle true asserts the operator
 * has finished AND verified the matching ENVIRONMENT_VERIFICATION_STEPS; never set
 * true to "make the dashboard green". No value here is a runtime probe.
 *
 * Phase 242A — `newDealCreate` is certified true based on RECORDED production smoke
 * evidence (docs/PHASE_227_V1_PRODUCTION_RELEASE_SMOKE.md and
 * docs/PHASE_228A_PRODUCTION_CORE_ORIGINATION_DEPLOYMENT_SMOKE.md): the INTAKE/Open
 * production-approved Stage/Status rows were seeded + verified and single-record
 * create smokes PASSED. Banker New Deal create is already live-controlled through the
 * approved pilot switch (BANKER_CREATE_PILOT_ENABLED), so the global create-gate
 * constants intentionally STAY false (public + downstream provably off; one-line
 * rollback). The other five toggles remain false — their environment work is not done.
 */
// Phase 256B: all six domains are certified — New Deal create from the Phase 227/228A smoke,
// and the remaining five from their GO final-launch smoke artifacts under
// docs/operator-evidence/final-launch/ (validated by src/access/finalLaunchSmokeEvidence.ts:
// create/readback/update/cleanup, or delivery/audit for borrower send). A domain resolves
// enabled only when certified AND its gate flag is on; both now hold for all six.
export const PRODUCTION_ENVIRONMENT_CERTIFICATION: DomainEnvironmentCertification = Object.freeze({
  newDealCreate: true,
  crmWriteback: true,
  documentChecklist: true,
  borrowerSend: true,
  stageAdvancement: true,
  portfolioBoarding: true,
});

/** The exact external evidence/commands required before a domain may be certified true. */
export const ENVIRONMENT_VERIFICATION_STEPS: Record<ActivationDomainKey, readonly string[]> = {
  newDealCreate: [
    'Seed exactly one active Stage and one active Status row with new_productionapproved=true in cr664_dealstagereferences / cr664_dealstatusreferences (Maker Portal / Dataverse data op).',
    'Re-run Phase 225 reference verification to ready-production and record one single-record New Deal create smoke with rollback evidence.',
  ],
  crmWriteback: [
    'Verify the live CRM Dataverse schema against src/crm/crmDataverseSchemaPlan and capture a VerifiedCrmSchemaState (tables/columns/relationships/conflicts).',
    'Wire the live Dataverse transport into crmWriteback (createChecklistWriteDependency-style injection) and pass the runtime schema gate.',
  ],
  documentChecklist: [
    'Sign off the approved checklist rule set.',
    'Inject the live checklist write transport via createChecklistWriteDependency.',
  ],
  borrowerSend: [
    'Register the Office 365 Outlook connector in the Power Platform environment.',
    'Regenerate the SDK so the LIVE adapter binds the typed Office365OutlookService.SendEmailV2 call.',
    'Deploy with VITE_EMAIL_MODE=LIVE; certify the explicit banker-action, audited send path (connector acceptance is not delivery).',
  ],
  stageAdvancement: [
    'Inject the live stage transport + audit + timeline sinks into advanceWorkflowStage (via AdvanceWorkflowStageButton).',
    'Certify the end-to-end success + blocked + update-failed path.',
  ],
  portfolioBoarding: [
    'Verify the live boarding Dataverse schema against src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan and inject a VerifiedBoardingSchemaState.',
    'Enable the boarding route with an authorized operator and certify single-record boarding.',
  ],
};

/**
 * Read the live underlying gate state per domain.
 *
 * `newDealCreate` reflects the ACTUAL build-time enablement path: banker create is
 * gated by the approved pilot switch (Phase 182B), which supplies the create gate
 * values directly to the rollout instead of flipping the global governance
 * constants. The global constants (NEW_DEAL_CREATE_ADAPTER_ENABLED, etc.) stay false
 * by design — public + downstream create are provably off — so this reads the pilot
 * gate values rather than those constants. Runtime authorization, approved
 * references, and audit are still enforced fail-closed by the governed adapter at
 * submit. The remaining five are plain build-time flags, all false by default.
 */
export function readLiveGateFlags(): DomainEnvironmentCertification {
  const pilotCreateGates = bankerCreatePilotGateValues();
  return {
    newDealCreate:
      pilotCreateGates?.banker === true &&
      pilotCreateGates?.adapter === true &&
      pilotCreateGates?.intake === true,
    crmWriteback: Boolean(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED),
    documentChecklist: Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED),
    borrowerSend: Boolean(BORROWER_MESSAGING_ENABLED) && Boolean(BORROWER_EMAIL_TRANSPORT_ENABLED),
    stageAdvancement: Boolean(AUTO_STAGE_ADVANCE_ENABLED),
    portfolioBoarding: Boolean(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED),
  };
}

export interface DomainLiveResolution {
  readonly key: ActivationDomainKey;
  readonly label: string;
  /** Operator certified the environment work is done + verified. */
  readonly certified: boolean;
  /** The underlying feature gate flag is actually on. */
  readonly gateFlagOn: boolean;
  /** A gate resolves "live enabled" ONLY when certified AND gateFlagOn. */
  readonly enabled: boolean;
  /** Exact remaining steps while not enabled (verification + flip). */
  readonly missingSteps: readonly string[];
}

export interface ProductionEnvironmentVerification {
  readonly domains: readonly DomainLiveResolution[];
  readonly enabledCount: number;
  readonly allCertified: boolean;
  /** True only when all six domains resolve enabled (certified + gate flag on). */
  readonly fullLaunchReady: boolean;
}

export interface DeriveProductionEnvironmentVerificationInput {
  /** Override the operator certification toggles (tests / future operator config). */
  readonly certification?: Partial<DomainEnvironmentCertification>;
  /** Override the live gate-flag read (tests simulate post-flip state). */
  readonly gateFlags?: Partial<DomainEnvironmentCertification>;
}

export function deriveProductionEnvironmentVerification(
  input: DeriveProductionEnvironmentVerificationInput = {},
): ProductionEnvironmentVerification {
  const certification: DomainEnvironmentCertification = { ...PRODUCTION_ENVIRONMENT_CERTIFICATION, ...input.certification };
  const gateFlags: DomainEnvironmentCertification = { ...readLiveGateFlags(), ...input.gateFlags };

  const domains: DomainLiveResolution[] = ACTIVATION_DOMAIN_KEYS.map((key) => {
    const certified = certification[key] === true;
    const gateFlagOn = gateFlags[key] === true;
    const enabled = certified && gateFlagOn;
    const missingSteps: string[] = [];
    if (!certified) missingSteps.push(...ENVIRONMENT_VERIFICATION_STEPS[key]);
    if (certified && !gateFlagOn) missingSteps.push(`Flip the ${DOMAIN_LABELS[key]} feature gate after the certification evidence is recorded.`);
    return { key, label: DOMAIN_LABELS[key], certified, gateFlagOn, enabled, missingSteps };
  });

  const enabledCount = domains.filter((d) => d.enabled).length;
  return {
    domains,
    enabledCount,
    allCertified: domains.every((d) => d.certified),
    fullLaunchReady: enabledCount === ACTIVATION_DOMAIN_KEYS.length,
  };
}

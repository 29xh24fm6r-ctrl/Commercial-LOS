import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  BORROWER_EMAIL_TRANSPORT_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../deals/newDealCreateFeatureFlags';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 237A — Full system activation launch certification model.
 *
 * Pure, deterministic, READ-ONLY. Classifies each of the six live-write domains as
 * CERTIFIABLE_NOW / NEEDS_COMPLETION / NOT_SAFE_TO_ENABLE based on the ACTUAL code
 * inspected in the repo, reads the live feature-flag values to report the current
 * enabled state, and names the EXACT remaining blocker + operator unblock action
 * per domain. It enables nothing, flips no gate, fabricates no live readiness, and
 * never claims full launch is achieved unless every domain is genuinely enabled.
 *
 * Discovery result (Phase 237A): every domain already has a real governed adapter,
 * payload validation, audit metadata, and fail-closed handling in the repo. The
 * remaining blocker for ALL six is operator-owned ENVIRONMENT work that cannot be
 * performed or inferred from source — Dataverse schema verification (injected, never
 * faked), production reference-data seeding, Outlook connector registration, or SDK
 * regeneration. None are completable purely from the repo, so none are enabled here.
 */

export const ACTIVATION_DOMAIN_IDS = [
  'new-deal-create',
  'crm-writeback',
  'document-checklist-generation',
  'borrower-communication-send',
  'stage-advancement',
  'portfolio-boarding-persistence',
] as const;
export type ActivationDomainId = (typeof ACTIVATION_DOMAIN_IDS)[number];

export type ActivationClassification = 'CERTIFIABLE_NOW' | 'NEEDS_COMPLETION' | 'NOT_SAFE_TO_ENABLE';
export type ActivationStatus = 'enabled' | 'ready-to-enable' | 'blocked';

export interface ActivationDomainAssessment {
  readonly id: ActivationDomainId;
  readonly label: string;
  readonly classification: ActivationClassification;
  readonly status: ActivationStatus;
  /** The governing feature flag(s) for this live-write domain. */
  readonly flagNames: readonly string[];
  /** Current live value (read from source) — true only when intentionally enabled. */
  readonly flagEnabled: boolean;
  /** The real governed adapter/path that performs the write when certified. */
  readonly adapterPath: string;
  /** The fail-closed runtime gate that must pass before the live path runs. */
  readonly gatePath: string;
  /** Certification evidence already present in the repo. */
  readonly evidencePresent: readonly string[];
  /** Exact remaining blocker(s) — missing file/schema/adapter/connector/data. */
  readonly blockers: readonly string[];
  /** Exact operator action(s) to unblock (commands/files/fields). */
  readonly unblockActions: readonly string[];
  /** True only when the blocker can be cleared purely within the repo. */
  readonly repoCompletable: boolean;
  /**
   * Phase 237 (full-activation arc): the operator has reported the production
   * environment is provisioned for this domain. The remaining repo step is wiring
   * the live transport and the certified enablement flip; until that is done the
   * gate stays fail-closed, so this is reported, never treated as a live enable.
   */
  readonly operatorEnvironmentConfirmed: boolean;
}

export interface FullActivationLaunchCertification {
  readonly title: string;
  readonly subtitle: string;
  readonly domains: readonly ActivationDomainAssessment[];
  readonly enabledCount: number;
  readonly certifiableCount: number;
  readonly needsCompletionCount: number;
  readonly notSafeCount: number;
  /** Domains for which the operator reports the production environment is provisioned. */
  readonly environmentConfirmedCount: number;
  /** True ONLY when all six domains are genuinely enabled. Never faked. */
  readonly fullLaunchAchieved: boolean;
  readonly posture: string;
  readonly certifications: readonly string[];
}

/**
 * Static discovery assessment (Phase 237A), grounded in the inspected source. The
 * live flag value is read separately so the status updates automatically if an
 * operator later completes the environment work and enables the gate.
 */
interface DomainSpec {
  readonly id: ActivationDomainId;
  readonly label: string;
  readonly classification: ActivationClassification;
  readonly flagNames: readonly string[];
  readonly flagEnabled: boolean;
  readonly adapterPath: string;
  readonly gatePath: string;
  readonly evidencePresent: readonly string[];
  readonly blockers: readonly string[];
  readonly unblockActions: readonly string[];
  readonly repoCompletable: boolean;
  readonly operatorEnvironmentConfirmed: boolean;
}

function buildSpecs(): DomainSpec[] {
  return [
    {
      id: 'new-deal-create',
      label: 'New Deal create',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['NEW_DEAL_CREATE_ADAPTER_ENABLED', 'NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED', 'BANKER_NEW_DEAL_CREATE_ENABLED'],
      flagEnabled: Boolean(NEW_DEAL_CREATE_ADAPTER_ENABLED) && Boolean(BANKER_NEW_DEAL_CREATE_ENABLED),
      adapterPath: 'src/deals/newDealCreateAdapter.ts',
      gatePath: 'src/deals/newDealCreateEnablement.ts',
      evidencePresent: [
        'Governed create adapter with required-field validation and duplicate detection.',
        'Fail-closed enablement reader (disabled by default; production needs explicit approval).',
        'Phase 226 production-approval marker (new_productionapproved) wired into the reference readers.',
      ],
      blockers: [
        'No active production-approved Stage/Status reference rows exist in Dataverse (new_productionapproved=true).',
        'No explicit production rollout approval config + single-record smoke evidence.',
      ],
      unblockActions: [
        'Operator seeds exactly one active Stage and one active Status row with new_productionapproved=true in cr664_dealstagereferences / cr664_dealstatusreferences.',
        'Re-run Phase 225 reference verification to ready-production, then provide the approved production rollout config and record one single-record create smoke evidence.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: true,
    },
    {
      id: 'crm-writeback',
      label: 'CRM writeback / live persistence',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['CRM_LIVE_PERSISTENCE_ENABLED'],
      flagEnabled: Boolean(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED),
      adapterPath: 'src/crm/crmWritebackAdapter.ts',
      gatePath: 'src/crm/crmRuntimeSchemaGate.ts',
      evidencePresent: [
        'Phase 237G governed internal CRM writeback adapter (crmWriteback): allow-listed cr664_crm* entities only, raw-sensitive-field rejection, audit on every write, default-off and fail-closed — certified by success/disallowed-entity/disallowed-field/unauthorized/adapter-failure tests.',
        'Live Dataverse CRM adapter with schema/payload mapping and failure handling; fail-closed runtime schema gate comparing an injected verified-schema state to the plan.',
        'Persistence resolver returns a live adapter only when the gate passes and an operator is authorized.',
      ],
      blockers: [
        'No injected VerifiedCrmSchemaState confirming the live tables/columns/relationships match crmDataverseSchemaPlan with zero conflicts.',
        'The schema-verification loader is environment-owned; the gate never probes Dataverse and never fakes readiness.',
      ],
      unblockActions: [
        'Operator verifies the live CRM Dataverse schema against src/crm/crmDataverseSchemaPlan and injects the resulting VerifiedCrmSchemaState (tables/columns/relationships/conflicts).',
        'With the schema gate green and an authorized operator, enable CRM_LIVE_PERSISTENCE_ENABLED and certify the writeback success/failure/rollback tests.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: true,
    },
    {
      id: 'document-checklist-generation',
      label: 'Document checklist generation',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['DOCUMENT_CHECKLIST_GENERATION_ENABLED', 'DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED'],
      flagEnabled: Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED),
      adapterPath: 'src/workflow/checklistWriteDependency.ts',
      gatePath: 'src/deals/documentChecklistUiEnableReadiness.ts',
      evidencePresent: [
        'Phase 237E governed checklist write dependency (createChecklistWriteDependency): allow-listed cr664_documentname + cr664_Deal@odata.bind only, audit per row, default-off and fail-closed — certified by success/duplicate/unauthorized/missing-dependency/adapter-failure tests.',
        'Action already enforces authorization + duplicate detection and delegates the write to the injected dependency.',
        'Dual fail-closed gates (runtime DOCUMENT_CHECKLIST_GENERATION_ENABLED + UI action gate), both default false.',
      ],
      blockers: [
        'The approved checklist rule set is not signed off and both the runtime + UI action gates are intentionally false.',
        'The live checklist write transport is not injected into the workflow provider yet.',
      ],
      unblockActions: [
        'Sign off the approved checklist rule set, inject the live checklist write transport via createChecklistWriteDependency, then enable DOCUMENT_CHECKLIST_GENERATION_ENABLED + the UI action gate together.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: false,
    },
    {
      id: 'borrower-communication-send',
      label: 'Borrower communication send',
      classification: 'NOT_SAFE_TO_ENABLE',
      flagNames: ['BORROWER_MESSAGING_ENABLED', 'BORROWER_EMAIL_TRANSPORT_ENABLED'],
      flagEnabled: Boolean(BORROWER_MESSAGING_ENABLED) && Boolean(BORROWER_EMAIL_TRANSPORT_ENABLED),
      adapterPath: 'src/deals/emailDelivery/emailMode.ts',
      gatePath: 'src/deals/emailDelivery/emailMode.ts',
      evidencePresent: [
        'DRY_RUN / LIVE email mode with a clear "connector not yet registered" permanent failure in LIVE.',
        'Recipient certification + borrower-safe content rules; no Graph API, no tenant-admin permission.',
      ],
      blockers: [
        'The Office 365 Outlook connector is not registered, and the SDK is not regenerated with the typed connector call.',
        'Live send is a permanent fail-closed until the connector exists; no auto-send is permitted without explicit, audited user action.',
      ],
      unblockActions: [
        'Operator registers the Office 365 Outlook connector in the environment and regenerates the SDK so the LIVE adapter send method binds the typed connector call.',
        'Certify the explicit user-confirmation send path with audited acceptance (connector acceptance is not delivery) before enabling.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: false,
    },
    {
      id: 'stage-advancement',
      label: 'Stage advancement',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['AUTO_STAGE_ADVANCE_ENABLED'],
      flagEnabled: Boolean(AUTO_STAGE_ADVANCE_ENABLED),
      adapterPath: 'src/workflow/stageAdvanceWriteDependency.ts',
      gatePath: 'src/workflow/stageTransitionPolicy.ts',
      evidencePresent: [
        'Phase 237F governed stage-advancement write dependency (advanceWorkflowStage): enforces evaluateStageTransitionPolicy before any write, updates via injected transport, emits audit + timeline, default-off and fail-closed — certified by blocked/no-next-stage/success/update-failed/audit-partial/timeline-partial tests.',
        'No auto-advance: the explicit banker action supplies the requested next stage.',
      ],
      blockers: [
        'The live stage transport + audit + timeline sinks are not injected into the workflow provider yet.',
        'AUTO_STAGE_ADVANCE_ENABLED is intentionally false until the live sinks are wired and certified end-to-end.',
      ],
      unblockActions: [
        'Inject the live stage transport/audit/timeline sinks into AdvanceWorkflowStageButton via advanceWorkflowStage, then enable AUTO_STAGE_ADVANCE_ENABLED and certify the end-to-end success path.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: false,
    },
    {
      id: 'portfolio-boarding-persistence',
      label: 'Portfolio boarding live persistence',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED', 'PORTFOLIO_BOARDING_ROUTE_ENABLED'],
      flagEnabled: Boolean(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED),
      adapterPath: 'src/portfolioBoarding/resolvePortfolioLoanBoardingPersistenceAdapter.ts',
      gatePath: 'src/portfolioBoarding/portfolioBoardingRuntimeSchemaGate.ts',
      evidencePresent: [
        'Single-record boarding adapter with per-child-group written/skipped/failed reporting and audit.',
        'Fail-closed runtime schema gate comparing an injected verified-schema state to the boarding plan.',
      ],
      blockers: [
        'No injected VerifiedBoardingSchemaState confirming the live tables/columns/required-relationships match portfolioLoanBoardingDataverseSchemaPlan with zero conflicts.',
        'The schema-verification loader is environment-owned; the gate never probes Dataverse and never fakes readiness.',
      ],
      unblockActions: [
        'Operator verifies the live boarding Dataverse schema against src/portfolioBoarding/portfolioLoanBoardingDataverseSchemaPlan and injects the VerifiedBoardingSchemaState.',
        'With the schema gate green, the route enabled, and an authorized operator, enable PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED and certify the single-record boarding tests.',
      ],
      repoCompletable: false,
      operatorEnvironmentConfirmed: true,
    },
  ];
}

export function deriveFullActivationLaunchCertification(): FullActivationLaunchCertification {
  const domains: ActivationDomainAssessment[] = buildSpecs().map((s) => {
    // A domain is only "enabled" when its gate flag is actually on; otherwise it is
    // "blocked" (no domain is CERTIFIABLE_NOW from the repo). Never "ready" on a fake.
    const status: ActivationStatus = s.flagEnabled
      ? 'enabled'
      : s.classification === 'CERTIFIABLE_NOW'
        ? 'ready-to-enable'
        : 'blocked';
    return { ...s, status };
  });

  const enabledCount = domains.filter((d) => d.status === 'enabled').length;
  const certifiableCount = domains.filter((d) => d.classification === 'CERTIFIABLE_NOW').length;
  const needsCompletionCount = domains.filter((d) => d.classification === 'NEEDS_COMPLETION').length;
  const notSafeCount = domains.filter((d) => d.classification === 'NOT_SAFE_TO_ENABLE').length;
  const environmentConfirmedCount = domains.filter((d) => d.operatorEnvironmentConfirmed).length;
  const fullLaunchAchieved = enabledCount === ACTIVATION_DOMAIN_IDS.length;

  return {
    title: 'Full System Activation Launch Certification',
    subtitle: 'Live-write activation status across the six internal CRM + LOS domains',
    domains,
    enabledCount,
    certifiableCount,
    needsCompletionCount,
    notSafeCount,
    environmentConfirmedCount,
    fullLaunchAchieved,
    posture: fullLaunchAchieved
      ? 'All six live-write domains are certified and enabled.'
      : `Full launch not yet achieved: ${enabledCount} of ${ACTIVATION_DOMAIN_IDS.length} live-write domains enabled. Certified governed write adapters now exist for document checklist generation, stage advancement, and internal CRM writeback (default-off, fail-closed, tested). ${environmentConfirmedCount} domain(s) are operator-confirmed environment-ready; their remaining repo step is wiring the live transport and the certified enablement flip, which is deferred so the fail-closed governance stays intact. No gate is flipped and no live readiness is faked.`,
    certifications: [
      'No live-write domain is enabled without a real adapter/path and certified success + failure tests.',
      'No live readiness is faked: schema gates require an injected verified state and never probe or fabricate.',
      'No feature gate is flipped by this certification; every gate remains at its source default.',
      'Governed write adapters (checklist, stage advancement, internal CRM writeback) are default-off and fail-closed until an operator wires the live transport and flips the certified gate.',
      'No external Salesforce or nCino dependency is implied; all paths are internal OGB CRM / internal lending workflow.',
    ],
  };
}

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
}

export interface FullActivationLaunchCertification {
  readonly title: string;
  readonly subtitle: string;
  readonly domains: readonly ActivationDomainAssessment[];
  readonly enabledCount: number;
  readonly certifiableCount: number;
  readonly needsCompletionCount: number;
  readonly notSafeCount: number;
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
    },
    {
      id: 'crm-writeback',
      label: 'CRM writeback / live persistence',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['CRM_LIVE_PERSISTENCE_ENABLED'],
      flagEnabled: Boolean(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED),
      adapterPath: 'src/crm/crmLiveDataverseAdapter.ts',
      gatePath: 'src/crm/crmRuntimeSchemaGate.ts',
      evidencePresent: [
        'Live Dataverse CRM adapter with schema/payload mapping and failure handling.',
        'Fail-closed runtime schema gate that compares an injected verified-schema state to the plan.',
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
    },
    {
      id: 'document-checklist-generation',
      label: 'Document checklist generation',
      classification: 'NEEDS_COMPLETION',
      flagNames: ['DOCUMENT_CHECKLIST_GENERATION_ENABLED', 'DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED'],
      flagEnabled: Boolean(DOCUMENT_CHECKLIST_GENERATION_ENABLED),
      adapterPath: 'src/deals/documentChecklistUiEnableReadiness.ts',
      gatePath: 'src/deals/documentChecklistUiEnableReadiness.ts',
      evidencePresent: [
        'Dual fail-closed gates (runtime DOCUMENT_CHECKLIST_GENERATION_ENABLED + UI action gate), both default false.',
        'Tightly-scoped write (cr664_documentname + cr664_Deal@odata.bind only) with an explicit forbidden-after-enablement list.',
      ],
      blockers: [
        'The deterministic checklist generation adapter + approved checklist rule set are not certified (success/failure/audit tests).',
        'Both the runtime and UI action gates are intentionally false until that certification clears.',
      ],
      unblockActions: [
        'Certify the deterministic checklist generation adapter (preview = written items, duplicate prevention, audit) and the approved checklist rule set.',
        'Then enable DOCUMENT_CHECKLIST_GENERATION_ENABLED and the UI action gate together.',
      ],
      repoCompletable: false,
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
    },
    {
      id: 'stage-advancement',
      label: 'Stage advancement',
      classification: 'NOT_SAFE_TO_ENABLE',
      flagNames: ['AUTO_STAGE_ADVANCE_ENABLED'],
      flagEnabled: Boolean(AUTO_STAGE_ADVANCE_ENABLED),
      adapterPath: 'src/activation/stageProgressionActivation.ts',
      gatePath: 'src/activation/stageProgressionActivation.ts',
      evidencePresent: [
        'Governed advanceStage adapter seam with typed outcomes (resolver_not_ready / no_next_stage / stale_stage / audit+timeline partial-success).',
        'Explicit stage guard and deterministic next-stage resolution by order.',
      ],
      blockers: [
        'The stage reference data source + deterministic order/sequence field are not registered/regenerated, so the ordering contract is unproven.',
        'No injected advance-stage transport + audit + timeline sinks for a live write.',
      ],
      unblockActions: [
        'Operator registers the stage reference data source with a deterministic order field and regenerates the SDK (Phase 215).',
        'Wire the advanceStage transport/audit/timeline sinks and certify the success + stale + no-next-stage tests before enabling AUTO_STAGE_ADVANCE_ENABLED.',
      ],
      repoCompletable: false,
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
  const fullLaunchAchieved = enabledCount === ACTIVATION_DOMAIN_IDS.length;

  return {
    title: 'Full System Activation Launch Certification',
    subtitle: 'Live-write activation status across the six internal CRM + LOS domains',
    domains,
    enabledCount,
    certifiableCount,
    needsCompletionCount,
    notSafeCount,
    fullLaunchAchieved,
    posture: fullLaunchAchieved
      ? 'All six live-write domains are certified and enabled.'
      : `Full launch not yet achieved: ${enabledCount} of ${ACTIVATION_DOMAIN_IDS.length} live-write domains enabled. Every remaining domain has a real governed adapter in the repo but is blocked on operator-owned environment certification (Dataverse schema verification, production reference seeding, Outlook connector registration, or SDK regeneration). No gate is flipped and no live readiness is faked.`,
    certifications: [
      'No live-write domain is enabled without a real adapter/path and certified success + failure tests.',
      'No live readiness is faked: schema gates require an injected verified state and never probe or fabricate.',
      'No feature gate is flipped by this certification; every gate remains at its source default.',
      'No external Salesforce or nCino dependency is implied; all paths are internal OGB CRM / internal lending workflow.',
    ],
  };
}

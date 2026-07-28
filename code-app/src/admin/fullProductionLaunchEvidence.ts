import {
  ACTIVATION_DOMAIN_KEYS,
  DOMAIN_LABELS,
  deriveProductionEnvironmentVerification,
  type ActivationDomainKey,
} from './productionEnvironmentVerification';
import { deriveChecklistSignoffReadiness } from './checklistSignoffEvidence';
import { deriveOutlookConnectorReadiness } from './outlookConnectorEvidence';

/**
 * Phase 243 — Full production CRM + LOS live activation evidence ledger.
 *
 * Pure, deterministic, READ-ONLY. This records the RECORDED operator environment
 * evidence for the full six-domain production cutover and ties the launch decision to
 * the fail-closed Phase 241 verification (the single source of truth). It flips NO
 * gate, performs NO write, and NEVER fabricates a PASS.
 *
 * The per-domain `environmentStatus` values are transcribed from a RECORDED run of the
 * read-only scripts in scripts/activation/ (collect-activation-evidence.ps1) at the
 * commit + timestamp below. They are operator evidence, not runtime probes: update
 * them only by transcribing a NEW recorded verification run, never to "make the
 * dashboard green". A domain may only become certified/enabled (in
 * productionEnvironmentVerification) AFTER its environment evidence reads PASS, its
 * controlled smoke is recorded, and its governed gate is flipped — so a PASS here is a
 * prerequisite, not an activation.
 */

/** PASS = prerequisites present; BLOCKED = required artifact missing; UNKNOWN = partial / manual signoff pending. */
export type EnvironmentEvidenceStatus = 'PASS' | 'BLOCKED' | 'UNKNOWN';

/** Commit + timestamp of the recorded verification run transcribed below. */
export const ENVIRONMENT_EVIDENCE_COMMIT = '54906ce';
export const ENVIRONMENT_EVIDENCE_VERIFIED_AT = '2026-07-28T12:50:10-04:00';

export interface DomainEnvironmentEvidence {
  readonly key: ActivationDomainKey;
  readonly label: string;
  /** Recorded read-only verification status for the environment prerequisites. */
  readonly environmentStatus: EnvironmentEvidenceStatus;
  /** The verification script that produced the status (null = certified via prior smoke). */
  readonly verificationScript: string | null;
  /** The recorded machine evidence line from the verification run. */
  readonly evidenceLine: string;
  /** Exact operator/portal actions still required before this domain can be certified. */
  readonly missingOperatorActions: readonly string[];
  /** One-line rollback control (disable) for this domain. */
  readonly rollbackControl: string;
}

/**
 * RECORDED environment evidence (transcribed from collect-activation-evidence.ps1 at
 * ENVIRONMENT_EVIDENCE_COMMIT / ENVIRONMENT_EVIDENCE_VERIFIED_AT). Four domains are not
 * PASS — their prerequisites are operator/portal work that cannot be performed or faked
 * from the repository.
 */
export const PRODUCTION_LAUNCH_EVIDENCE: Record<ActivationDomainKey, DomainEnvironmentEvidence> = {
  newDealCreate: {
    key: 'newDealCreate',
    label: DOMAIN_LABELS.newDealCreate,
    environmentStatus: 'PASS',
    verificationScript: null,
    evidenceLine:
      'Phase 227/228A production smoke PASSED; live-controlled via the approved banker pilot (BANKER_CREATE_PILOT_ENABLED).',
    missingOperatorActions: [],
    rollbackControl: 'Set BANKER_CREATE_PILOT_ENABLED to false in src/deals/bankerCreatePilotConfig.ts.',
  },
  crmWriteback: {
    key: 'crmWriteback',
    label: DOMAIN_LABELS.crmWriteback,
    environmentStatus: 'PASS',
    verificationScript: 'scripts/activation/verify-crm-schema.ps1',
    evidenceLine: '[243][verify-crm-spine] STATUS=PASS services=5/5 datasources=5/5 live=5/5; [242B][crm-schema] STATUS=PASS present=5/5 datasource=True',
    missingOperatorActions: [
      'Technical prerequisites PASS at commit 54906ce (5/5 generated Cr664_crm*Service.ts services, 5/5 data sources registered, live 5/5); governed-adapter cutover smoke is recorded HIGH and the live gate is armed.',
    ],
    rollbackControl: 'Set CRM_LIVE_PERSISTENCE_ENABLED to false.',
  },
  documentChecklist: {
    key: 'documentChecklist',
    label: DOMAIN_LABELS.documentChecklist,
    environmentStatus: 'PASS',
    verificationScript: 'scripts/activation/verify-checklist-rules.ps1',
    evidenceLine: '[251][checklist-rules] modules=3/3 datasource=True signoff=RECORDED (lending owner, 2026-06-25); live gate still false',
    missingOperatorActions: [
      'Lending-owner rule-set signoff is RECORDED (docs/operator-evidence/DOCUMENT_CHECKLIST_LENDING_OWNER_SIGNOFF_2026-06-25.md); modules + cr664_documentchecklists data source present.',
      'Remaining: inject the live checklist write transport via createChecklistWriteDependency, record a controlled smoke, then enable DOCUMENT_CHECKLIST_GENERATION_ENABLED + the UI action gate together (separate governed step).',
    ],
    rollbackControl: 'Set DOCUMENT_CHECKLIST_GENERATION_ENABLED to false.',
  },
  borrowerSend: {
    key: 'borrowerSend',
    label: DOMAIN_LABELS.borrowerSend,
    environmentStatus: 'PASS',
    verificationScript: 'scripts/activation/verify-outlook-connector.ps1',
    evidenceLine: '[250][outlook-connector] STATUS=PASS service=True registered=True (power.config.json apis/shared_office365)',
    missingOperatorActions: [
      'Office 365 Outlook connector registered in power.config.json (apis/shared_office365 / new_Office365OutlookCommercialLOS) and the generated service is present (verify-outlook-connector STATUS=PASS).',
      'Remaining: deploy with VITE_EMAIL_MODE=LIVE and certify the explicit banker-action audited send path (connector acceptance is not delivery; no auto-send), then flip the governed borrower-send gate.',
    ],
    rollbackControl:
      'Set BORROWER_MESSAGING_ENABLED + BORROWER_EMAIL_TRANSPORT_ENABLED to false; deploy with VITE_EMAIL_MODE=DRY_RUN.',
  },
  stageAdvancement: {
    key: 'stageAdvancement',
    label: DOMAIN_LABELS.stageAdvancement,
    environmentStatus: 'PASS',
    verificationScript: 'scripts/activation/verify-stage-advancement-sinks.ps1',
    evidenceLine: '[242B][stage-sinks] STATUS=PASS sinks=3/3',
    missingOperatorActions: [
      'Sinks PASS (3/3); governed-adapter cutover smokes pass (Phase 245). Inject the live stage transport + audit + timeline sinks into AdvanceWorkflowStageButton via advanceWorkflowStage.',
      'Record controlled single-record advancement + blocked-transition + update-failed smokes, then enable the governed explicit-advancement gate (AUTO_STAGE_ADVANCE_ENABLED). Production use is governed explicit advancement, never uncontrolled automatic movement.',
    ],
    rollbackControl: 'Set AUTO_STAGE_ADVANCE_ENABLED to false (governed explicit-advancement gate).',
  },
  portfolioBoarding: {
    key: 'portfolioBoarding',
    label: DOMAIN_LABELS.portfolioBoarding,
    environmentStatus: 'PASS',
    verificationScript: 'scripts/activation/verify-portfolio-boarding-schema.ps1',
    evidenceLine: '[243][verify-portfolio-boarding] STATUS=PASS services=13/13 datasources=13/13 live=13/13; [242B][portfolio-boarding] STATUS=PASS service=True datasource=True',
    missingOperatorActions: [
      'Technical prerequisites PASS at commit 54906ce (13/13 generated boarded-loan + child-group services, 13/13 data sources registered, live 13/13); governed-adapter cutover smoke is recorded HIGH and the live gate + route are armed.',
    ],
    rollbackControl: 'Set PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED + the portfolio boarding route to false.',
  },
};

export interface DomainLaunchEvidenceResolution extends DomainEnvironmentEvidence {
  /** From the fail-closed Phase 241 verification: operator certification recorded. */
  readonly certified: boolean;
  /** From the verification: the live gate is on. */
  readonly gateFlagOn: boolean;
  /** From the verification: the domain is live (certified AND gate on). */
  readonly enabled: boolean;
}

export interface FullProductionLaunchEvidence {
  readonly commit: string;
  readonly verifiedAt: string;
  readonly domains: readonly DomainLaunchEvidenceResolution[];
  /** Domains whose environment prerequisites read PASS. */
  readonly environmentPassCount: number;
  /** Live domains (from the fail-closed verification). */
  readonly enabledCount: number;
  /** Domains whose environment evidence is not PASS (operator work outstanding). */
  readonly blockingDomains: readonly ActivationDomainKey[];
  /**
   * True ONLY when the Phase 241 verification reports every domain live. Tied to the
   * single source of truth — never set independently, never faked.
   */
  readonly fullLaunchAchieved: boolean;
  readonly summary: string;
}

export function deriveFullProductionLaunchEvidence(): FullProductionLaunchEvidence {
  const verification = deriveProductionEnvironmentVerification();
  const verByKey = new Map(verification.domains.map((d) => [d.key, d]));

  // Phase 249: the checklist + borrower environment statuses are DERIVED from the
  // signoff / Outlook-connector evidence,
  // not hardcoded — so the ledger reflects evaluating the actual operator evidence.
  const statusOverride: Partial<Record<ActivationDomainKey, EnvironmentEvidenceStatus>> = {
    documentChecklist: deriveChecklistSignoffReadiness().status === 'SIGNED' ? 'PASS' : 'UNKNOWN',
    borrowerSend: deriveOutlookConnectorReadiness().status,
  };

  const domains: DomainLaunchEvidenceResolution[] = ACTIVATION_DOMAIN_KEYS.map((key) => {
    const evidence = PRODUCTION_LAUNCH_EVIDENCE[key];
    const ver = verByKey.get(key)!;
    const environmentStatus = statusOverride[key] ?? evidence.environmentStatus;
    return { ...evidence, environmentStatus, certified: ver.certified, gateFlagOn: ver.gateFlagOn, enabled: ver.enabled };
  });

  const environmentPassCount = domains.filter((d) => d.environmentStatus === 'PASS').length;
  const blockingDomains = domains.filter((d) => d.environmentStatus !== 'PASS').map((d) => d.key);
  const enabledCount = verification.enabledCount;
  const fullLaunchAchieved = verification.fullLaunchReady;

  const summary = fullLaunchAchieved
    ? `Full production launch achieved: all ${ACTIVATION_DOMAIN_KEYS.length} live-write domains certified, enabled, and smoke-recorded.`
    : `Full production launch NOT achieved: ${enabledCount} of ${ACTIVATION_DOMAIN_KEYS.length} live-write domains enabled. ${blockingDomains.length} domain(s) have outstanding operator/portal environment work (${blockingDomains.join(', ')}); their certifications stay false and their gates stay fail-closed. No gate is flipped and no PASS is faked.`;

  return {
    commit: ENVIRONMENT_EVIDENCE_COMMIT,
    verifiedAt: ENVIRONMENT_EVIDENCE_VERIFIED_AT,
    domains,
    environmentPassCount,
    enabledCount,
    blockingDomains,
    fullLaunchAchieved,
    summary,
  };
}

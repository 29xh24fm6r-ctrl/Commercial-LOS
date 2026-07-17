import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  DUPLICATE_DETECTION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 233 — Manager Operating Command Center model.
 *
 * Pure, deterministic, read-only. Projects the same CRM + LOS operating clarity
 * the banker now has onto the manager supervision context: pipeline supervision,
 * banker workload, CRM coverage, workflow bottlenecks, and the live-mutation gate
 * posture for New Deal intake, document readiness, CRM writeback, borrower
 * communication, and portfolio boarding. It reads existing feature-flag constants
 * only — no fetch, no SDK, no Dataverse mutation — and points managers at the
 * existing manager supervision surfaces rather than inventing a parallel engine.
 */

export type ManagerOperatingDomainState = 'operational' | 'review' | 'gated';

export interface ManagerOperatingDomain {
  readonly id: string;
  readonly label: string;
  readonly state: ManagerOperatingDomainState;
  readonly value: string;
  readonly summary: string;
  readonly nextAction: string;
}

export interface ManagerOperatingCommandCenterModel {
  readonly title: string;
  readonly subtitle: string;
  readonly posture: string;
  readonly domains: readonly ManagerOperatingDomain[];
  readonly supervisionActions: readonly string[];
  readonly supervisionAnchors: readonly string[];
  readonly certifications: readonly string[];
}

function gateState(enabled: boolean): ManagerOperatingDomainState {
  return enabled ? 'operational' : 'gated';
}

/**
 * Completion Phase C — manager dashboard label honesty.
 *
 * The manager layer reads each live-write FLAG (the first gate) but, by role isolation (Phase 48),
 * cannot import the launch authority and so cannot see its certification/evidence state. It must
 * never present a bare "enabled" for a live-write domain off the flag alone — that over-asserts a
 * live capability the runtime certification gate still governs. Armed → "<noun> armed — pending
 * certification"; off → the gated label. (The cross-panel coherence guard additionally fails CI if
 * this card's `state` ever disagrees with the authority.)
 */
function liveWriteValue(armed: boolean, armedNoun: string, gatedLabel: string): string {
  return armed ? `${armedNoun} armed — pending certification` : gatedLabel;
}

export function deriveManagerOperatingCommandCenterModel(): ManagerOperatingCommandCenterModel {
  const domains: ManagerOperatingDomain[] = [
    {
      id: 'pipeline-supervision',
      label: 'Pipeline supervision',
      state: 'operational',
      value: 'Active',
      summary:
        'Team pipeline health, deals-by-stage, closing forecast, and at-risk/blocked deals are available read-only from the manager command surfaces.',
      nextAction: 'Supervise pipeline movement from the Manager control panel and stage/forecast cards before directing banker work.',
    },
    {
      id: 'banker-workload',
      label: 'Banker workload balance',
      state: 'operational',
      value: 'Active',
      summary:
        'Per-banker workload, work queue, and production roll-up are visible so the manager can balance assignments without any live mutation.',
      nextAction: 'Use banker workload and work-queue surfaces to rebalance review effort; assignment writes remain governed.',
    },
    {
      id: 'crm-coverage',
      label: 'CRM relationship coverage',
      state: 'operational',
      value: 'Active',
      summary:
        'Internal OGB CRM team coverage, relationship memory, and the manager CRM working surface provide read-only relationship intelligence.',
      nextAction: 'Review CRM coverage gaps from the manager CRM working surface; live CRM writeback stays gated.',
    },
    {
      id: 'workflow-bottlenecks',
      label: 'Workflow bottlenecks',
      state: 'operational',
      value: 'Active',
      summary:
        'Internal lending workflow launch readiness and stage-level concentration highlight bottlenecks for supervision without altering deal state.',
      nextAction: 'Triage bottlenecks from the Manager Workflow Launch Readiness panel; stage advancement remains a certified gate.',
    },
    {
      id: 'new-deal-intake',
      label: 'New Deal intake gate posture',
      state: gateState(BANKER_NEW_DEAL_CREATE_ENABLED),
      value: BANKER_NEW_DEAL_CREATE_ENABLED ? 'Create enabled' : 'Create gated',
      summary:
        'New Deal intake readiness is visible to the manager. Banker create remains governed by production reference approval and certified create adapter gates.',
      nextAction: 'Confirm intake readiness and duplicate detection coverage; create stays gated until certified controls clear it.',
    },
    {
      id: 'document-readiness',
      label: 'Document checklist readiness',
      state: DOCUMENT_CHECKLIST_GENERATION_ENABLED ? 'operational' : 'gated',
      value: liveWriteValue(DOCUMENT_CHECKLIST_GENERATION_ENABLED, 'Generation', 'Generation gated'),
      summary:
        'Document readiness across the team is visible for supervision. Checklist generation remains gated unless explicitly certified.',
      nextAction: 'Review missing-document concentration; certify the generation adapter before enabling automated generation.',
    },
    {
      id: 'crm-writeback',
      label: 'CRM writeback gate',
      state: CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED ? 'operational' : 'gated',
      value: liveWriteValue(
        CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED,
        'Writeback',
        'Writeback gated',
      ),
      summary:
        'CRM coverage is read-side intelligence; live CRM persistence/writeback remains fail-closed unless explicitly enabled and certified.',
      nextAction: 'Require schema, adapter, policy, and operator certification before CRM writeback is enabled.',
    },
    {
      id: 'borrower-communication',
      label: 'Borrower communication gate',
      state: BORROWER_MESSAGING_ENABLED ? 'operational' : 'gated',
      value: liveWriteValue(BORROWER_MESSAGING_ENABLED, 'Send', 'Send gated'),
      summary:
        'Borrower-safe drafting/handoff is separate from live send. Send remains fail-closed by default across the team.',
      nextAction: 'Keep borrower outreach on governed handoff paths until live-send is certified.',
    },
    {
      // Factory Arc Phase 9: `state` stays flag-driven (matching the
      // certified-launch authority the cross-panel coherence guard checks
      // against — crossPanelLaunchCoherence.test.ts) so this card never
      // disagrees with the authority on whether the FULL, admin-governed
      // self-service boarding pipeline is live. What changed is the copy:
      // the old summary/nextAction implied NO boarding happens at all
      // until that pipeline is certified, which is false — two write
      // paths already work today with no flag at all: the manual "Board
      // existing loan" action (existingLoanEntryAdapter.ts, mounted via
      // ExistingPortfolioLoansPanel.tsx) and auto-boarding when a deal
      // reaches the Boarded stage (buildLiveStageAdvanceDeps.ts).
      id: 'portfolio-boarding',
      label: 'Portfolio boarding',
      state: gateState(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED),
      value: liveWriteValue(
        PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED,
        'Self-service boarding pipeline',
        'Certified pipeline gated — manual board + auto-board already live',
      ),
      summary:
        'The certified self-service boarding pipeline (full package, admin-governed) is not yet enabled. Loans already board to the portfolio today through the manual "Board existing loan" action and automatically once a deal reaches the Boarded stage.',
      nextAction: 'Use "Board existing loan" or advance a deal to Boarded for real boarding today; certify the full self-service pipeline before enabling it broadly.',
    },
  ];

  return {
    title: 'Manager Operating Command Center',
    subtitle: 'Team CRM + LOS supervision cockpit for the lending restart',
    posture:
      'Managers supervise pipeline, banker workload, CRM coverage, and workflow bottlenecks read-only. New Deal create, CRM writeback, stage advancement, borrower send, checklist generation, and the certified self-service portfolio boarding pipeline remain governed by certified gates — but loans already board today through the manual "Board existing loan" action and auto-boarding on stage advancement.',
    domains,
    supervisionActions: [
      'Start with pipeline supervision, banker workload, and CRM coverage.',
      'Triage workflow bottlenecks from the Manager Workflow Launch Readiness panel.',
      'Use duplicate detection and task intelligence as safe internal core supervision signals.',
      'Do not treat gated create/writeback/send/self-service-boarding controls as enabled until admin certification clears them — manual boarding and auto-board already work outside those gates.',
    ],
    supervisionAnchors: [
      'manager-bloomberg-control-panel',
      'manager-workflow-launch-readiness',
      'crm-manager-working-surface',
      'team-work-queue',
      'banker-workload-summary',
      'deals-by-stage',
    ],
    certifications: [
      `Duplicate detection safe internal core: ${String(DUPLICATE_DETECTION_ENABLED)}`,
      `Task generation safe internal core: ${String(TASK_GENERATION_ENABLED)}`,
      `Stage advancement live gate: ${String(AUTO_STAGE_ADVANCE_ENABLED)}`,
      `CRM route default: ${String(CRM_FEATURE_FLAG_DEFAULTS.CRM_ROUTE_ENABLED)}`,
      'No external platform sync or borrower send is triggered by this supervision dashboard.',
      'No hidden create/update/delete action is introduced by this command center.',
    ],
  };
}

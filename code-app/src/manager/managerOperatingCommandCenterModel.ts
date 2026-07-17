import {
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  DUPLICATE_DETECTION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
  AUTO_STAGE_ADVANCE_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { BANKER_CREATE_PILOT_ENABLED } from '../deals/bankerCreatePilotConfig';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';
import { summarizeTeamPipeline, dealTeamSeverity } from './teamSignals';
import type { TeamDeal, TeamBanker } from './managerQueries';

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
 *
 * Factory Arc Phase 14: `deriveManagerOperatingCommandCenterModel` now accepts
 * OPTIONAL already-loaded team data (the same `teamPipeline`/`teamBankers`
 * ManagerDataProvider already fetches for every other manager card — no new
 * query is introduced here) so the pipeline-supervision and banker-workload
 * domains show real counts instead of a static, uninformative "Active" string.
 * Still pure: this function never fetches; the caller (the component) supplies
 * whatever it already has, and a missing/loading value falls back to the prior
 * "Active" (available, not yet counted) text rather than fabricating a number.
 */

export type ManagerOperatingDomainState = 'operational' | 'review' | 'gated';

/** Factory Arc Phase 14: friendly Badge TEXT, distinct from the internal state
 *  discriminant. Fixes the pre-existing bug (see productionSurfaceInventory.ts)
 *  where the raw `ManagerOperatingDomainState` union member was rendered
 *  verbatim as the Badge's visible label, not just used to pick its color. */
export const MANAGER_OPERATING_DOMAIN_STATE_LABEL: Record<ManagerOperatingDomainState, string> = {
  operational: 'Live',
  review: 'Review needed',
  gated: 'Pending certification',
};

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

export interface ManagerOperatingLiveSupervisionData {
  /** Already-loaded team pipeline (ManagerDataProvider's `teamPipeline`, ready state only). */
  readonly teamPipeline?: readonly TeamDeal[];
  /** Already-loaded team roster (ManagerDataProvider's `teamBankers`, ready state only). */
  readonly teamBankers?: readonly TeamBanker[];
}

export function deriveManagerOperatingCommandCenterModel(
  live: ManagerOperatingLiveSupervisionData = {},
): ManagerOperatingCommandCenterModel {
  const pipelineCounts = live.teamPipeline ? summarizeTeamPipeline([...live.teamPipeline]) : null;
  const flaggedDealCount = live.teamPipeline
    ? live.teamPipeline.filter((d) => dealTeamSeverity(d).severity !== 'clear').length
    : null;
  const activeBankerCount = live.teamBankers ? live.teamBankers.filter((b) => b.active).length : null;

  const domains: ManagerOperatingDomain[] = [
    {
      id: 'pipeline-supervision',
      label: 'Pipeline supervision',
      state: 'operational',
      value: pipelineCounts
        ? `${pipelineCounts.total} active deal${pipelineCounts.total === 1 ? '' : 's'} · ${pipelineCounts.atRisk} at risk · ${pipelineCounts.blocked} blocked`
        : 'Active',
      summary:
        'Team pipeline health, deals-by-stage, closing forecast, and at-risk/blocked deals are available read-only from the manager command surfaces.',
      nextAction: 'Supervise pipeline movement from the Manager control panel and stage/forecast cards before directing banker work.',
    },
    {
      id: 'banker-workload',
      label: 'Banker workload balance',
      state: 'operational',
      value:
        activeBankerCount != null && flaggedDealCount != null
          ? `${activeBankerCount} active banker${activeBankerCount === 1 ? '' : 's'} · ${flaggedDealCount} flagged deal${flaggedDealCount === 1 ? '' : 's'}`
          : 'Active',
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
      // Factory Arc Phase 11: this card previously read
      // BANKER_NEW_DEAL_CREATE_ENABLED (a hard-`false` legacy constant no
      // reachable code path actually gates on) and reported New Deal create
      // as "gated" — factually wrong. The real, single switch the reachable
      // banker create surface (BankerNewDealCreate.tsx) gates on is
      // BANKER_CREATE_PILOT_ENABLED (bankerCreatePilotConfig.ts), which is
      // `true` today — an authorized banker reaches a live create flow right
      // now, with production reference approval, identity, and the governed
      // create adapter all still enforced at submit. Unlike the
      // portfolio-boarding/borrower-communication cards (Phase 9/10), this
      // domain's `state` itself needed to change, not just its copy — the
      // old flag-driven value disagreed with reality in the "says gated but
      // is actually live" direction, not the safe direction.
      id: 'new-deal-intake',
      label: 'New Deal intake',
      state: gateState(BANKER_CREATE_PILOT_ENABLED),
      value: BANKER_CREATE_PILOT_ENABLED ? 'Create enabled' : 'Create disabled',
      summary:
        'An authorized banker can create a new deal today through the governed CRM-first intake flow — identity, production reference approval, and the create adapter are enforced at submit, never bypassed.',
      nextAction: 'Direct bankers to the "+ New Deal" action; review any resolver_not_ready or create_failed outcomes with the reference-data owner.',
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
      // Factory Arc Phase 10: `state` stays flag-driven (matching the
      // certified-launch authority the cross-panel coherence guard checks
      // against — crossPanelLaunchCoherence.test.ts) so this card never
      // disagrees with the authority on whether the CERTIFIED, connector-
      // driven automated LIVE send is live. What changed is the copy: the
      // old summary/nextAction implied no borrower communication happens
      // at all until that pipeline is certified, which is false — bankers
      // already draft, copy, and (in HANDOFF/DRY_RUN mode) hand off
      // borrower updates and document requests today with full audit and
      // activity-history tracking, with no flag gate at all
      // (DraftBorrowerUpdateModal.tsx / RequestDocumentModal.tsx).
      id: 'borrower-communication',
      label: 'Borrower communication',
      state: BORROWER_MESSAGING_ENABLED ? 'operational' : 'gated',
      value: liveWriteValue(
        BORROWER_MESSAGING_ENABLED,
        'Automated send',
        'Certified automated send gated — drafting, copy, and handoff already live',
      ),
      summary:
        'Bankers already draft, copy, and hand off borrower updates and document requests today, fully audited. What is gated is the certified, connector-driven automated live send used at deal creation.',
      nextAction: 'Use the Borrower Update and Document Request modals for governed outreach today; certify the automated send pipeline before enabling it broadly.',
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
      'Managers supervise pipeline, banker workload, CRM coverage, and workflow bottlenecks read-only. New Deal create, CRM writeback, stage advancement, checklist generation, the certified automated borrower-send pipeline, and the certified self-service portfolio boarding pipeline remain governed by certified gates — but borrower drafting/copy/handoff and loan boarding (manual "Board existing loan" plus auto-board on stage advance) already work today.',
    domains,
    supervisionActions: [
      'Start with pipeline supervision, banker workload, and CRM coverage.',
      'Triage workflow bottlenecks from the Manager Workflow Launch Readiness panel.',
      'Use duplicate detection and task intelligence as safe internal core supervision signals.',
      'Do not treat gated create/writeback/automated-send/self-service-boarding controls as enabled until admin certification clears them — borrower drafting/copy/handoff and manual/auto-board loan boarding already work outside those gates.',
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
      // Factory Arc Phase 14: previously rendered as raw internal flag names
      // with a literal ": true"/": false" suffix (e.g. "Duplicate detection
      // safe internal core: true") — the same raw-identifier-as-UI-text
      // anti-pattern eliminated elsewhere in this arc. Rewritten as plain
      // assurance statements; still derived from the live flag values, just
      // never printing the flag's own name or a bare boolean.
      DUPLICATE_DETECTION_ENABLED
        ? 'Duplicate detection runs as a safe, internal-only supervision signal.'
        : 'Duplicate detection is not active.',
      TASK_GENERATION_ENABLED
        ? 'Task generation runs as a safe, internal-only supervision signal.'
        : 'Task generation is not active.',
      AUTO_STAGE_ADVANCE_ENABLED
        ? 'Stage advancement can move live on workflow completion.'
        : 'Stage advancement requires a manual action; nothing advances automatically.',
      CRM_FEATURE_FLAG_DEFAULTS.CRM_ROUTE_ENABLED
        ? 'The CRM route is reachable from this workspace.'
        : 'The CRM route is not reachable from this workspace.',
      'No external platform sync or borrower send is triggered by this supervision dashboard.',
      'No hidden create/update/delete action is introduced by this command center.',
    ],
  };
}

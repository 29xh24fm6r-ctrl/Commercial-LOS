import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  BORROWER_MESSAGING_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

/**
 * Phase 233 — Executive Restart Readiness Command Center model.
 *
 * Pure, deterministic, read-only. Summarizes the lending department restart
 * posture for leadership across banker, manager, admin, internal OGB CRM, internal
 * lending workflow, portfolio boarding, and the live-mutation gate categories.
 *
 * It is a clean PROJECTION over the SAME shared feature-flag sources the admin
 * activation readiness layer reads (CRM, deal-origination, and portfolio-boarding
 * flags) — it does not import a role directory (Phase 48 role isolation) and does
 * not duplicate the admin asset inventory. No fetch, no SDK, no Dataverse mutation,
 * no external sync, no hidden writes.
 */

export type ExecutiveRestartState = 'operating' | 'gated-activation' | 'blocked';

export interface ExecutiveRestartDomain {
  readonly id: string;
  readonly label: string;
  readonly state: ExecutiveRestartState;
  readonly headline: string;
  readonly detail: string;
}

export interface ExecutiveRestartReadinessModel {
  readonly title: string;
  readonly subtitle: string;
  readonly restartPosture: string;
  readonly overallState: ExecutiveRestartState;
  readonly domains: readonly ExecutiveRestartDomain[];
  readonly gatedActivationCategories: readonly string[];
  readonly leadershipAssurances: readonly string[];
}

function gateActivation(enabled: boolean): ExecutiveRestartState {
  return enabled ? 'operating' : 'gated-activation';
}

export function deriveExecutiveRestartReadinessModel(): ExecutiveRestartReadinessModel {
  const crmWritebackEnabled = CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED;
  const newDealEnabled = BANKER_NEW_DEAL_CREATE_ENABLED;
  const checklistEnabled = DOCUMENT_CHECKLIST_GENERATION_ENABLED;
  const borrowerSendEnabled = BORROWER_MESSAGING_ENABLED;
  const portfolioEnabled =
    PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED;

  const anyLiveGateOpen =
    crmWritebackEnabled || newDealEnabled || checklistEnabled || borrowerSendEnabled || portfolioEnabled;
  const allLiveGatesOpen =
    crmWritebackEnabled && newDealEnabled && checklistEnabled && borrowerSendEnabled && portfolioEnabled;
  const liveGateState: ExecutiveRestartState = allLiveGatesOpen
    ? 'operating'
    : anyLiveGateOpen
      ? 'gated-activation'
      : 'gated-activation';

  const domains: ExecutiveRestartDomain[] = [
    {
      id: 'banker-operating',
      label: 'Banker operating readiness',
      state: 'operating',
      headline: 'Operating',
      detail:
        'Bankers operate from a unified CRM + LOS command center: relationship intelligence, active deal workflow cockpit, daily actions, and readiness surfaces are live and read-only.',
    },
    {
      id: 'manager-operating',
      label: 'Manager supervision readiness',
      state: 'operating',
      headline: 'Operating',
      detail:
        'Managers supervise pipeline, banker workload, CRM coverage, and workflow bottlenecks from the manager operating command center; all live mutation stays gated.',
    },
    {
      id: 'admin-activation',
      label: 'Admin activation readiness',
      state: liveGateState,
      headline: liveGateState === 'operating' ? 'Operating' : 'Gated activation',
      detail:
        'Admin/operator activation readiness is assembled across CRM and lending workflow. Remaining write categories clear through certification, not source-default flips.',
    },
    {
      id: 'internal-crm',
      label: 'Internal OGB CRM',
      state: 'operating',
      headline: 'Operating',
      detail:
        'Internal OGB CRM relationship intelligence operates read-only across banker, manager, and executive surfaces; live CRM writeback remains a certified gate.',
    },
    {
      id: 'lending-workflow',
      label: 'Internal lending workflow',
      state: 'operating',
      headline: 'Operating',
      detail:
        'The internal lending workflow (deal cockpit, stage/document/credit readiness, manager launch controls) is assembled for restart; broad workflow writes remain gated.',
    },
    {
      id: 'portfolio-boarding',
      label: 'Portfolio boarding',
      state: gateActivation(portfolioEnabled),
      headline: portfolioEnabled ? 'Operating' : 'Gated activation',
      detail:
        'Portfolio boarding handoff/readiness is visible while booked-loan live persistence remains governed by explicit boarding gates.',
    },
    {
      id: 'live-gate-categories',
      label: 'Live gate categories',
      state: liveGateState,
      headline: liveGateState === 'operating' ? 'Operating' : 'Gated activation',
      detail:
        'New Deal create, CRM writeback, document checklist generation, borrower communication send, stage advancement, and portfolio boarding persistence remain fail-closed until certified.',
    },
  ];

  const overallState: ExecutiveRestartState = domains.some((d) => d.state === 'blocked')
    ? 'blocked'
    : domains.some((d) => d.state === 'gated-activation')
      ? 'gated-activation'
      : 'operating';

  const gatedActivationCategories = [
    ...(newDealEnabled ? [] : ['New Deal create']),
    ...(crmWritebackEnabled ? [] : ['CRM writeback / live persistence']),
    ...(checklistEnabled ? [] : ['Document checklist generation']),
    ...(borrowerSendEnabled ? [] : ['Borrower communication send']),
    ...(portfolioEnabled ? [] : ['Portfolio boarding live persistence']),
  ];

  return {
    title: 'Executive Restart Readiness Command Center',
    subtitle: 'Lending department restart readiness across CRM + LOS operating surfaces',
    restartPosture:
      'Restart readiness: banker and manager operating surfaces are live and read-only, admin activation readiness is assembled, and every live-write category remains gated activation until certified. No hidden writes are enabled by this view.',
    overallState,
    domains,
    gatedActivationCategories,
    leadershipAssurances: [
      'Operating readiness is visible across banker, manager, admin, and executive surfaces.',
      'Gated activation: live writes clear only through certified gates, never source-default flips.',
      'No hidden writes, external Salesforce or nCino sync, borrower outreach, or booking action is triggered by this readiness view.',
      'No route or permission is widened by the restart readiness command center.',
    ],
  };
}

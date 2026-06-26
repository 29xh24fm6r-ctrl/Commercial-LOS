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

export type BankerOperatingDomainState = 'operational' | 'review' | 'gated';

export interface BankerOperatingDomain {
  readonly id: string;
  readonly label: string;
  readonly state: BankerOperatingDomainState;
  readonly value: string;
  readonly summary: string;
  readonly nextAction: string;
}

export interface BankerOperatingCommandCenterModel {
  readonly title: string;
  readonly subtitle: string;
  readonly posture: string;
  readonly domains: readonly BankerOperatingDomain[];
  readonly todayActions: readonly string[];
  readonly dealCockpitAnchors: readonly string[];
  readonly certifications: readonly string[];
}

function gateState(enabled: boolean): BankerOperatingDomainState {
  return enabled ? 'operational' : 'gated';
}

export function deriveBankerOperatingCommandCenterModel(): BankerOperatingCommandCenterModel {
  const domains: BankerOperatingDomain[] = [
    {
      id: 'crm',
      label: 'CRM relationship intelligence',
      state: 'operational',
      value: 'Active',
      summary:
        'Relationship context, contact readiness, record ownership, and activity review are available from your operating surfaces.',
      nextAction: 'Review CRM intelligence and relationship context before advancing deal work.',
    },
    {
      id: 'loan-workflow',
      label: 'Loan workflow cockpit',
      state: 'operational',
      value: 'Active',
      summary:
        'Deal-level Loan Workflow Command Center, stage readiness, blockers, documents, tasks, and credit readiness are mounted in the authorized deal workspace.',
      nextAction: 'Open active deals and work from the workflow command center before changing stage posture.',
    },
    {
      id: 'daily-actions',
      label: 'Daily banker action queue',
      state: TASK_GENERATION_ENABLED ? 'operational' : 'review',
      value: TASK_GENERATION_ENABLED ? 'Core actions active' : 'Review-only',
      summary:
        'Safe internal task-generation intelligence is available for prioritization; destructive or external actions remain separate governed controls.',
      nextAction: 'Use daily actions to prioritize review work; do not assume external sends or live writes.',
    },
    {
      id: 'new-deal',
      label: 'New Deal intake',
      state: gateState(BANKER_NEW_DEAL_CREATE_ENABLED),
      value: BANKER_NEW_DEAL_CREATE_ENABLED ? 'Create enabled' : 'Create gated',
      summary:
        'New Deal intake/readiness is visible. Banker create remains governed by production reference approval and certified create adapter gates.',
      nextAction: 'Use intake readiness and duplicate detection; enable create only through certified pilot/go-live controls.',
    },
    {
      id: 'document-readiness',
      label: 'Document checklist readiness',
      state: DOCUMENT_CHECKLIST_GENERATION_ENABLED ? 'operational' : 'gated',
      value: DOCUMENT_CHECKLIST_GENERATION_ENABLED ? 'Generation enabled' : 'Generation gated',
      summary:
        'Document readiness is visible in the deal cockpit. Checklist generation remains gated unless explicitly certified.',
      nextAction: 'Review missing documents and request paths; certify generation adapter before enabling automated generation.',
    },
    {
      id: 'borrower-communications',
      label: 'Borrower communications',
      state: BORROWER_MESSAGING_ENABLED ? 'operational' : 'gated',
      value: BORROWER_MESSAGING_ENABLED ? 'Send enabled' : 'Send gated',
      summary:
        'Borrower-safe drafting and handoff controls are separate from live-send capability; send remains fail-closed by default.',
      nextAction: 'Draft/review borrower updates only through governed handoff paths until live-send is certified.',
    },
    {
      id: 'crm-writeback',
      label: 'CRM records',
      state: CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED ? 'operational' : 'gated',
      value: CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED ? 'Active' : 'Read-only',
      summary:
        'CRM is active and relationship records are available; the bank’s CRM is the relationship system of record.',
      nextAction: 'Use CRM relationship records in your daily work.',
    },
    {
      id: 'portfolio-handoff',
      label: 'Portfolio boarding handoff',
      state: PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED
        ? 'operational'
        : 'gated',
      value: PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED
        ? 'Boarding persistence enabled'
        : 'Boarding persistence gated',
      summary:
        'Portfolio handoff/readiness surfaces are available while booked-loan persistence remains governed by explicit boarding gates.',
      nextAction: 'Use handoff readiness; certify boarding persistence and evidence package before live boarding writes.',
    },
  ];

  return {
    title: 'Banker Operating Command Center',
    subtitle: 'Unified CRM + LOS workflow cockpit for daily lending operations',
    posture:
      'Banker can operate from CRM intelligence, active deal workflow, daily actions, and readiness surfaces. Live create, writeback, stage advancement, borrower send, checklist generation, and portfolio persistence remain governed by certified gates.',
    domains,
    todayActions: [
      'Start with CRM relationship intelligence and daily action queue.',
      'Work active deals from the Loan Workflow Command Center and deal cockpit.',
      'Use duplicate detection and task intelligence as safe internal core signals.',
      'Do not treat gated create/writeback/send/boarding controls as enabled until admin certification clears them.',
    ],
    dealCockpitAnchors: [
      'loan-workflow-command-center',
      'workstreams',
      'crm-relationship',
      'credit-memo',
      'tasks',
      'documents',
    ],
    certifications: [
      `Duplicate detection safe internal core: ${String(DUPLICATE_DETECTION_ENABLED)}`,
      `Task generation safe internal core: ${String(TASK_GENERATION_ENABLED)}`,
      `Stage advancement live gate: ${String(AUTO_STAGE_ADVANCE_ENABLED)}`,
      `CRM route default: ${String(CRM_FEATURE_FLAG_DEFAULTS.CRM_ROUTE_ENABLED)}`,
      'No external platform sync or borrower send is triggered by this dashboard.',
      'No hidden create/update/delete action is introduced by this command center.',
    ],
  };
}
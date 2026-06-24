import {
  deriveOgbCrmWorkflowActivation,
  type GateState,
} from './ogbCrmWorkflowActivationModel';
import { CRM_FEATURE_FLAG_DEFAULTS } from '../crm/crmFeatureFlags';
import {
  BANKER_NEW_DEAL_CREATE_ENABLED,
  TASK_GENERATION_ENABLED,
  DOCUMENT_CHECKLIST_GENERATION_ENABLED,
  DUPLICATE_DETECTION_ENABLED,
} from '../deals/dealOriginationFeatureFlags';
import { PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS } from '../portfolioBoarding/portfolioLoanBoardingFeatureFlags';

export type EliteReadinessState = 'ready' | 'gated' | 'blocked';

export interface EliteReadinessDomain {
  readonly id: string;
  readonly label: string;
  readonly state: EliteReadinessState;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly nextAction: string;
}

export interface EliteCrmLosActivationReadiness {
  readonly title: string;
  readonly posture: string;
  readonly goLiveState: EliteReadinessState;
  readonly domains: readonly EliteReadinessDomain[];
  readonly blockers: readonly string[];
  readonly operatorActions: readonly string[];
  readonly certifications: readonly string[];
}

function stateFromGate(gate: GateState): EliteReadinessState {
  return gate === 'enabled' ? 'ready' : 'gated';
}

export function deriveEliteCrmLosActivationReadiness(): EliteCrmLosActivationReadiness {
  const activation = deriveOgbCrmWorkflowActivation();

  const domains: EliteReadinessDomain[] = [
    {
      id: 'internal-crm',
      label: 'Internal OGB CRM operating layer',
      state: activation.internalCrmActive ? 'ready' : 'blocked',
      summary:
        'Internal relationship intelligence, command center, source-of-truth, activity timeline, matching, and banker/manager CRM surfaces are assembled for operating use.',
      evidence: [
        'CRM Command Center assets present',
        'Banker CRM working surface present',
        'Manager CRM working surface present',
        'Admin CRM onboarding/readiness controls present',
      ],
      nextAction: 'Use the CRM operating layer for internal relationship context while live writeback remains governed.',
    },
    {
      id: 'loan-workflow',
      label: 'nCino-style internal loan workflow layer',
      state: activation.internalWorkflowActive ? 'ready' : 'blocked',
      summary:
        'Internal lending workflow readiness, deal cockpit, stage/status readiness, document readiness, credit memo readiness, and manager workflow launch controls are assembled.',
      evidence: [
        'Loan workflow command/readiness assets present',
        'Deal cockpit assets present',
        'New Deal intake/admin readiness present',
        'Portfolio boarding handoff assets present',
      ],
      nextAction: 'Use workflow cockpit/readiness surfaces for operational restart and keep broad workflow writes gated.',
    },
    {
      id: 'crm-writeback',
      label: 'CRM writeback / live persistence',
      state: stateFromGate(activation.writebackStatus),
      summary:
        CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED
          ? 'CRM live persistence is enabled by configured gate.'
          : 'CRM live persistence is fail-closed by default; no hidden CRM records are created or synced.',
      evidence: [
        `CRM live persistence default: ${String(CRM_FEATURE_FLAG_DEFAULTS.CRM_LIVE_PERSISTENCE_ENABLED)}`,
        `CRM route default: ${String(CRM_FEATURE_FLAG_DEFAULTS.CRM_ROUTE_ENABLED)}`,
      ],
      nextAction: 'Certify schema, adapter, operator approval, and live-write policy before enabling CRM writeback.',
    },
    {
      id: 'new-deal-create',
      label: 'New Deal create / origination gate',
      state: BANKER_NEW_DEAL_CREATE_ENABLED ? 'ready' : 'gated',
      summary:
        BANKER_NEW_DEAL_CREATE_ENABLED
          ? 'Banker New Deal create is enabled by governed gate.'
          : 'Banker New Deal create is gated by default while intake, resolver, and readiness surfaces stay visible.',
      evidence: [
        `Banker New Deal create default: ${String(BANKER_NEW_DEAL_CREATE_ENABLED)}`,
        `Task generation safe internal core: ${String(TASK_GENERATION_ENABLED)}`,
        `Duplicate detection safe internal core: ${String(DUPLICATE_DETECTION_ENABLED)}`,
      ],
      nextAction: 'Complete production reference approval, governed create adapter certification, and pilot smoke before enabling.',
    },
    {
      id: 'document-checklist',
      label: 'Document checklist generation',
      state: DOCUMENT_CHECKLIST_GENERATION_ENABLED ? 'ready' : 'gated',
      summary:
        DOCUMENT_CHECKLIST_GENERATION_ENABLED
          ? 'Checklist generation is enabled by governed gate.'
          : 'Document checklist generation is gated by default; readiness and mapping can be reviewed without generation writes.',
      evidence: [
        `Document checklist generation default: ${String(DOCUMENT_CHECKLIST_GENERATION_ENABLED)}`,
      ],
      nextAction: 'Certify checklist generation adapter, pilot controls, and audit evidence before enabling generation.',
    },
    {
      id: 'portfolio-boarding',
      label: 'Portfolio boarding / booked loan handoff',
      state: PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED
        ? 'ready'
        : 'gated',
      summary:
        PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED
          ? 'Portfolio boarding live persistence is enabled by configured gate.'
          : 'Portfolio boarding workspace/readiness is assembled while live persistence remains fail-closed.',
      evidence: [
        `Portfolio live persistence default: ${String(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED)}`,
        `Portfolio command center default: ${String(PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED)}`,
      ],
      nextAction: 'Certify boarding schema, persistence adapter, evidence package, and operator authorization before enabling.',
    },
  ];

  const blockers = [
    ...activation.remainingBlockers,
    ...domains
      .filter((d) => d.state === 'gated')
      .map((d) => `${d.label}: ${d.nextAction}`),
  ];

  const goLiveState: EliteReadinessState = domains.some((d) => d.state === 'blocked')
    ? 'blocked'
    : blockers.length > 0
      ? 'gated'
      : 'ready';

  return {
    title: 'Elite CRM + LOS Full Activation Readiness',
    posture:
      'Internal OGB CRM and internal nCino-style lending workflow surfaces are assembled for operating use. Live writes, external sync, record creation, and boarding persistence remain governed by explicit certified gates.',
    goLiveState,
    domains,
    blockers,
    operatorActions: [
      'Use banker, manager, admin, and executive surfaces for operating readiness review.',
      'Clear remaining gated write categories through certification, not source-default flips.',
      'Confirm Dataverse schema, adapter, and operator authorization evidence before enabling live mutation.',
      'Run typecheck and full suite before every go-live candidate push.',
    ],
    certifications: [
      'No external Salesforce or nCino dependency is implied.',
      'No hidden live writes are enabled by this readiness layer.',
      'No external sync, borrower outreach, booking, or approval action is triggered.',
      'Readiness is visible across admin/manager/banker operating surfaces.',
    ],
  };
}
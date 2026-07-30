import {
  evaluateBankCreditGovernance,
  GOVERNED_CREDIT_ACTIONS,
  type ApprovalEvidence,
  type BankCreditGovernancePolicy,
  type CreditCaseFacts,
  type CreditGovernanceRule,
  type GovernanceActor,
  type GovernanceEvaluation,
  type GovernanceEvaluationRequest,
  type GovernedActionEvidence,
  type GovernedCreditAction,
} from './bankCreditGovernanceEngine';

export type CertifiedProfileId =
  | 'SINGLE_AUTHORIZED_OFFICER'
  | 'COMBINED_LENDER_UNDERWRITER'
  | 'FULLY_SEGREGATED'
  | 'COMMITTEE_APPROVAL'
  | 'HYBRID_THRESHOLD_RISK'
  | 'GOVERNED_VERSION_MIGRATION';

export interface CertificationProfile {
  readonly profileId: CertifiedProfileId;
  readonly description: string;
  readonly policy: BankCreditGovernancePolicy;
  readonly priorPolicy?: BankCreditGovernancePolicy;
  readonly combinedRoleDisclosure: string;
}

const approvalGroup = {
  groupId: 'credit-committee',
  approvalsRequired: 2,
  quorumRequired: 3,
  committeeId: 'credit-committee',
  eligibleRoles: ['credit-voter'],
  distinctActors: true,
  abstentionsCountTowardQuorum: true,
  recusedActorIds: ['recused-fixture'],
  maximumAmount: 5_000_000,
  maximumRelationshipExposure: 10_000_000,
} as const;

function rulesForProfile(
  profileId: CertifiedProfileId,
  independence: readonly GovernedCreditAction[],
): CreditGovernanceRule[] {
  const requirements = {
    actorRoles: ['authorized-officer'],
    delegatedAuthorityRequired: true,
    independentFrom: independence,
  };
  const segregatedPredecessors: Partial<Record<GovernedCreditAction, readonly GovernedCreditAction[]>> = {
    UNDERWRITE: ['ORIGINATE'],
    RECOMMEND: ['ORIGINATE', 'UNDERWRITE'],
    APPROVE: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND'],
    APPROVE_EXCEPTION: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND'],
    COMMIT: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE'],
    CLOSE: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT'],
    AUTHORIZE_FUNDING: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE'],
    CONFIRM_DISBURSEMENT: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING'],
    BOARD: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT'],
    SERVICE: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT', 'BOARD'],
    MODIFY: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT', 'BOARD', 'SERVICE'],
    RENEW: ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND', 'APPROVE', 'COMMIT', 'CLOSE', 'AUTHORIZE_FUNDING', 'CONFIRM_DISBURSEMENT', 'BOARD', 'SERVICE', 'MODIFY'],
  };
  const otherActionRules = GOVERNED_CREDIT_ACTIONS
    .filter((action) => action !== 'APPROVE' && action !== 'APPROVE_EXCEPTION')
    .map<CreditGovernanceRule>((action) => ({
      ruleId: `${profileId}-${action.toLowerCase()}`,
      description: `${action} requires explicitly scoped delegated authority.`,
      actions: [action],
      requirements: {
        actorRoles: ['authorized-officer'],
        delegatedAuthorityRequired: true,
        independentFrom: profileId === 'FULLY_SEGREGATED' ? segregatedPredecessors[action] : undefined,
      },
      nonOverrideable: true,
    }));
  const rules: CreditGovernanceRule[] = [
    ...otherActionRules,
    {
      ruleId: `${profileId}-standard-approval`,
      description: 'Standard approval requires explicitly scoped delegated authority.',
      actions: ['APPROVE'],
      when: { hasPolicyException: false },
      requirements,
      nonOverrideable: true,
    },
    {
      ruleId: `${profileId}-exception-block`,
      description: 'A deal with a policy exception cannot use the standard approval route.',
      actions: ['APPROVE'],
      when: { hasPolicyException: true },
      requirements: { prohibited: 'Policy exceptions require the governed exception action.' },
      nonOverrideable: true,
    },
    {
      ruleId: `${profileId}-exception-approval`,
      description: 'Exception approval requires an exception-scoped grant.',
      actions: ['APPROVE_EXCEPTION'],
      when: { hasPolicyException: true },
      requirements,
      nonOverrideable: true,
    },
  ];
  if (profileId === 'COMMITTEE_APPROVAL' || profileId === 'GOVERNED_VERSION_MIGRATION') {
    rules.push({
      ruleId: `${profileId}-committee`,
      description: 'Committee quorum and voting are required for approval.',
      actions: ['APPROVE', 'APPROVE_EXCEPTION'],
      requirements: { approvalGroups: [approvalGroup] },
      nonOverrideable: true,
    });
  }
  if (profileId === 'HYBRID_THRESHOLD_RISK') {
    rules.push(
      {
        ruleId: `${profileId}-amount-route`,
        description: 'Large deals route to committee.',
        actions: ['APPROVE', 'APPROVE_EXCEPTION'],
        when: { minimumAmount: 500_000 },
        requirements: { approvalGroups: [approvalGroup] },
        nonOverrideable: true,
      },
      {
        ruleId: `${profileId}-risk-route`,
        description: 'Substandard risk routes to committee regardless of amount.',
        actions: ['APPROVE', 'APPROVE_EXCEPTION'],
        when: { riskRatings: ['Substandard'] },
        requirements: { approvalGroups: [approvalGroup] },
        nonOverrideable: true,
      },
    );
  }
  return rules;
}

function policy(
  profileId: CertifiedProfileId,
  independence: readonly GovernedCreditAction[],
  version = 1,
): BankCreditGovernancePolicy {
  return {
    policyId: `certification-${profileId.toLowerCase()}`,
    version,
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    rules: rulesForProfile(profileId, independence),
  };
}

export const CERTIFICATION_PROFILES: readonly CertificationProfile[] = [
  {
    profileId: 'SINGLE_AUTHORIZED_OFFICER',
    description: 'One explicitly authorized officer may combine all duties.',
    policy: policy('SINGLE_AUTHORIZED_OFFICER', []),
    combinedRoleDisclosure: 'ORIGINATE, UNDERWRITE, RECOMMEND, and APPROVE may be performed by the same authorized officer.',
  },
  {
    profileId: 'COMBINED_LENDER_UNDERWRITER',
    description: 'Lending and underwriting may be combined; approval must be independent.',
    policy: policy('COMBINED_LENDER_UNDERWRITER', ['ORIGINATE', 'UNDERWRITE']),
    combinedRoleDisclosure: 'ORIGINATE and UNDERWRITE may be combined; APPROVE must be a different person.',
  },
  {
    profileId: 'FULLY_SEGREGATED',
    description: 'Approval is independent from origination, underwriting, and recommendation.',
    policy: policy('FULLY_SEGREGATED', ['ORIGINATE', 'UNDERWRITE', 'RECOMMEND']),
    combinedRoleDisclosure: 'No approval combination is permitted with ORIGINATE, UNDERWRITE, or RECOMMEND.',
  },
  {
    profileId: 'COMMITTEE_APPROVAL',
    description: 'Approval requires two approvals and quorum of three eligible committee voters.',
    policy: policy('COMMITTEE_APPROVAL', ['ORIGINATE']),
    combinedRoleDisclosure: 'The acting approver must be independent from ORIGINATE and committee evidence is separately required.',
  },
  {
    profileId: 'HYBRID_THRESHOLD_RISK',
    description: 'Committee routing applies at USD 500,000 or for Substandard risk.',
    policy: policy('HYBRID_THRESHOLD_RISK', ['ORIGINATE']),
    combinedRoleDisclosure: 'Approval is independent from ORIGINATE; committee routing varies by amount and risk.',
  },
  {
    profileId: 'GOVERNED_VERSION_MIGRATION',
    description: 'An active stronger version supersedes an immutable retired version.',
    priorPolicy: (() => {
      const prior = policy('GOVERNED_VERSION_MIGRATION', ['ORIGINATE'], 1);
      return {
        ...prior,
        status: 'RETIRED',
        effectiveThrough: '2026-06-30T23:59:59.999Z',
        rules: prior.rules.filter((rule) => !rule.ruleId.endsWith('-committee')),
      };
    })(),
    policy: policy('GOVERNED_VERSION_MIGRATION', ['ORIGINATE'], 2),
    combinedRoleDisclosure: 'Version 2 retains independent approval and adds governed committee evidence.',
  },
] as const;

export function certificationFacts(overrides: Partial<CreditCaseFacts> = {}): CreditCaseFacts {
  return {
    amount: 100_000,
    totalRelationshipExposure: 200_000,
    product: 'Commercial',
    collateral: ['Business assets'],
    riskRating: 'Pass',
    hasPolicyException: false,
    policyExceptionTypes: [],
    insiderStatus: false,
    concentration: [],
    industry: 'Manufacturing',
    geography: 'US-East',
    governmentGuaranteedProgram: undefined,
    criticizedClassifiedStatus: undefined,
    ...overrides,
  };
}

export function certificationActor(
  action: GovernedCreditAction,
  overrides: {
    actorId?: string;
    effectiveFrom?: string;
    effectiveThrough?: string;
    maximumAmount?: number;
    maximumRelationshipExposure?: number;
    products?: readonly string[];
    riskRatings?: readonly string[];
    geographies?: readonly string[];
    industries?: readonly string[];
    exceptionTypes?: readonly string[];
  } = {},
): GovernanceActor {
  const actorId = overrides.actorId ?? 'approver-fixture';
  return {
    actorId,
    roles: ['authorized-officer'],
    committeeMemberships: ['credit-committee'],
    authorityGrants: [{
      grantId: `certification-grant-${actorId}-${action}`,
      actions: [action],
      maximumAmount: overrides.maximumAmount ?? 1_000_000,
      maximumRelationshipExposure: overrides.maximumRelationshipExposure ?? 2_000_000,
      products: overrides.products ?? ['Commercial'],
      riskRatings: overrides.riskRatings ?? ['Pass', 'Substandard'],
      geographies: overrides.geographies ?? ['US-East'],
      industries: overrides.industries ?? ['Manufacturing'],
      exceptionTypes: overrides.exceptionTypes,
      effectiveFrom: overrides.effectiveFrom ?? '2026-01-01T00:00:00.000Z',
      effectiveThrough: overrides.effectiveThrough,
    }],
  };
}

export function committeeEvidence(
  decisions: readonly ['APPROVE' | 'DECLINE' | 'ABSTAIN', string][] = [
    ['APPROVE', 'voter-1'],
    ['APPROVE', 'voter-2'],
    ['ABSTAIN', 'voter-3'],
  ],
): ApprovalEvidence[] {
  return decisions.map(([decision, actorId], index) => ({
    approvalId: `committee-evidence-${index + 1}`,
    groupId: 'credit-committee',
    actorId,
    actorRoles: ['credit-voter'],
    committeeId: 'credit-committee',
    decision,
    occurredAt: '2026-07-01T12:00:00.000Z',
  }));
}

export function actionEvidence(
  actors: Partial<Record<GovernedCreditAction, string>>,
): GovernedActionEvidence[] {
  return Object.entries(actors).map(([action, actorId], index) => ({
    action: action as GovernedCreditAction,
    actorId,
    occurredAt: `2026-07-01T0${index}:00:00.000Z`,
    evidenceId: `action-evidence-${action.toLowerCase()}-${index}`,
  }));
}

export function evaluateCertificationProfile(input: {
  profile: CertificationProfile;
  action?: GovernedCreditAction;
  facts?: CreditCaseFacts;
  actor?: GovernanceActor;
  history?: readonly GovernedActionEvidence[];
  approvals?: readonly ApprovalEvidence[];
  policy?: BankCreditGovernancePolicy;
  evaluationId?: string;
}): GovernanceEvaluation {
  const action = input.action ?? 'APPROVE';
  const request: GovernanceEvaluationRequest = {
    evaluationId: input.evaluationId ?? `certification-${input.profile.profileId.toLowerCase()}`,
    evaluatedAt: '2026-07-01T12:00:00.000Z',
    action,
    policy: input.policy ?? input.profile.policy,
    facts: input.facts ?? certificationFacts(),
    actor: input.actor ?? certificationActor(action),
    actionHistory: input.history ?? actionEvidence({ ORIGINATE: 'originator-fixture', UNDERWRITE: 'underwriter-fixture', RECOMMEND: 'recommender-fixture' }),
    approvals: input.approvals ?? (
      input.profile.profileId === 'COMMITTEE_APPROVAL' ||
      input.profile.profileId === 'GOVERNED_VERSION_MIGRATION'
        ? committeeEvidence()
        : []
    ),
  };
  return evaluateBankCreditGovernance(request);
}

export interface DurableCertificationEvidence {
  readonly evaluationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly matchedRuleIds: readonly string[];
  readonly decision: GovernanceEvaluation['decision'];
  readonly persistedAt: string;
}

export interface CertificationAuditEvent {
  readonly eventId: string;
  readonly evaluationId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly decision: GovernanceEvaluation['decision'];
}

export interface CertificationTimelineEvent {
  readonly timelineId: string;
  readonly evaluationId: string;
  readonly summary: string;
}

export function buildDurableCertificationEvidence(evaluation: GovernanceEvaluation): {
  readonly durable: DurableCertificationEvidence;
  readonly audit: CertificationAuditEvent;
  readonly timeline: CertificationTimelineEvent;
} {
  if (!evaluation.policyId || evaluation.policyVersion === undefined) {
    throw new Error('A policy-bound evaluation is required for durable certification evidence.');
  }
  return {
    durable: {
      evaluationId: evaluation.evaluationId,
      policyId: evaluation.policyId,
      policyVersion: evaluation.policyVersion,
      matchedRuleIds: evaluation.matchedRuleIds,
      decision: evaluation.decision,
      persistedAt: evaluation.evaluatedAt,
    },
    audit: {
      eventId: `audit-${evaluation.evaluationId}`,
      evaluationId: evaluation.evaluationId,
      policyId: evaluation.policyId,
      policyVersion: evaluation.policyVersion,
      decision: evaluation.decision,
    },
    timeline: {
      timelineId: `timeline-${evaluation.evaluationId}`,
      evaluationId: evaluation.evaluationId,
      summary: `${evaluation.action} ${evaluation.decision} under ${evaluation.policyId} v${evaluation.policyVersion}`,
    },
  };
}

export function reconcileCertificationEvidence(
  evidence: ReturnType<typeof buildDurableCertificationEvidence>,
): readonly string[] {
  const errors: string[] = [];
  if (evidence.durable.evaluationId !== evidence.audit.evaluationId) errors.push('Audit evaluation ID mismatch.');
  if (evidence.durable.evaluationId !== evidence.timeline.evaluationId) errors.push('Timeline evaluation ID mismatch.');
  if (evidence.durable.policyId !== evidence.audit.policyId) errors.push('Audit policy ID mismatch.');
  if (evidence.durable.policyVersion !== evidence.audit.policyVersion) errors.push('Audit policy version mismatch.');
  if (evidence.durable.decision !== evidence.audit.decision) errors.push('Audit decision mismatch.');
  return errors;
}

export interface CombinedRoleDisclosure {
  readonly actorId: string;
  readonly performedActions: readonly GovernedCreditAction[];
  readonly combined: boolean;
  readonly statement: string;
}

export function discloseCombinedRoles(
  actorId: string,
  history: readonly GovernedActionEvidence[],
): CombinedRoleDisclosure {
  const performedActions = GOVERNED_CREDIT_ACTIONS.filter((action) =>
    history.some((item) => item.action === action && item.actorId.trim().toLowerCase() === actorId.trim().toLowerCase()),
  );
  return {
    actorId,
    performedActions,
    combined: performedActions.length > 1,
    statement: performedActions.length > 1
      ? `${actorId} performed combined duties: ${performedActions.join(', ')}.`
      : `${actorId} performed ${performedActions[0] ?? 'no recorded governed action'}.`,
  };
}

export const DIRECT_DATAVERSE_BYPASS_EVIDENCE = {
  registrationPath: 'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernanceRegistration.json',
  pluginPath: 'dataverse-plugins/CommercialLendingLOS.Plugins/DurableRecordGovernancePlugin.cs',
  testPath: 'dataverse-plugins/CommercialLendingLOS.Plugins.Tests/DurableRecordGovernancePluginTests.cs',
  productionRegistered: false,
  activationState: 'NO_GO' as const,
};

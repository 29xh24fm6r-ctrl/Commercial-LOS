/**
 * Bank Credit Governance and Delegated Authority Engine.
 *
 * This module is deliberately pure. The active policy snapshot, deal facts, actor
 * entitlements, prior action evidence, and approval/vote evidence must all be
 * supplied by the caller. It performs no lookup and invents no missing fact.
 *
 * Matching rules compose restrictively: every matching rule must pass. This lets
 * banks layer base, amount, product, exception, insider, concentration, and other
 * controls without relying on fragile rule ordering.
 */

export type GovernedCreditAction =
  | 'ORIGINATE'
  | 'UNDERWRITE'
  | 'RECOMMEND'
  | 'APPROVE'
  | 'APPROVE_EXCEPTION'
  | 'COMMIT'
  | 'CLOSE'
  | 'AUTHORIZE_FUNDING'
  | 'CONFIRM_DISBURSEMENT'
  | 'BOARD'
  | 'SERVICE'
  | 'MODIFY'
  | 'RENEW';

export const GOVERNED_CREDIT_ACTIONS: readonly GovernedCreditAction[] = [
  'ORIGINATE',
  'UNDERWRITE',
  'RECOMMEND',
  'APPROVE',
  'APPROVE_EXCEPTION',
  'COMMIT',
  'CLOSE',
  'AUTHORIZE_FUNDING',
  'CONFIRM_DISBURSEMENT',
  'BOARD',
  'SERVICE',
  'MODIFY',
  'RENEW',
];

export type PolicyStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface CreditCaseFacts {
  readonly amount: number;
  readonly totalRelationshipExposure: number;
  /** Amount unsupported by eligible collateral; omitted is treated as unknown/fail-closed when a grant limits it. */
  readonly unsecuredExposure?: number;
  readonly product: string;
  readonly collateral: readonly string[];
  readonly riskRating: string;
  readonly hasPolicyException: boolean;
  /** Named exception categories, when applicable. Empty/absent never satisfies a scoped grant. */
  readonly policyExceptionTypes?: readonly string[];
  readonly insiderStatus: boolean;
  readonly concentration: readonly string[];
  readonly industry: string;
  readonly geography: string;
  readonly governmentGuaranteedProgram: string | undefined;
  readonly criticizedClassifiedStatus: string | undefined;
}

export interface PolicyCondition {
  readonly minimumAmount?: number;
  readonly maximumAmount?: number;
  readonly minimumRelationshipExposure?: number;
  readonly maximumRelationshipExposure?: number;
  readonly products?: readonly string[];
  readonly anyCollateral?: readonly string[];
  readonly riskRatings?: readonly string[];
  readonly hasPolicyException?: boolean;
  readonly insiderStatus?: boolean;
  readonly anyConcentration?: readonly string[];
  readonly industries?: readonly string[];
  readonly geographies?: readonly string[];
  /** Use null to match cases with no government-guaranteed program. */
  readonly governmentGuaranteedPrograms?: readonly (string | null)[];
  /** Use null to match cases that are not criticized/classified. */
  readonly criticizedClassifiedStatuses?: readonly (string | null)[];
}

export interface DelegatedAuthorityGrant {
  readonly grantId: string;
  readonly actions: readonly GovernedCreditAction[];
  readonly maximumAmount?: number;
  readonly maximumRelationshipExposure?: number;
  readonly maximumUnsecuredAmount?: number;
  readonly products?: readonly string[];
  readonly riskRatings?: readonly string[];
  readonly geographies?: readonly string[];
  readonly industries?: readonly string[];
  readonly exceptionTypes?: readonly string[];
  readonly insiderPermitted?: boolean;
  readonly criticizedClassifiedStatuses?: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
}

export interface GovernanceActor {
  readonly actorId: string;
  readonly roles: readonly string[];
  readonly committeeMemberships: readonly string[];
  readonly authorityGrants: readonly DelegatedAuthorityGrant[];
}

export interface GovernedActionEvidence {
  readonly action: GovernedCreditAction;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly evidenceId: string;
}

export interface ApprovalEvidence {
  readonly approvalId: string;
  readonly groupId: string;
  readonly actorId: string;
  readonly actorRoles: readonly string[];
  readonly committeeId?: string;
  readonly decision: 'APPROVE' | 'DECLINE' | 'ABSTAIN';
  readonly occurredAt: string;
}

export interface ApprovalGroupRequirement {
  readonly groupId: string;
  readonly approvalsRequired: number;
  readonly eligibleRoles?: readonly string[];
  readonly committeeId?: string;
  readonly distinctActors: boolean;
  readonly unanimous?: boolean;
  readonly quorumRequired?: number;
  readonly abstentionsCountTowardQuorum?: boolean;
  readonly recusedActorIds?: readonly string[];
  readonly maximumAmount?: number;
  readonly maximumRelationshipExposure?: number;
}

export interface RuleRequirements {
  /** Empty or absent means the rule does not add an actor-role restriction. */
  readonly actorRoles?: readonly string[];
  readonly delegatedAuthorityRequired?: boolean;
  /**
   * Actions that must have been performed by another person. When absent, the
   * policy explicitly permits role combination for this rule.
   */
  readonly independentFrom?: readonly GovernedCreditAction[];
  readonly approvalGroups?: readonly ApprovalGroupRequirement[];
  readonly mandatoryEscalation?: string;
  readonly prohibited?: string;
}

export interface CreditGovernanceRule {
  readonly ruleId: string;
  readonly description: string;
  readonly actions: readonly GovernedCreditAction[];
  readonly when?: PolicyCondition;
  readonly requirements: RuleRequirements;
  /**
   * A control that an upstream override process may never waive. The pure
   * evaluator records this attribute; it never implements an implicit override.
   */
  readonly nonOverrideable: boolean;
}

export interface BankCreditGovernancePolicy {
  readonly policyId: string;
  readonly version: number;
  readonly status: PolicyStatus;
  readonly effectiveFrom: string;
  readonly effectiveThrough?: string;
  readonly rules: readonly CreditGovernanceRule[];
}

export interface GovernanceEvaluationRequest {
  readonly evaluationId: string;
  readonly evaluatedAt: string;
  readonly action: GovernedCreditAction;
  readonly policy: BankCreditGovernancePolicy | undefined;
  readonly facts: CreditCaseFacts;
  readonly actor: GovernanceActor | undefined;
  readonly actionHistory: readonly GovernedActionEvidence[];
  readonly approvals: readonly ApprovalEvidence[];
}

export type GovernanceDecision = 'PERMIT' | 'BLOCK' | 'ESCALATE';

export type GovernanceReasonCode =
  | 'POLICY_MISSING'
  | 'POLICY_INVALID'
  | 'POLICY_NOT_ACTIVE'
  | 'POLICY_NOT_EFFECTIVE'
  | 'NO_MATCHING_RULE'
  | 'ACTOR_MISSING'
  | 'ROLE_NOT_PERMITTED'
  | 'DELEGATED_AUTHORITY_MISSING'
  | 'DELEGATED_AUTHORITY_EXCEEDED'
  | 'INDEPENDENCE_EVIDENCE_MISSING'
  | 'INDEPENDENCE_REQUIRED'
  | 'APPROVAL_GROUP_UNSATISFIED'
  | 'COMMITTEE_ACTION_REQUIRED'
  | 'COMMITTEE_QUORUM_UNSATISFIED'
  | 'COMMITTEE_AUTHORITY_EXCEEDED'
  | 'ACTION_PROHIBITED'
  | 'MANDATORY_ESCALATION';

export interface GovernanceFinding {
  readonly code: GovernanceReasonCode;
  readonly ruleId?: string;
  readonly message: string;
  readonly nonOverrideable: boolean;
  readonly evidenceIds: readonly string[];
}

export interface GovernanceEvaluation {
  readonly evaluationId: string;
  readonly decision: GovernanceDecision;
  readonly policyId?: string;
  readonly policyVersion?: number;
  readonly evaluatedAt: string;
  readonly action: GovernedCreditAction;
  readonly matchedRuleIds: readonly string[];
  readonly findings: readonly GovernanceFinding[];
  /** Stable, persistence-safe inputs proving which facts were evaluated. */
  readonly factSnapshot: CreditCaseFacts;
}

function instant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function includesNormalized(values: readonly string[], candidate: string): boolean {
  const wanted = normalized(candidate);
  return values.some((value) => normalized(value) === wanted);
}

function includesNullable(
  values: readonly (string | null)[],
  candidate: string | undefined,
): boolean {
  return values.some((value) =>
    value === null ? candidate === undefined : candidate !== undefined && normalized(value) === normalized(candidate),
  );
}

export function policyConditionMatches(condition: PolicyCondition | undefined, facts: CreditCaseFacts): boolean {
  if (!condition) return true;
  if (condition.minimumAmount !== undefined && facts.amount < condition.minimumAmount) return false;
  if (condition.maximumAmount !== undefined && facts.amount > condition.maximumAmount) return false;
  if (
    condition.minimumRelationshipExposure !== undefined &&
    facts.totalRelationshipExposure < condition.minimumRelationshipExposure
  ) return false;
  if (
    condition.maximumRelationshipExposure !== undefined &&
    facts.totalRelationshipExposure > condition.maximumRelationshipExposure
  ) return false;
  if (condition.products && !includesNormalized(condition.products, facts.product)) return false;
  if (
    condition.anyCollateral &&
    !facts.collateral.some((value) => includesNormalized(condition.anyCollateral!, value))
  ) return false;
  if (condition.riskRatings && !includesNormalized(condition.riskRatings, facts.riskRating)) return false;
  if (
    condition.hasPolicyException !== undefined &&
    condition.hasPolicyException !== facts.hasPolicyException
  ) return false;
  if (condition.insiderStatus !== undefined && condition.insiderStatus !== facts.insiderStatus) return false;
  if (
    condition.anyConcentration &&
    !facts.concentration.some((value) => includesNormalized(condition.anyConcentration!, value))
  ) return false;
  if (condition.industries && !includesNormalized(condition.industries, facts.industry)) return false;
  if (condition.geographies && !includesNormalized(condition.geographies, facts.geography)) return false;
  if (
    condition.governmentGuaranteedPrograms &&
    !includesNullable(condition.governmentGuaranteedPrograms, facts.governmentGuaranteedProgram)
  ) return false;
  if (
    condition.criticizedClassifiedStatuses &&
    !includesNullable(condition.criticizedClassifiedStatuses, facts.criticizedClassifiedStatus)
  ) return false;
  return true;
}

function activeGrant(
  request: GovernanceEvaluationRequest,
  actor: GovernanceActor,
): { grant: DelegatedAuthorityGrant | undefined; exceeded: boolean } {
  const at = instant(request.evaluatedAt);
  let exceeded = false;
  for (const grant of actor.authorityGrants) {
    if (!grant.actions.includes(request.action)) continue;
    const from = instant(grant.effectiveFrom);
    const through = grant.effectiveThrough ? instant(grant.effectiveThrough) : undefined;
    if (at === undefined || from === undefined || at < from || (through !== undefined && at > through)) continue;
    if (grant.products && !includesNormalized(grant.products, request.facts.product)) continue;
    if (grant.riskRatings && !includesNormalized(grant.riskRatings, request.facts.riskRating)) continue;
    if (grant.geographies && !includesNormalized(grant.geographies, request.facts.geography)) continue;
    if (grant.industries && !includesNormalized(grant.industries, request.facts.industry)) continue;
    if (request.facts.insiderStatus && !grant.insiderPermitted) continue;
    if (
      request.facts.criticizedClassifiedStatus &&
      (!grant.criticizedClassifiedStatuses ||
        !includesNormalized(grant.criticizedClassifiedStatuses, request.facts.criticizedClassifiedStatus))
    ) continue;
    if (grant.maximumAmount !== undefined && request.facts.amount > grant.maximumAmount) {
      exceeded = true;
      continue;
    }
    if (
      grant.maximumRelationshipExposure !== undefined &&
      request.facts.totalRelationshipExposure > grant.maximumRelationshipExposure
    ) {
      exceeded = true;
      continue;
    }
    if (
      grant.maximumUnsecuredAmount !== undefined &&
      (request.facts.unsecuredExposure === undefined ||
        request.facts.unsecuredExposure > grant.maximumUnsecuredAmount)
    ) {
      exceeded = true;
      continue;
    }
    if (
      request.facts.hasPolicyException &&
      (!grant.exceptionTypes ||
        !request.facts.policyExceptionTypes?.some((exceptionType) =>
          includesNormalized(grant.exceptionTypes!, exceptionType)))
    ) {
      continue;
    }
    return { grant, exceeded };
  }
  return { grant: undefined, exceeded };
}

function evaluateApprovalGroup(
  requirement: ApprovalGroupRequirement,
  approvals: readonly ApprovalEvidence[],
  facts: CreditCaseFacts,
): {
  satisfied: boolean;
  quorumSatisfied: boolean;
  authorityExceeded: boolean;
  evidenceIds: readonly string[];
} {
  const relevant = approvals.filter((approval) => {
    if (approval.groupId !== requirement.groupId) return false;
    if (requirement.committeeId && approval.committeeId !== requirement.committeeId) return false;
    if (requirement.recusedActorIds && includesNormalized(requirement.recusedActorIds, approval.actorId)) return false;
    if (
      requirement.eligibleRoles &&
      !approval.actorRoles.some((role) => includesNormalized(requirement.eligibleRoles!, role))
    ) return false;
    return true;
  });
  const approvalsOnly = relevant.filter((approval) => approval.decision === 'APPROVE');
  const quorumVotes = relevant.filter(
    (approval) => approval.decision !== 'ABSTAIN' || requirement.abstentionsCountTowardQuorum,
  );
  const count = requirement.distinctActors
    ? new Set(approvalsOnly.map((approval) => normalized(approval.actorId))).size
    : approvalsOnly.length;
  const quorumCount = requirement.distinctActors
    ? new Set(quorumVotes.map((approval) => normalized(approval.actorId))).size
    : quorumVotes.length;
  const quorumSatisfied = requirement.quorumRequired === undefined ||
    quorumCount >= requirement.quorumRequired;
  const unanimousVotes = relevant.filter((approval) => approval.decision !== 'ABSTAIN');
  const unanimous = !requirement.unanimous ||
    (unanimousVotes.length > 0 && unanimousVotes.every((approval) => approval.decision === 'APPROVE'));
  const authorityExceeded =
    (requirement.maximumAmount !== undefined && facts.amount > requirement.maximumAmount) ||
    (requirement.maximumRelationshipExposure !== undefined &&
      facts.totalRelationshipExposure > requirement.maximumRelationshipExposure);
  return {
    satisfied: count >= requirement.approvalsRequired && unanimous && quorumSatisfied && !authorityExceeded,
    quorumSatisfied,
    authorityExceeded,
    evidenceIds: approvalsOnly.map((approval) => approval.approvalId),
  };
}

function finding(
  code: GovernanceReasonCode,
  message: string,
  rule?: CreditGovernanceRule,
  evidenceIds: readonly string[] = [],
): GovernanceFinding {
  return {
    code,
    ruleId: rule?.ruleId,
    message,
    nonOverrideable: rule?.nonOverrideable ?? true,
    evidenceIds,
  };
}

function validatePolicy(policy: BankCreditGovernancePolicy): readonly string[] {
  const errors: string[] = [];
  if (policy.policyId.trim().length === 0) errors.push('policyId is blank');
  if (!Number.isInteger(policy.version) || policy.version < 1) errors.push('version must be a positive integer');
  if (instant(policy.effectiveFrom) === undefined) errors.push('effectiveFrom is invalid');
  if (policy.effectiveThrough && instant(policy.effectiveThrough) === undefined) {
    errors.push('effectiveThrough is invalid');
  }
  if (
    policy.effectiveThrough &&
    instant(policy.effectiveFrom) !== undefined &&
    instant(policy.effectiveThrough)! < instant(policy.effectiveFrom)!
  ) errors.push('effectiveThrough precedes effectiveFrom');
  if (policy.rules.length === 0) errors.push('policy contains no rules');
  const ruleIds = new Set<string>();
  for (const rule of policy.rules) {
    const ruleId = rule.ruleId.trim();
    if (ruleId.length === 0) errors.push('a ruleId is blank');
    if (ruleIds.has(ruleId)) errors.push(`duplicate ruleId: ${ruleId}`);
    ruleIds.add(ruleId);
    if (rule.actions.length === 0) errors.push(`rule ${ruleId || '(blank)'} has no actions`);
    const condition = rule.when;
    if (
      condition?.minimumAmount !== undefined &&
      condition.maximumAmount !== undefined &&
      condition.minimumAmount > condition.maximumAmount
    ) errors.push(`rule ${ruleId} has an inverted amount range`);
    if (
      condition?.minimumRelationshipExposure !== undefined &&
      condition.maximumRelationshipExposure !== undefined &&
      condition.minimumRelationshipExposure > condition.maximumRelationshipExposure
    ) errors.push(`rule ${ruleId} has an inverted relationship-exposure range`);
    if (rule.requirements.actorRoles?.length === 0) errors.push(`rule ${ruleId} has an empty actorRoles restriction`);
    for (const group of rule.requirements.approvalGroups ?? []) {
      if (group.groupId.trim().length === 0) errors.push(`rule ${ruleId} has a blank approval groupId`);
      if (!Number.isInteger(group.approvalsRequired) || group.approvalsRequired < 1) {
        errors.push(`rule ${ruleId} approval group ${group.groupId} requires an invalid approval count`);
      }
      if (group.eligibleRoles?.length === 0) {
        errors.push(`rule ${ruleId} approval group ${group.groupId} has an empty eligibleRoles restriction`);
      }
      if (
        group.quorumRequired !== undefined &&
        (!Number.isInteger(group.quorumRequired) || group.quorumRequired < group.approvalsRequired)
      ) errors.push(`rule ${ruleId} approval group ${group.groupId} has an invalid quorum`);
      if (group.maximumAmount !== undefined && (!Number.isFinite(group.maximumAmount) || group.maximumAmount < 0)) {
        errors.push(`rule ${ruleId} approval group ${group.groupId} has an invalid maximum amount`);
      }
      if (
        group.maximumRelationshipExposure !== undefined &&
        (!Number.isFinite(group.maximumRelationshipExposure) || group.maximumRelationshipExposure < 0)
      ) errors.push(`rule ${ruleId} approval group ${group.groupId} has an invalid maximum relationship exposure`);
      if (group.committeeId !== undefined && group.committeeId.trim().length === 0) {
        errors.push(`rule ${ruleId} approval group ${group.groupId} has a blank committeeId`);
      }
    }
  }
  return errors;
}

export function evaluateBankCreditGovernance(request: GovernanceEvaluationRequest): GovernanceEvaluation {
  const base = {
    evaluationId: request.evaluationId,
    evaluatedAt: request.evaluatedAt,
    action: request.action,
    factSnapshot: request.facts,
  };
  if (!request.policy) {
    return {
      ...base,
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [finding('POLICY_MISSING', 'No bank credit governance policy snapshot was supplied.')],
    };
  }
  const policyIdentity = { policyId: request.policy.policyId, policyVersion: request.policy.version };
  const policyErrors = validatePolicy(request.policy);
  if (policyErrors.length > 0) {
    return {
      ...base,
      ...policyIdentity,
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [
        finding(
          'POLICY_INVALID',
          `The supplied policy is invalid: ${policyErrors.join('; ')}.`,
        ),
      ],
    };
  }
  if (request.policy.status !== 'ACTIVE') {
    return {
      ...base,
      ...policyIdentity,
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [finding('POLICY_NOT_ACTIVE', 'The supplied policy version is not active.')],
    };
  }
  const evaluatedAt = instant(request.evaluatedAt);
  const effectiveFrom = instant(request.policy.effectiveFrom);
  const effectiveThrough = request.policy.effectiveThrough
    ? instant(request.policy.effectiveThrough)
    : undefined;
  if (
    evaluatedAt === undefined ||
    effectiveFrom === undefined ||
    evaluatedAt < effectiveFrom ||
    (effectiveThrough !== undefined && evaluatedAt > effectiveThrough)
  ) {
    return {
      ...base,
      ...policyIdentity,
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [finding('POLICY_NOT_EFFECTIVE', 'The supplied policy is not effective at the evaluation time.')],
    };
  }

  const rules = request.policy.rules.filter(
    (rule) => rule.actions.includes(request.action) && policyConditionMatches(rule.when, request.facts),
  );
  if (rules.length === 0) {
    return {
      ...base,
      ...policyIdentity,
      decision: 'BLOCK',
      matchedRuleIds: [],
      findings: [finding('NO_MATCHING_RULE', 'No active policy rule governs this action and fact set.')],
    };
  }

  const findings: GovernanceFinding[] = [];
  for (const rule of rules) {
    const requirements = rule.requirements;
    if (requirements.prohibited) {
      findings.push(finding('ACTION_PROHIBITED', requirements.prohibited, rule));
    }
    if (requirements.mandatoryEscalation) {
      findings.push(finding('MANDATORY_ESCALATION', requirements.mandatoryEscalation, rule));
    }
    if (!request.actor) {
      findings.push(finding('ACTOR_MISSING', 'The acting officer could not be resolved.', rule));
      continue;
    }
    if (
      requirements.actorRoles &&
      !request.actor.roles.some((role) => includesNormalized(requirements.actorRoles!, role))
    ) {
      findings.push(finding('ROLE_NOT_PERMITTED', 'The acting officer does not hold a role permitted by this rule.', rule));
    }
    if (requirements.delegatedAuthorityRequired) {
      const authority = activeGrant(request, request.actor);
      if (!authority.grant) {
        findings.push(
          finding(
            authority.exceeded ? 'DELEGATED_AUTHORITY_EXCEEDED' : 'DELEGATED_AUTHORITY_MISSING',
            authority.exceeded
              ? 'The case exceeds the acting officer’s delegated authority.'
              : 'No effective delegated authority grant covers this action.',
            rule,
          ),
        );
      }
    }
    for (const priorAction of requirements.independentFrom ?? []) {
      const evidence = request.actionHistory.filter((item) => item.action === priorAction);
      if (evidence.length === 0) {
        findings.push(
          finding(
            'INDEPENDENCE_EVIDENCE_MISSING',
            `No evidence identifies who performed ${priorAction}.`,
            rule,
          ),
        );
      } else {
        const sameActor = evidence.filter(
          (item) => normalized(item.actorId) === normalized(request.actor!.actorId),
        );
        if (sameActor.length > 0) {
          findings.push(
            finding(
              'INDEPENDENCE_REQUIRED',
              `${request.action} must be performed by a person independent from ${priorAction}.`,
              rule,
              sameActor.map((item) => item.evidenceId),
            ),
          );
        }
      }
    }
    for (const group of requirements.approvalGroups ?? []) {
      const result = evaluateApprovalGroup(group, request.approvals, request.facts);
      if (!result.satisfied) {
        const code: GovernanceReasonCode = result.authorityExceeded
          ? 'COMMITTEE_AUTHORITY_EXCEEDED'
          : !result.quorumSatisfied
            ? 'COMMITTEE_QUORUM_UNSATISFIED'
            : group.committeeId
              ? 'COMMITTEE_ACTION_REQUIRED'
              : 'APPROVAL_GROUP_UNSATISFIED';
        findings.push(
          finding(
            code,
            result.authorityExceeded
              ? `Approval group ${group.groupId} lacks authority for the case exposure.`
              : !result.quorumSatisfied
                ? `Approval group ${group.groupId} has not reached quorum.`
                : group.committeeId
                  ? `Committee approval group ${group.groupId} is not satisfied.`
                  : `Approval group ${group.groupId} is not satisfied.`,
            rule,
            result.evidenceIds,
          ),
        );
      }
    }
  }

  const decision: GovernanceDecision = findings.some((item) => item.code !== 'MANDATORY_ESCALATION')
    ? 'BLOCK'
    : findings.some((item) => item.code === 'MANDATORY_ESCALATION')
      ? 'ESCALATE'
      : 'PERMIT';
  return {
    ...base,
    ...policyIdentity,
    decision,
    matchedRuleIds: rules.map((rule) => rule.ruleId),
    findings,
  };
}

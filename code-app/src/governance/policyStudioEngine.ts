import {
  evaluateBankCreditGovernance,
  GOVERNED_CREDIT_ACTIONS,
  type BankCreditGovernancePolicy,
  type CreditGovernanceRule,
  type GovernedCreditAction,
} from './bankCreditGovernanceEngine';
import {
  assignmentToGrant,
  type CommitteeConfiguration,
  type PolicyComparison,
  type PolicyProfileKind,
  type PolicySimulationInput,
  type PolicySimulationResult,
  type PolicyStudioAuditAction,
  type PolicyStudioAuditEntry,
  type PolicyStudioState,
  type PolicyStudioVersion,
  type PolicyTemplate,
  type PolicyValidationReport,
  type RoleCombinationControl,
  type StudioAuthorityAssignment,
  type StudioDiagnostic,
} from './policyStudioTypes';

const ACTIONS: readonly GovernedCreditAction[] = GOVERNED_CREDIT_ACTIONS;

function id(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function policyFor(kind: PolicyProfileKind): BankCreditGovernancePolicy {
  let rules: CreditGovernanceRule[] = ACTIONS.map((action) => ({
    ruleId: `base-${action.toLowerCase()}`,
    description: `Base ${action.toLowerCase()} control.`,
    actions: [action],
    requirements: {
      actorRoles: [kind === 'COMMITTEE' && action === 'APPROVE' ? 'credit-administrator' : 'authorized-officer'],
      delegatedAuthorityRequired: true,
    },
    nonOverrideable: true,
  }));
  if (kind === 'DUAL_APPROVAL') {
    rules.push({
      ruleId: 'dual-approval',
      description: 'A second distinct approval is required.',
      actions: ['APPROVE'],
      requirements: {
        approvalGroups: [{ groupId: 'dual', approvalsRequired: 2, distinctActors: true }],
      },
      nonOverrideable: true,
    });
  }
  if (kind === 'COMMITTEE') {
    rules.push({
      ruleId: 'committee-approval',
      description: 'Credit committee approval is required.',
      actions: ['APPROVE'],
      requirements: {
        approvalGroups: [{
          groupId: 'credit-committee',
          approvalsRequired: 3,
          committeeId: 'credit-committee',
          distinctActors: true,
        }],
      },
      nonOverrideable: true,
    });
  }
  if (kind === 'HYBRID') {
    rules.push({
      ruleId: 'hybrid-large-exposure',
      description: 'Large relationships require committee approval.',
      actions: ['APPROVE'],
      when: { minimumRelationshipExposure: 0 },
      requirements: {
        approvalGroups: [{
          groupId: 'senior-credit',
          approvalsRequired: 3,
          committeeId: 'senior-credit',
          distinctActors: true,
        }],
      },
      nonOverrideable: true,
    });
  }
  const separated = kind === 'SEGREGATED'
    ? ACTIONS.flatMap((action, index) => ACTIONS.slice(0, index).map((priorAction) => ({
        controlId: `${action}-${priorAction}`,
        action,
        priorAction,
        permitted: false,
        nonOverrideable: true,
      })))
    : kind === 'DUAL_APPROVAL'
      ? [{
          controlId: 'approve-originate',
          action: 'APPROVE' as const,
          priorAction: 'ORIGINATE' as const,
          permitted: false,
          nonOverrideable: true,
        }]
      : [];
  rules = rules.map((rule) => {
    const independentFrom = separated
      .filter((control) => control.action === rule.actions[0])
      .map((control) => control.priorAction);
    return independentFrom.length === 0
      ? rule
      : { ...rule, requirements: { ...rule.requirements, independentFrom } };
  });
  return {
    policyId: `template-${kind.toLowerCase()}`,
    version: 1,
    status: 'DRAFT',
    effectiveFrom: new Date(0).toISOString(),
    rules,
  };
}

function committee(
  committeeId: string,
  name: string,
  approvalsRequired: number,
): CommitteeConfiguration {
  return {
    committeeId,
    name,
    eligibleRoles: ['credit-voter'],
    quorumRequired: approvalsRequired,
    approvalsRequired,
    unanimous: false,
    abstentionsCountTowardQuorum: true,
    recusedActors: [],
  };
}

export const POLICY_STUDIO_TEMPLATES: readonly PolicyTemplate[] = [
  ['SINGLE_OFFICER', 'Single authorized officer', 'Permits combined duties when delegated authority covers the action.'],
  ['DUAL_APPROVAL', 'Dual approval', 'Requires two distinct approvals and independent approval from origination.'],
  ['SEGREGATED', 'Fully segregated', 'Requires each downstream action to be independent from prior duties.'],
  ['COMMITTEE', 'Committee approval', 'Requires a configured committee and distinct votes.'],
  ['HYBRID', 'Hybrid threshold/risk', 'Adds committee routing for larger relationship exposure.'],
].map(([kind, title, description]) => {
  const typedKind = kind as PolicyProfileKind;
  const policy = policyFor(typedKind);
  const committees = typedKind === 'COMMITTEE'
    ? [committee('credit-committee', 'Credit committee', 3)]
    : typedKind === 'HYBRID'
      ? [committee('senior-credit', 'Senior credit committee', 3)]
      : [];
  return {
    kind: typedKind,
    title,
    description,
    approvalGroups: policy.rules.flatMap((rule) => rule.requirements.approvalGroups ?? []),
    policy,
    tiers: typedKind === 'HYBRID'
      ? [{
          tierId: 'large-relationship',
          label: 'Configure relationship threshold',
          minimumRelationshipExposure: 0,
          requiredApprovalGroupIds: ['senior-credit'],
        }]
      : [],
    combinations: deriveCombinationControls(policy),
    committees,
  };
});

function deriveCombinationControls(policy: BankCreditGovernancePolicy): RoleCombinationControl[] {
  return policy.rules.flatMap((rule) =>
    (rule.requirements.independentFrom ?? []).map((priorAction) => ({
      controlId: `${rule.ruleId}-${priorAction}`,
      action: rule.actions[0]!,
      priorAction,
      permitted: false,
      nonOverrideable: rule.nonOverrideable,
    })),
  );
}

function audit(
  profileId: string,
  versionId: string,
  action: PolicyStudioAuditAction,
  actorId: string,
  occurredAt: string,
  reason: string,
): PolicyStudioAuditEntry {
  return { auditId: id('audit'), profileId, studioVersionId: versionId, action, actorId, occurredAt, reason };
}

function replaceVersion(
  state: PolicyStudioState,
  next: PolicyStudioVersion,
  entry: PolicyStudioAuditEntry,
): PolicyStudioState {
  return {
    ...state,
    profiles: state.profiles.map((profile) => profile.profileId === next.profileId
      ? { ...profile, versions: profile.versions.map((version) => version.studioVersionId === next.studioVersionId ? next : version) }
      : profile),
    audit: [...state.audit, entry],
  };
}

export function emptyPolicyStudioState(): PolicyStudioState {
  return { profiles: [], audit: [], activationState: 'NO_GO' };
}

export function createPolicyProfile(
  state: PolicyStudioState,
  input: { bankKey: string; name: string; templateKind: PolicyProfileKind; actorId: string; now: string },
): PolicyStudioState {
  const template = POLICY_STUDIO_TEMPLATES.find((item) => item.kind === input.templateKind)!;
  const profileId = id('profile');
  const versionId = id('version');
  const version: PolicyStudioVersion = {
    studioVersionId: versionId,
    profileId,
    versionNumber: 1,
    status: 'DRAFT',
    title: `${input.name} v1`,
    profileKind: input.templateKind,
    policy: {
      ...structuredClone(template.policy),
      policyId: id('policy'),
      effectiveFrom: input.now,
    },
    exposureTiers: structuredClone(template.tiers),
    roleCombinationControls: structuredClone(template.combinations),
    committees: structuredClone(template.committees),
    authorityAssignments: [],
    createdBy: input.actorId,
    createdAt: input.now,
  };
  return {
    ...state,
    profiles: [...state.profiles, { profileId, bankKey: input.bankKey, name: input.name, versions: [version] }],
    audit: [...state.audit, audit(profileId, versionId, 'CREATED', input.actorId, input.now, `Created from ${input.templateKind} template.`)],
  };
}

export function clonePolicyVersion(
  state: PolicyStudioState,
  source: PolicyStudioVersion,
  actorId: string,
  now: string,
): PolicyStudioState {
  const profile = state.profiles.find((item) => item.profileId === source.profileId)!;
  const nextNumber = Math.max(...profile.versions.map((item) => item.versionNumber)) + 1;
  const cloned: PolicyStudioVersion = {
    ...structuredClone(source),
    studioVersionId: id('version'),
    versionNumber: nextNumber,
    status: 'DRAFT',
    title: `${profile.name} v${nextNumber}`,
    policy: { ...structuredClone(source.policy), version: nextNumber, status: 'DRAFT' },
    createdBy: actorId,
    createdAt: now,
    approvedBy: undefined,
    approvedAt: undefined,
    scheduledFor: undefined,
    activatedAt: undefined,
    supersedesVersionId: source.studioVersionId,
  };
  return {
    ...state,
    profiles: state.profiles.map((item) => item.profileId === profile.profileId
      ? { ...item, versions: [...item.versions, cloned] }
      : item),
    audit: [...state.audit, audit(profile.profileId, cloned.studioVersionId, 'CLONED', actorId, now, `Cloned version ${source.versionNumber}.`)],
  };
}

export function editDraftVersion(
  state: PolicyStudioState,
  version: PolicyStudioVersion,
  patch: Partial<Pick<PolicyStudioVersion, 'title' | 'policy' | 'exposureTiers' | 'roleCombinationControls' | 'committees'>>,
  actorId: string,
  now: string,
): PolicyStudioState {
  if (version.status !== 'DRAFT') throw new Error('Only a draft policy version may be edited.');
  const next = { ...version, ...structuredClone(patch) };
  return replaceVersion(state, next, audit(version.profileId, version.studioVersionId, 'EDITED', actorId, now, 'Edited draft policy configuration.'));
}

function overlaps(left: StudioAuthorityAssignment, right: StudioAuthorityAssignment): boolean {
  const leftEnd = Date.parse(left.effectiveThrough ?? '9999-12-31');
  const rightEnd = Date.parse(right.effectiveThrough ?? '9999-12-31');
  return Date.parse(left.effectiveFrom) <= rightEnd && Date.parse(right.effectiveFrom) <= leftEnd;
}

export function validateStudioVersion(version: PolicyStudioVersion, at = new Date().toISOString()): PolicyValidationReport {
  const diagnostics: StudioDiagnostic[] = [];
  if (version.policy.rules.length === 0) diagnostics.push({ code: 'NO_RULES', severity: 'ERROR', message: 'Policy contains no rules.' });
  const ruleIds = new Set<string>();
  for (const rule of version.policy.rules) {
    if (ruleIds.has(rule.ruleId)) diagnostics.push({ code: 'DUPLICATE_RULE_ID', severity: 'ERROR', message: `Duplicate rule ID ${rule.ruleId}.`, subjectId: rule.ruleId });
    ruleIds.add(rule.ruleId);
    for (const group of rule.requirements.approvalGroups ?? []) {
      if (group.approvalsRequired < 1) diagnostics.push({ code: 'INVALID_APPROVAL_COUNT', severity: 'ERROR', message: `Approval group ${group.groupId} requires fewer than one approval.` });
      if (group.committeeId && !version.committees.some((item) => item.committeeId === group.committeeId)) {
        diagnostics.push({ code: 'MISSING_COMMITTEE', severity: 'ERROR', message: `Committee ${group.committeeId} is not configured.` });
      }
    }
  }
  for (const committeeConfig of version.committees) {
    if (committeeConfig.quorumRequired < committeeConfig.approvalsRequired) {
      diagnostics.push({ code: 'QUORUM_BELOW_APPROVALS', severity: 'ERROR', message: `${committeeConfig.name} quorum is below its approval requirement.` });
    }
    if (committeeConfig.eligibleRoles.length === 0) {
      diagnostics.push({ code: 'COMMITTEE_NO_ELIGIBLE_ROLE', severity: 'ERROR', message: `${committeeConfig.name} has no eligible voting role.` });
    }
  }
  const combinationKeys = new Set<string>();
  for (const control of version.roleCombinationControls) {
    const key = `${control.action}:${control.priorAction}`;
    if (control.action === control.priorAction) {
      diagnostics.push({ code: 'INVALID_ROLE_COMBINATION', severity: 'ERROR', message: 'An action cannot be independent from itself.', subjectId: control.controlId });
    }
    if (combinationKeys.has(key)) {
      diagnostics.push({ code: 'DUPLICATE_ROLE_COMBINATION', severity: 'ERROR', message: `Duplicate role-combination control ${key}.`, subjectId: control.controlId });
    }
    combinationKeys.add(key);
    const compiled = version.policy.rules.some((rule) =>
      rule.actions.includes(control.action) &&
      (rule.requirements.independentFrom ?? []).includes(control.priorAction));
    if (!control.permitted && !compiled) {
      diagnostics.push({ code: 'UNCOMPILED_ROLE_COMBINATION', severity: 'ERROR', message: `${key} is prohibited in the studio but absent from policy rules.`, subjectId: control.controlId });
    }
  }
  const now = Date.parse(at);
  for (const assignment of version.authorityAssignments) {
    if (!assignment.userId.trim()) diagnostics.push({ code: 'MISSING_IDENTITY_CHAIN', severity: 'ERROR', message: 'Authority assignment has no resolved user ID.', subjectId: assignment.assignmentId });
    if (assignment.actions.length === 0) diagnostics.push({ code: 'AUTHORITY_NO_ACTION', severity: 'ERROR', message: 'Authority assignment covers no action.', subjectId: assignment.assignmentId });
    if (assignment.effectiveThrough && Date.parse(assignment.effectiveThrough) < Date.parse(assignment.effectiveFrom)) {
      diagnostics.push({ code: 'INVERTED_AUTHORITY_DATES', severity: 'ERROR', message: 'Authority assignment ends before it begins.', subjectId: assignment.assignmentId });
    }
    if (assignment.effectiveThrough && Date.parse(assignment.effectiveThrough) < now) {
      diagnostics.push({ code: 'EXPIRED_AUTHORITY', severity: 'WARNING', message: `${assignment.userDisplayName || assignment.userId} has expired authority.`, subjectId: assignment.assignmentId });
    }
  }
  for (let index = 0; index < version.authorityAssignments.length; index += 1) {
    const left = version.authorityAssignments[index]!;
    for (const right of version.authorityAssignments.slice(index + 1)) {
      if (left.userId === right.userId && overlaps(left, right) && left.actions.some((action) => right.actions.includes(action)) &&
        left.products.some((product) => right.products.includes(product)) || (
          left.userId === right.userId &&
          left.products.length === 0 &&
          right.products.length === 0 &&
          overlaps(left, right) &&
          left.actions.some((action) => right.actions.includes(action))
        )) {
        const identicalLimits =
          left.maximumAmount === right.maximumAmount &&
          left.maximumRelationshipExposure === right.maximumRelationshipExposure;
        diagnostics.push({
          code: identicalLimits ? 'DUPLICATE_AUTHORITY' : 'AUTHORITY_CONFLICT',
          severity: 'ERROR',
          message: `${identicalLimits ? 'Duplicate' : 'Conflicting'} overlapping authority for ${left.userDisplayName || left.userId}.`,
          subjectId: left.userId,
        });
      }
    }
  }
  if (!diagnostics.some((item) => item.severity === 'ERROR')) {
    diagnostics.push({ code: 'VALID', severity: 'INFO', message: 'Policy version passed structural and authority validation.' });
  }
  return { valid: !diagnostics.some((item) => item.severity === 'ERROR'), diagnostics };
}

export function transitionPolicyVersion(
  state: PolicyStudioState,
  version: PolicyStudioVersion,
  action: 'SUBMIT' | 'APPROVE' | 'SCHEDULE' | 'ACTIVATE' | 'RETIRE',
  actorId: string,
  now: string,
  scheduledFor?: string,
): PolicyStudioState {
  const report = validateStudioVersion(version, now);
  let next: PolicyStudioVersion;
  let auditAction: PolicyStudioAuditAction;
  if (action === 'SUBMIT') {
    if (version.status !== 'DRAFT' || !report.valid) throw new Error('Only a valid draft may be submitted.');
    next = { ...version, status: 'PENDING_APPROVAL' };
    auditAction = 'SUBMITTED';
  } else if (action === 'APPROVE') {
    if (version.status !== 'PENDING_APPROVAL') throw new Error('Only a pending version may be approved.');
    if (version.createdBy === actorId) throw new Error('Policy maker and approver must be different users.');
    next = { ...version, status: 'APPROVED', approvedBy: actorId, approvedAt: now };
    auditAction = 'APPROVED';
  } else if (action === 'SCHEDULE') {
    if (version.status !== 'APPROVED' || !scheduledFor || Date.parse(scheduledFor) <= Date.parse(now)) {
      throw new Error('Only an approved version may be scheduled for a future time.');
    }
    next = { ...version, status: 'SCHEDULED', scheduledFor };
    auditAction = 'SCHEDULED';
  } else if (action === 'ACTIVATE') {
    if (!['APPROVED', 'SCHEDULED'].includes(version.status) || !version.approvedBy) throw new Error('Only an independently approved version may activate.');
    if (version.scheduledFor && Date.parse(version.scheduledFor) > Date.parse(now)) throw new Error('Scheduled activation time has not arrived.');
    next = { ...version, status: 'ACTIVE', activatedAt: now, policy: { ...version.policy, status: 'ACTIVE', effectiveFrom: now } };
    auditAction = 'ACTIVATED';
  } else {
    if (version.status !== 'ACTIVE') throw new Error('Only an active version may retire.');
    next = { ...version, status: 'RETIRED', policy: { ...version.policy, status: 'RETIRED', effectiveThrough: now } };
    auditAction = 'RETIRED';
  }
  let nextState = replaceVersion(state, next, audit(version.profileId, version.studioVersionId, auditAction, actorId, now, action));
  if (action === 'ACTIVATE') {
    const profile = nextState.profiles.find((item) => item.profileId === version.profileId)!;
    for (const prior of profile.versions.filter((item) => item.studioVersionId !== version.studioVersionId && item.status === 'ACTIVE')) {
      nextState = replaceVersion(
        nextState,
        { ...prior, status: 'SUPERSEDED', policy: { ...prior.policy, status: 'RETIRED', effectiveThrough: now } },
        audit(prior.profileId, prior.studioVersionId, 'SUPERSEDED', actorId, now, `Superseded by version ${version.versionNumber}.`),
      );
    }
  }
  return nextState;
}

export function addAuthorityAssignment(
  state: PolicyStudioState,
  version: PolicyStudioVersion,
  assignment: Omit<StudioAuthorityAssignment, 'assignmentId'>,
  actorId: string,
  now: string,
): PolicyStudioState {
  if (version.status !== 'DRAFT') throw new Error('Authority may be assigned only on a draft version.');
  const created = { ...assignment, assignmentId: id('authority') };
  const next = { ...version, authorityAssignments: [...version.authorityAssignments, created] };
  return replaceVersion(state, next, audit(version.profileId, version.studioVersionId, 'AUTHORITY_ASSIGNED', actorId, now, `Assigned scoped authority to ${assignment.userDisplayName || assignment.userId}.`));
}

function assignmentMatches(
  assignment: StudioAuthorityAssignment,
  simulation: PolicySimulationInput,
  evaluatedAt: string,
): boolean {
  const at = Date.parse(evaluatedAt);
  return assignment.userId === simulation.actorId &&
    assignment.actions.includes(simulation.action) &&
    Date.parse(assignment.effectiveFrom) <= at &&
    (!assignment.effectiveThrough || Date.parse(assignment.effectiveThrough) >= at) &&
    (assignment.products.length === 0 || assignment.products.some((item) => item.toLowerCase() === simulation.facts.product.toLowerCase())) &&
    (assignment.riskRatings.length === 0 || assignment.riskRatings.includes(simulation.facts.riskRating)) &&
    (assignment.geographies.length === 0 || assignment.geographies.some((item) => item.toLowerCase() === simulation.facts.geography.toLowerCase())) &&
    (assignment.industries.length === 0 || assignment.industries.some((item) => item.toLowerCase() === simulation.facts.industry.toLowerCase()));
}

export function simulatePolicyVersion(
  version: PolicyStudioVersion,
  simulation: PolicySimulationInput,
  evaluatedAt = new Date().toISOString(),
): PolicySimulationResult {
  const assignment = version.authorityAssignments.find((item) =>
    assignmentMatches(item, simulation, evaluatedAt));
  const actor = assignment ? {
    actorId: assignment.userId,
    roles: assignment.roles,
    committeeMemberships: version.committees
      .filter((item) => !item.recusedActors.includes(assignment.userId))
      .map((item) => item.committeeId),
    authorityGrants: [assignmentToGrant(assignment)],
  } : undefined;
  let evaluation = evaluateBankCreditGovernance({
    evaluationId: id('simulation'),
    evaluatedAt,
    action: simulation.action,
    policy: { ...version.policy, status: 'ACTIVE', effectiveFrom: new Date(0).toISOString() },
    facts: simulation.facts,
    actor,
    actionHistory: simulation.actionHistory,
    approvals: simulation.approvals.filter((approval) =>
      !version.committees.some((item) => item.recusedActors.includes(approval.actorId))),
  });
  const requiredCommitteeIds = new Set(
    version.policy.rules
      .filter((rule) => evaluation.matchedRuleIds.includes(rule.ruleId))
      .flatMap((rule) => rule.requirements.approvalGroups ?? [])
      .flatMap((group) => group.committeeId ? [group.committeeId] : []),
  );
  const committeeFindings = version.committees
    .filter((committeeConfig) => requiredCommitteeIds.has(committeeConfig.committeeId))
    .flatMap((committeeConfig) => {
    const votes = simulation.approvals.filter((approval) =>
      approval.committeeId === committeeConfig.committeeId &&
      !committeeConfig.recusedActors.includes(approval.actorId));
    const quorumVotes = votes.filter((vote) =>
      vote.decision !== 'ABSTAIN' || committeeConfig.abstentionsCountTowardQuorum);
    const distinctVoters = new Set(quorumVotes.map((vote) => vote.actorId)).size;
    const findings = [];
    if (distinctVoters < committeeConfig.quorumRequired) {
      findings.push({
        code: 'COMMITTEE_ACTION_REQUIRED' as const,
        message: `${committeeConfig.name} quorum requires ${committeeConfig.quorumRequired} distinct eligible voters; ${distinctVoters} were supplied.`,
        nonOverrideable: true,
        evidenceIds: quorumVotes.map((vote) => vote.approvalId),
      });
    }
    if (
      (committeeConfig.maximumAmount !== undefined &&
        simulation.facts.amount > committeeConfig.maximumAmount) ||
      (committeeConfig.maximumRelationshipExposure !== undefined &&
        simulation.facts.totalRelationshipExposure > committeeConfig.maximumRelationshipExposure)
    ) {
      findings.push({
        code: 'MANDATORY_ESCALATION' as const,
        message: `${committeeConfig.name} authority limit is exceeded.`,
        nonOverrideable: true,
        evidenceIds: [] as string[],
      });
    }
      return findings;
    });
  if (committeeFindings.length > 0) {
    evaluation = {
      ...evaluation,
      decision: 'BLOCK',
      findings: [...evaluation.findings, ...committeeFindings],
    };
  }
  const explanation = [
    `Matched rules: ${evaluation.matchedRuleIds.join(', ') || 'none'}.`,
    assignment ? `Selected authority assignment ${assignment.assignmentId}.` : 'No effective scoped authority assignment matched.',
    ...evaluation.findings.map((item) => `${item.code}: ${item.message}`),
  ];
  return { evaluation, selectedAssignment: assignment, selectedActor: actor, explanation };
}

export function comparePolicyVersions(from: PolicyStudioVersion, to: PolicyStudioVersion): PolicyComparison {
  const weaker: string[] = [];
  const stronger: string[] = [];
  const neutral: string[] = [];
  if (to.policy.rules.length < from.policy.rules.length) weaker.push('Fewer policy rules apply.');
  if (to.policy.rules.length > from.policy.rules.length) stronger.push('Additional policy rules apply.');
  const fromIndependent = from.roleCombinationControls.filter((item) => !item.permitted).length;
  const toIndependent = to.roleCombinationControls.filter((item) => !item.permitted).length;
  if (toIndependent < fromIndependent) weaker.push('Fewer role-separation controls are required.');
  if (toIndependent > fromIndependent) stronger.push('More role-separation controls are required.');
  const fromApprovals = Math.max(0, ...from.committees.map((item) => item.approvalsRequired));
  const toApprovals = Math.max(0, ...to.committees.map((item) => item.approvalsRequired));
  if (toApprovals < fromApprovals) weaker.push('Maximum committee approval requirement decreased.');
  if (toApprovals > fromApprovals) stronger.push('Maximum committee approval requirement increased.');
  const fromMax = Math.max(0, ...from.authorityAssignments.map((item) => item.maximumAmount ?? 0));
  const toMax = Math.max(0, ...to.authorityAssignments.map((item) => item.maximumAmount ?? 0));
  if (toMax > fromMax) weaker.push('Maximum delegated amount increased.');
  if (toMax < fromMax) stronger.push('Maximum delegated amount decreased.');
  if (weaker.length === 0 && stronger.length === 0) neutral.push('No classified control-strength change detected.');
  return { fromVersionId: from.studioVersionId, toVersionId: to.studioVersionId, weakerControls: weaker, strongerControls: stronger, neutralChanges: neutral };
}

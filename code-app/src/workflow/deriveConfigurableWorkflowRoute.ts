/**
 * Phase 142C — Configurable workflow route derivation engine.
 *
 * PURE, READ-ONLY decision support. Evaluates declarative route rules by
 * priority, selects the highest-priority match, and returns the route, stages,
 * checkpoints, committee requirement, blockers, and next best actions. It creates
 * no tasks, mutates no stages, and NEVER approves credit. Missing core data or
 * conflicting top-priority rules return `route_review_required`.
 */

import { WORKFLOW_ROUTE_RULE_REGISTRY } from './workflowRouteRuleRegistry';
import { deriveCreditCommitteeRoute } from './deriveCreditCommitteeRoute';
import { buildRouteStages, deriveWorkflowStageSequence } from './deriveWorkflowStageSequence';
import {
  DEFAULT_WORKFLOW_POLICY_THRESHOLDS,
  type WorkflowRoutingInput,
  type WorkflowRouteRule,
  type WorkflowRouteRuleCondition,
  type WorkflowRouteDerivationResult,
  type WorkflowRouteStatus,
  type WorkflowApprovalCheckpoint,
  type WorkflowRoutingBlocker,
  type WorkflowRoutingWarning,
  type WorkflowPolicyThresholds,
} from './workflowRoutingConfigTypes';

const ROUTE_NAMES: Record<string, string> = {
  small_business_standard: 'Small business — standard',
  sba_7a_standard: 'SBA 7(a) — standard',
  commercial_real_estate: 'Commercial real estate',
  construction_or_project_based: 'Construction / project-based',
  working_capital_line: 'Working capital line',
  annual_review_standard: 'Annual review — standard',
  annual_review_with_covenant_exception: 'Annual review — covenant exception',
  annual_review_missing_financials: 'Annual review — missing financials',
  annual_review_package_review: 'Annual review — package review',
  portfolio_boarded_loan_review: 'Portfolio boarded-loan review',
  exception_remediation: 'Exception remediation',
  credit_committee_required: 'Credit committee required',
  executive_visibility_required: 'Executive visibility required',
  fdic_examiner_package_required: 'FDIC / examiner package',
  review_required: 'Review required (insufficient routing data)',
};

const CHECKPOINT_META: Record<string, [string, string]> = {
  manager_review: ['Manager review', 'manager'],
  committee_review: ['Credit committee review', 'manager'],
  sba_eligibility: ['SBA eligibility review', 'manager'],
};

function fieldValue(input: WorkflowRoutingInput, field: WorkflowRouteRuleCondition['field']): unknown {
  return input[field];
}

export function evaluateWorkflowCondition(input: WorkflowRoutingInput, c: WorkflowRouteRuleCondition): boolean {
  const v = fieldValue(input, c.field);
  switch (c.operator) {
    case 'equals': return v === c.value;
    case 'not_equals': return v !== c.value;
    case 'in': return Array.isArray(c.value) && (c.value as readonly unknown[]).includes(v);
    case 'not_in': return Array.isArray(c.value) && !(c.value as readonly unknown[]).includes(v);
    case 'greater_than': return typeof v === 'number' && typeof c.value === 'number' && v > c.value;
    case 'greater_than_or_equal': return typeof v === 'number' && typeof c.value === 'number' && v >= c.value;
    case 'less_than': return typeof v === 'number' && typeof c.value === 'number' && v < c.value;
    case 'less_than_or_equal': return typeof v === 'number' && typeof c.value === 'number' && v <= c.value;
    case 'exists': return v !== undefined && v !== null;
    case 'missing': return v === undefined || v === null;
    case 'truthy': return Boolean(v);
    case 'falsy': return !v;
    default: return false;
  }
}

function ruleMatches(input: WorkflowRoutingInput, rule: WorkflowRouteRule): boolean {
  return rule.conditions.every((c) => evaluateWorkflowCondition(input, c));
}

function checkpoint(key: string): WorkflowApprovalCheckpoint {
  const [label, role] = CHECKPOINT_META[key] ?? [key, 'manager'];
  return { checkpointKey: key, label, requiredRole: role, finalApproval: false };
}

function hasAnyRoutingSignal(input: WorkflowRoutingInput): boolean {
  return (
    (input.productType !== undefined && input.productType !== 'unknown') ||
    input.annualReviewDueStatus === 'due' || input.annualReviewDueStatus === 'past_due' ||
    input.portfolioBoardingStatus === 'boarded' ||
    input.exceptionStatus === 'open' ||
    input.requestedAction !== undefined ||
    (typeof input.amount === 'number')
  );
}

export interface DeriveConfigurableWorkflowRouteInput {
  input: WorkflowRoutingInput;
  rules?: readonly WorkflowRouteRule[];
  thresholds?: WorkflowPolicyThresholds;
}

function reviewRequiredResult(input: WorkflowRoutingInput, reason: string, matched: readonly string[], evaluated: number): WorkflowRouteDerivationResult {
  const committee = deriveCreditCommitteeRoute({ input, routeKey: 'review_required', committeePolicy: 'none' });
  return {
    routeKey: 'review_required',
    routeName: ROUTE_NAMES.review_required,
    confidence: 'low',
    routeStatus: 'route_review_required',
    stages: buildRouteStages(['intake']),
    approvalCheckpoints: [],
    creditCommittee: committee,
    requiredRoles: ['banker'],
    requiredPackages: [],
    requiredEvidence: [],
    blockers: [{ code: 'insufficient_routing_data', message: reason }],
    warnings: [],
    nextBestActions: [{ code: 'gather_routing_data', label: 'Gather the product / amount / review context to route.' }],
    auditSummary: { routeKey: 'review_required', evaluatedRuleCount: evaluated, matchedRuleKeys: matched, containsCreditDecision: false, readOnly: true },
    readOnly: true,
    canMutateWorkflow: false,
    canApproveCredit: false,
  };
}

export function deriveConfigurableWorkflowRoute(
  args: DeriveConfigurableWorkflowRouteInput,
): WorkflowRouteDerivationResult {
  const { input } = args;
  const rules = args.rules ?? WORKFLOW_ROUTE_RULE_REGISTRY;
  const thresholds = args.thresholds ?? DEFAULT_WORKFLOW_POLICY_THRESHOLDS;

  const matched = rules.filter((r) => ruleMatches(input, r)).sort((a, b) => b.priority - a.priority);
  const matchedKeys = matched.map((r) => r.ruleKey);

  if (matched.length === 0) {
    return reviewRequiredResult(input, hasAnyRoutingSignal(input) ? 'No route rule matched the provided context.' : 'Insufficient routing data (no product / amount / review context).', matchedKeys, rules.length);
  }

  // Conflict: two top-priority rules pointing at different routes.
  const top = matched[0];
  if (matched[1] && matched[1].priority === top.priority && matched[1].routeKey !== top.routeKey) {
    return reviewRequiredResult(input, 'Conflicting top-priority route rules; human review required.', matchedKeys, rules.length);
  }

  const rule = top;
  const stages = buildRouteStages(rule.requiredStages);
  const evidenceComplete = input.packageReadiness === 'review_ready' ? true : input.packageReadiness === 'blocked' ? false : undefined;

  const committee = deriveCreditCommitteeRoute({
    input, routeKey: rule.routeKey, committeePolicy: rule.committeePolicy,
    packageReadiness: input.packageReadiness, covenantStatus: input.covenantStatus, evidenceComplete, thresholds,
  });

  const seq = deriveWorkflowStageSequence({ stages, currentStageKey: input.stage, input, evidenceComplete });

  const blockers: WorkflowRoutingBlocker[] = [
    ...rule.blockers.map((b) => ({ code: 'rule_blocker', message: b })),
    ...seq.blockers,
  ];
  const warnings: WorkflowRoutingWarning[] = rule.warnings.map((w) => ({ code: 'rule_warning', message: w }));

  let routeStatus: WorkflowRouteStatus;
  if (blockers.length > 0) routeStatus = 'route_blocked_missing_data';
  else if (warnings.length > 0 || input.packageReadiness === 'draft_ready_with_caveats') routeStatus = 'route_ready_with_caveats';
  else routeStatus = 'route_ready';

  const nextBestActions: { code: string; label: string }[] = [];
  if (blockers.length > 0) nextBestActions.push({ code: 'resolve_blockers', label: 'Resolve the missing data / evidence blockers.' });
  if (committee.committeeRequired) nextBestActions.push(committee.nextBestAction);
  if (nextBestActions.length === 0) nextBestActions.push({ code: 'proceed_route', label: 'Proceed along the derived route stages (read-only).' });

  return {
    routeKey: rule.routeKey,
    routeName: ROUTE_NAMES[rule.routeKey] ?? rule.routeKey,
    confidence: routeStatus === 'route_ready' ? 'high' : routeStatus === 'route_ready_with_caveats' ? 'medium' : 'low',
    routeStatus,
    stages,
    currentStageKey: seq.currentStage,
    nextStageKey: seq.nextStage,
    approvalCheckpoints: rule.approvalCheckpoints.map(checkpoint),
    creditCommittee: committee,
    requiredRoles: rule.requiredRoles,
    requiredPackages: rule.packageRequirements,
    requiredEvidence: rule.evidenceRequirements,
    blockers,
    warnings,
    nextBestActions,
    auditSummary: { routeKey: rule.routeKey, evaluatedRuleCount: rules.length, matchedRuleKeys: matchedKeys, containsCreditDecision: false, readOnly: true },
    readOnly: true,
    canMutateWorkflow: false,
    canApproveCredit: false,
  };
}

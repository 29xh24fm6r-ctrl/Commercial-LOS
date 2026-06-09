/**
 * Phase 142C — Workflow routing readiness summary deriver.
 *
 * PURE, READ-ONLY. Combines the route derivation result + committee route + stage
 * sequence into an operational readiness summary. A committee-required route
 * cannot be ready while package/evidence is missing; an annual-review route
 * cannot be ready while covenants are unknown. Next best actions are operational,
 * never approval/decision language.
 */

import type {
  WorkflowRouteDerivationResult,
  WorkflowRoutingInput,
  WorkflowRoutingBlocker,
  WorkflowRoutingWarning,
} from './workflowRoutingConfigTypes';

export type WorkflowRoutingReadinessStatus =
  | 'ready_for_review'
  | 'ready_with_caveats'
  | 'blocked_missing_data'
  | 'blocked_missing_evidence'
  | 'blocked_policy_review'
  | 'blocked_permission'
  | 'review_required';

export interface WorkflowRoutingReadinessResult {
  readinessStatus: WorkflowRoutingReadinessStatus;
  blockers: readonly WorkflowRoutingBlocker[];
  warnings: readonly WorkflowRoutingWarning[];
  nextBestActions: readonly { code: string; label: string }[];
  requiredMaterials: readonly string[];
  missingMaterials: readonly string[];
  auditSummary: { routeKey: string; containsCreditDecision: false; readOnly: true };
}

export interface DeriveWorkflowRoutingReadinessInput {
  route: WorkflowRouteDerivationResult;
  input: WorkflowRoutingInput;
}

const ANNUAL_REVIEW_ROUTES = new Set([
  'annual_review_standard', 'annual_review_with_covenant_exception',
  'annual_review_missing_financials', 'annual_review_package_review',
]);

export function deriveWorkflowRoutingReadiness(
  args: DeriveWorkflowRoutingReadinessInput,
): WorkflowRoutingReadinessResult {
  const { route, input } = args;
  const committee = route.creditCommittee;

  const blockers: WorkflowRoutingBlocker[] = [...route.blockers, ...committee.blockers];
  const warnings: WorkflowRoutingWarning[] = [...route.warnings];

  const financialsMissing = input.documentReadiness === 'missing' || input.documentReadiness === 'partial';
  const covenantUnknown = input.covenantStatus === 'unknown' || input.covenantStatus === 'review_required';

  const requiredMaterials = Array.from(new Set([...route.requiredPackages, ...committee.requiredMaterials]));
  const missingMaterials = Array.from(new Set([
    ...committee.missingMaterials,
    ...(financialsMissing ? ['borrower_financials'] : []),
  ]));

  let readinessStatus: WorkflowRoutingReadinessStatus;
  if (route.routeStatus === 'route_review_required') readinessStatus = 'review_required';
  else if (route.routeStatus === 'route_blocked_permission') readinessStatus = 'blocked_permission';
  else if (financialsMissing) readinessStatus = 'blocked_missing_data';
  else if (committee.committeeRequired && committee.missingMaterials.length > 0) readinessStatus = 'blocked_missing_evidence';
  else if (ANNUAL_REVIEW_ROUTES.has(route.routeKey) && covenantUnknown) readinessStatus = 'blocked_missing_data';
  else if (route.routeStatus === 'route_ready_with_caveats') readinessStatus = 'ready_with_caveats';
  else readinessStatus = 'ready_for_review';

  const nextBestActions = route.nextBestActions.length > 0
    ? route.nextBestActions
    : [{ code: 'review_route', label: 'Review the derived route (read-only).' }];

  return {
    readinessStatus,
    blockers,
    warnings,
    nextBestActions,
    requiredMaterials,
    missingMaterials,
    auditSummary: { routeKey: route.routeKey, containsCreditDecision: false, readOnly: true },
  };
}

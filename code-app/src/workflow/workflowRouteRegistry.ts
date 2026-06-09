/**
 * Phase 142A — Workflow route registry (constants only).
 *
 * Static route templates. No route approves credit; approval checkpoints are
 * review findings (finalApproval: false). The deriver overlays dimension-driven
 * flags + blockers/warnings on top of these templates.
 */

import type { WorkflowRoute, WorkflowApprovalCheckpoint } from './workflowRoutingTypes';

function checkpoint(checkpointKey: string, label: string, requiredRole: string): WorkflowApprovalCheckpoint {
  return { checkpointKey, label, requiredRole, finalApproval: false };
}

function route(
  routeKey: string,
  displayName: string,
  stageSequence: readonly string[],
  requiredRoles: readonly string[],
  approvalCheckpoints: readonly WorkflowApprovalCheckpoint[],
  flags: Partial<Pick<WorkflowRoute, 'creditCommitteeRequired' | 'managerReviewRequired' | 'portfolioReviewRequired' | 'annualReviewRequired' | 'fdicPackageRequired' | 'boardPackageRequired'>> = {},
): WorkflowRoute {
  return {
    routeKey, displayName, stageSequence, requiredRoles, approvalCheckpoints,
    creditCommitteeRequired: flags.creditCommitteeRequired ?? false,
    managerReviewRequired: flags.managerReviewRequired ?? false,
    portfolioReviewRequired: flags.portfolioReviewRequired ?? false,
    annualReviewRequired: flags.annualReviewRequired ?? false,
    fdicPackageRequired: flags.fdicPackageRequired ?? false,
    boardPackageRequired: flags.boardPackageRequired ?? false,
    blockers: [], warnings: [],
  };
}

const ORIGINATION_STAGES = ['intake', 'documentation', 'underwriting', 'credit_review', 'closing_prep'];
const ANNUAL_REVIEW_STAGES = ['request', 'collection', 'spreading', 'covenant_testing', 'memo', 'review'];

export const WORKFLOW_ROUTE_REGISTRY: readonly WorkflowRoute[] = Object.freeze([
  route('small_business_standard', 'Small business — standard', ORIGINATION_STAGES, ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager')], { managerReviewRequired: true }),
  route('sba_7a_standard', 'SBA 7(a) — standard', [...ORIGINATION_STAGES, 'sba_eligibility'], ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager'), checkpoint('sba_eligibility', 'SBA eligibility review', 'manager')], { managerReviewRequired: true }),
  route('commercial_real_estate', 'Commercial real estate', [...ORIGINATION_STAGES, 'appraisal', 'environmental'], ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager')], { managerReviewRequired: true }),
  route('construction_or_project_based', 'Construction / project-based', [...ORIGINATION_STAGES, 'draw_schedule', 'inspection'], ['banker', 'manager'], [checkpoint('committee_review', 'Credit committee review', 'manager')], { managerReviewRequired: true, creditCommitteeRequired: true }),
  route('annual_review_standard', 'Annual review — standard', ANNUAL_REVIEW_STAGES, ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager')], { annualReviewRequired: true, managerReviewRequired: true }),
  route('annual_review_with_covenant_exception', 'Annual review — covenant exception', [...ANNUAL_REVIEW_STAGES, 'exception_finding'], ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager'), checkpoint('committee_review', 'Credit committee review', 'manager')], { annualReviewRequired: true, managerReviewRequired: true, creditCommitteeRequired: true, boardPackageRequired: true }),
  route('portfolio_boarded_loan_review', 'Portfolio boarded-loan review', ['intake', 'verification', 'monitoring_setup', 'review'], ['manager'], [checkpoint('manager_review', 'Manager review', 'manager')], { portfolioReviewRequired: true, managerReviewRequired: true }),
  route('exception_remediation', 'Exception remediation', ['identify', 'remediate', 'verify', 'close'], ['banker', 'manager'], [checkpoint('manager_review', 'Manager review', 'manager')], { managerReviewRequired: true }),
  route('credit_committee_required', 'Credit committee required', [...ORIGINATION_STAGES, 'committee'], ['banker', 'manager'], [checkpoint('committee_review', 'Credit committee review', 'manager')], { creditCommitteeRequired: true, managerReviewRequired: true }),
  route('review_required', 'Review required (insufficient routing data)', ['triage'], ['banker'], [], {}),
]);

export function getWorkflowRoute(routeKey: string): WorkflowRoute | undefined {
  return WORKFLOW_ROUTE_REGISTRY.find((r) => r.routeKey === routeKey);
}

/**
 * Phase 142C — Configurable workflow routing config types.
 *
 * A governed, READ-ONLY routing model for commercial lending, annual reviews,
 * portfolio boarding, exceptions, and credit committee routing. Route derivation
 * is DECISION SUPPORT only — it never mutates workflow state, creates tasks,
 * changes stages, or approves credit.
 */

import type {
  WorkflowProductType,
  WorkflowCustomerType,
  WorkflowChannel,
  WorkflowRiskLevel,
  WorkflowCovenantStatus,
  WorkflowAnnualReviewDueStatus,
  WorkflowDocumentReadiness,
  WorkflowPortfolioBoardingStatus,
} from './workflowRoutingTypes';

export type WorkflowPackageReadiness =
  | 'review_ready' | 'draft_ready_with_caveats' | 'blocked' | 'unknown';
export type WorkflowExceptionStatus = 'none' | 'open' | 'resolved' | 'unknown';

export interface WorkflowRoutingInput {
  dealId?: string;
  annualReviewId?: string;
  boardedLoanId?: string;
  productType?: WorkflowProductType;
  loanStructure?: string;
  amount?: number;
  customerType?: WorkflowCustomerType;
  channel?: WorkflowChannel;
  industryRisk?: WorkflowRiskLevel;
  collateralType?: string;
  guarantorStructure?: string;
  stage?: string;
  status?: string;
  documentReadiness?: WorkflowDocumentReadiness;
  annualReviewDueStatus?: WorkflowAnnualReviewDueStatus;
  covenantStatus?: WorkflowCovenantStatus;
  packageReadiness?: WorkflowPackageReadiness;
  relationshipRisk?: WorkflowRiskLevel;
  portfolioBoardingStatus?: WorkflowPortfolioBoardingStatus;
  exceptionStatus?: WorkflowExceptionStatus;
  requestedAction?: string;
  currentWorkspace?: string;
  currentUserRole?: string;
}

export interface WorkflowRoutingContext {
  policyThresholds?: WorkflowPolicyThresholds;
  permittedWorkspaces?: readonly string[];
}

export interface WorkflowPolicyThresholds {
  creditCommitteeAmount: number;
  seniorCommitteeAmount: number;
  executiveReviewAmount: number;
}

export type WorkflowConditionOperator =
  | 'equals' | 'not_equals' | 'in' | 'not_in'
  | 'greater_than' | 'greater_than_or_equal' | 'less_than' | 'less_than_or_equal'
  | 'exists' | 'missing' | 'truthy' | 'falsy';

export interface WorkflowRouteRuleCondition {
  field: keyof WorkflowRoutingInput;
  operator: WorkflowConditionOperator;
  value?: string | number | boolean | readonly (string | number)[];
}

export type WorkflowCommitteeType =
  | 'none' | 'credit_committee' | 'senior_credit_committee'
  | 'executive_credit_review' | 'board_visibility_only';

export interface WorkflowRouteRule {
  ruleKey: string;
  routeKey: string;
  priority: number;
  description: string;
  conditions: readonly WorkflowRouteRuleCondition[];
  requiredStages: readonly string[];
  approvalCheckpoints: readonly string[];
  requiredRoles: readonly string[];
  committeePolicy: WorkflowCommitteeType;
  packageRequirements: readonly string[];
  evidenceRequirements: readonly string[];
  blockers: readonly string[];
  warnings: readonly string[];
  riskClass: string;
}

export interface WorkflowRouteStage {
  stageKey: string;
  label: string;
  requiresEvidence: boolean;
  dependsOn: readonly string[];
}

export interface WorkflowApprovalCheckpoint {
  checkpointKey: string;
  label: string;
  requiredRole: string;
  /** STRUCTURAL: a checkpoint is a review finding, never a final approval. */
  finalApproval: false;
}

export interface WorkflowRoutingBlocker {
  code: string;
  message: string;
}
export interface WorkflowRoutingWarning {
  code: string;
  message: string;
}

export interface WorkflowRoutingAuditSummary {
  routeKey: string;
  evaluatedRuleCount: number;
  matchedRuleKeys: readonly string[];
  /** STRUCTURAL guarantees. */
  containsCreditDecision: false;
  readOnly: true;
}

export interface WorkflowCommitteeRoute {
  committeeRequired: boolean;
  committeeType: WorkflowCommitteeType;
  reasonCodes: readonly string[];
  requiredMaterials: readonly string[];
  missingMaterials: readonly string[];
  packageReadiness: WorkflowPackageReadiness;
  evidenceReadiness: 'complete' | 'partial' | 'missing' | 'unknown';
  /** STRUCTURAL: always false in this phase. */
  votingEnabled: false;
  approvalEnabled: false;
  blockers: readonly WorkflowRoutingBlocker[];
  warnings: readonly WorkflowRoutingWarning[];
  nextBestAction: { code: string; label: string };
}

export type WorkflowRouteStatus =
  | 'route_ready'
  | 'route_ready_with_caveats'
  | 'route_review_required'
  | 'route_blocked_missing_data'
  | 'route_blocked_permission'
  | 'route_disabled_not_configured';

export interface WorkflowRouteDefinition {
  routeKey: string;
  routeName: string;
  stages: readonly WorkflowRouteStage[];
  requiredRoles: readonly string[];
}

export interface WorkflowRouteDerivationResult {
  routeKey: string;
  routeName: string;
  confidence: 'high' | 'medium' | 'low';
  routeStatus: WorkflowRouteStatus;
  stages: readonly WorkflowRouteStage[];
  currentStageKey?: string;
  nextStageKey?: string;
  approvalCheckpoints: readonly WorkflowApprovalCheckpoint[];
  creditCommittee: WorkflowCommitteeRoute;
  requiredRoles: readonly string[];
  requiredPackages: readonly string[];
  requiredEvidence: readonly string[];
  blockers: readonly WorkflowRoutingBlocker[];
  warnings: readonly WorkflowRoutingWarning[];
  nextBestActions: readonly { code: string; label: string }[];
  auditSummary: WorkflowRoutingAuditSummary;
  /** STRUCTURAL guarantees — always read-only, never mutating, never approving. */
  readOnly: true;
  canMutateWorkflow: false;
  canApproveCredit: false;
}

export const DEFAULT_WORKFLOW_POLICY_THRESHOLDS: WorkflowPolicyThresholds = Object.freeze({
  creditCommitteeAmount: 5000000,
  seniorCommitteeAmount: 15000000,
  executiveReviewAmount: 50000000,
});

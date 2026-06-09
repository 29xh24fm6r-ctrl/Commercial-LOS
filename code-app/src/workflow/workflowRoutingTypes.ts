/**
 * Phase 142A — Workflow routing engine types.
 *
 * OpenCBS-style product/amount/client/channel routing + nCino-style stage
 * orchestration, as a READ-ONLY deriver. No task creation, no approval mutation,
 * and no route can approve credit. Missing product/amount data routes to review.
 */

export type WorkflowProductType =
  | 'small_business' | 'sba_7a' | 'cre' | 'construction' | 'working_capital' | 'unknown';
export type WorkflowAmountBand = 'small' | 'medium' | 'large' | 'jumbo' | 'unknown';
export type WorkflowCustomerType = 'new' | 'existing' | 'unknown';
export type WorkflowChannel = 'direct' | 'broker' | 'unknown';
export type WorkflowCovenantStatus = 'in_compliance' | 'breach' | 'review_required' | 'not_applicable' | 'unknown';
export type WorkflowAnnualReviewDueStatus = 'not_due' | 'due' | 'past_due' | 'unknown';
export type WorkflowDocumentReadiness = 'complete' | 'partial' | 'missing' | 'unknown';
export type WorkflowRiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type WorkflowPortfolioBoardingStatus = 'not_boarded' | 'boarded' | 'unknown';

export interface WorkflowRoutingInput {
  productType?: WorkflowProductType;
  loanStructure?: string;
  amountBand?: WorkflowAmountBand;
  customerType?: WorkflowCustomerType;
  collateralType?: string;
  guarantorStructure?: string;
  industryRisk?: WorkflowRiskLevel;
  channel?: WorkflowChannel;
  annualReviewDueStatus?: WorkflowAnnualReviewDueStatus;
  covenantStatus?: WorkflowCovenantStatus;
  documentReadiness?: WorkflowDocumentReadiness;
  relationshipRisk?: WorkflowRiskLevel;
  portfolioBoardingStatus?: WorkflowPortfolioBoardingStatus;
}

export interface WorkflowApprovalCheckpoint {
  checkpointKey: string;
  label: string;
  requiredRole: string;
  /** STRUCTURAL: a checkpoint is a review finding, never a final approval. */
  finalApproval: false;
}

export interface WorkflowRoute {
  routeKey: string;
  displayName: string;
  stageSequence: readonly string[];
  requiredRoles: readonly string[];
  approvalCheckpoints: readonly WorkflowApprovalCheckpoint[];
  creditCommitteeRequired: boolean;
  managerReviewRequired: boolean;
  portfolioReviewRequired: boolean;
  annualReviewRequired: boolean;
  fdicPackageRequired: boolean;
  boardPackageRequired: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

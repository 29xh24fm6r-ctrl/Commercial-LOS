/**
 * Phase 142D — Product / process template types.
 *
 * A governed, METADATA-ONLY template layer for commercial loan workflows.
 * Templates GUIDE workflow and readiness — they never create live products,
 * approve deals, mutate stages, create tasks, or override policy. No
 * user-editable templates, no schema mutation, no live product creation.
 */

export type ProductProcessTemplateType =
  | 'loan_product'
  | 'loan_structure'
  | 'annual_review'
  | 'portfolio_boarding'
  | 'exception_remediation'
  | 'fdic_exam_prep'
  | 'board_package'
  | 'servicing_lifecycle';

export type ProductProcessTemplateStatus =
  | 'active_template'
  | 'draft_template'
  | 'planned_template'
  | 'disabled_template'
  | 'review_required';

export type ProductProcessTemplateRiskClass =
  | 'metadata_only'
  | 'workflow_guidance'
  | 'credit_decision_support'
  | 'external_integration_disabled'
  | 'runtime_write_disabled';

export type ProductProcessTemplateSource =
  | 'static_governed_template'
  | 'live_dataverse_reference';

export interface ProductProcessTemplateRequirement {
  key: string;
  label: string;
  required: boolean;
  source: ProductProcessTemplateSource;
}

export interface ProductProcessDocumentRequirement {
  documentType: string;
  label: string;
  required: boolean;
  applicability?: string;
  source: ProductProcessTemplateSource;
}

export interface ProductProcessCovenantTemplate {
  covenantType: string;
  label: string;
  required: boolean;
  source: ProductProcessTemplateSource;
}

export interface ProductProcessEvidenceRequirement {
  evidenceKey: string;
  label: string;
  required: boolean;
  source: ProductProcessTemplateSource;
}

export interface ProductProcessWorkflowDefault {
  routeKey: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProductProcessApprovalCheckpoint {
  checkpointKey: string;
  label: string;
  requiredRole: string;
  /** STRUCTURAL: a checkpoint is a finding, never a final approval. */
  finalApproval: false;
}

export interface ProductProcessPackageRequirement {
  packageType: string;
  label: string;
}

export interface ProductProcessServicingExpectation {
  key: string;
  label: string;
}

export interface ProductProcessAnnualReviewExpectation {
  key: string;
  label: string;
}

export interface ProductProcessTemplateAuditSummary {
  templateKey: string;
  documentRequirementCount: number;
  covenantTemplateCount: number;
  evidenceRequirementCount: number;
  /** STRUCTURAL: templates are guidance, never live product/credit decisions. */
  containsLiveProductWrite: false;
  containsCreditDecision: false;
}

export interface ProductProcessTemplate {
  templateKey: string;
  displayName: string;
  templateType: ProductProcessTemplateType;
  productFamily: string;
  loanStructure?: string;
  customerType?: string;
  channel?: string;
  amountBand?: string;
  collateralTypes: readonly string[];
  guarantorRequirements: readonly string[];
  documentRequirements: readonly ProductProcessDocumentRequirement[];
  covenantTemplates: readonly ProductProcessCovenantTemplate[];
  evidenceRequirements: readonly ProductProcessEvidenceRequirement[];
  workflowDefaults: ProductProcessWorkflowDefault;
  approvalCheckpoints: readonly ProductProcessApprovalCheckpoint[];
  packageRequirements: readonly ProductProcessPackageRequirement[];
  servicingExpectations: readonly ProductProcessServicingExpectation[];
  annualReviewExpectations: readonly ProductProcessAnnualReviewExpectation[];
  riskClass: ProductProcessTemplateRiskClass;
  status: ProductProcessTemplateStatus;
  source: ProductProcessTemplateSource;
  caveats: readonly string[];
  auditSummary: ProductProcessTemplateAuditSummary;
}

export interface ProductProcessTemplateCatalog {
  templates: readonly ProductProcessTemplate[];
}

export interface ProductProcessTemplateBlocker {
  code: string;
  message: string;
}
export interface ProductProcessTemplateWarning {
  code: string;
  message: string;
}

export interface ProductProcessTemplateDerivationInput {
  productFamily?: string;
  loanStructure?: string;
  customerType?: string;
  channel?: string;
  amountBand?: string;
  annualReviewId?: string;
  boardedLoanId?: string;
  covenantStatus?: 'in_compliance' | 'breach' | 'review_required' | 'not_applicable' | 'unknown';
  fdicPackageRequired?: boolean;
  creditCommitteeRequired?: boolean;
  portfolioBoardingStatus?: 'not_boarded' | 'boarded' | 'unknown';
}

export interface ProductProcessTemplateDerivationResult {
  primaryTemplateKey?: string;
  companionTemplateKeys: readonly string[];
  candidateTemplateKeys: readonly string[];
  confidence: 'high' | 'medium' | 'low';
  status: ProductProcessTemplateStatus;
  blockers: readonly ProductProcessTemplateBlocker[];
  warnings: readonly ProductProcessTemplateWarning[];
  nextBestActions: readonly { code: string; label: string }[];
  /** STRUCTURAL: selection never mutates a deal / route / product. */
  readOnly: true;
}

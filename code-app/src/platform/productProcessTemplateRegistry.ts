/**
 * Phase 142D — Governed product / process template registry (constants only).
 *
 * Static governed templates for commercial loan workflows. Amount thresholds are
 * policy metadata (not financial facts), there is no live product creation, no
 * user-created templates, no fake borrower/product data, and no approval/voting.
 */

import type {
  ProductProcessTemplate,
  ProductProcessDocumentRequirement,
  ProductProcessCovenantTemplate,
  ProductProcessEvidenceRequirement,
  ProductProcessApprovalCheckpoint,
  ProductProcessPackageRequirement,
  ProductProcessServicingExpectation,
  ProductProcessAnnualReviewExpectation,
  ProductProcessWorkflowDefault,
  ProductProcessTemplateType,
  ProductProcessTemplateRiskClass,
} from './productProcessTemplateTypes';

const SRC = 'static_governed_template' as const;

function doc(documentType: string, label: string, required = true, applicability?: string): ProductProcessDocumentRequirement {
  return { documentType, label, required, applicability, source: SRC };
}
function cov(covenantType: string, label: string, required = true): ProductProcessCovenantTemplate {
  return { covenantType, label, required, source: SRC };
}
function ev(evidenceKey: string, label: string, required = true): ProductProcessEvidenceRequirement {
  return { evidenceKey, label, required, source: SRC };
}
function cp(checkpointKey: string, label: string, requiredRole: string): ProductProcessApprovalCheckpoint {
  return { checkpointKey, label, requiredRole, finalApproval: false };
}
function pkg(packageType: string, label: string): ProductProcessPackageRequirement {
  return { packageType, label };
}
function srv(key: string, label: string): ProductProcessServicingExpectation {
  return { key, label };
}
function arx(key: string, label: string): ProductProcessAnnualReviewExpectation {
  return { key, label };
}

interface TemplateSpec {
  templateKey: string;
  displayName: string;
  templateType: ProductProcessTemplateType;
  productFamily: string;
  loanStructure?: string;
  workflowDefault: ProductProcessWorkflowDefault;
  collateralTypes?: readonly string[];
  guarantorRequirements?: readonly string[];
  documentRequirements?: readonly ProductProcessDocumentRequirement[];
  covenantTemplates?: readonly ProductProcessCovenantTemplate[];
  evidenceRequirements?: readonly ProductProcessEvidenceRequirement[];
  approvalCheckpoints?: readonly ProductProcessApprovalCheckpoint[];
  packageRequirements?: readonly ProductProcessPackageRequirement[];
  servicingExpectations?: readonly ProductProcessServicingExpectation[];
  annualReviewExpectations?: readonly ProductProcessAnnualReviewExpectation[];
  riskClass?: ProductProcessTemplateRiskClass;
  caveats?: readonly string[];
}

function template(spec: TemplateSpec): ProductProcessTemplate {
  const documentRequirements = spec.documentRequirements ?? [];
  const covenantTemplates = spec.covenantTemplates ?? [];
  const evidenceRequirements = spec.evidenceRequirements ?? [];
  return {
    templateKey: spec.templateKey,
    displayName: spec.displayName,
    templateType: spec.templateType,
    productFamily: spec.productFamily,
    loanStructure: spec.loanStructure,
    collateralTypes: spec.collateralTypes ?? [],
    guarantorRequirements: spec.guarantorRequirements ?? [],
    documentRequirements,
    covenantTemplates,
    evidenceRequirements,
    workflowDefaults: spec.workflowDefault,
    approvalCheckpoints: spec.approvalCheckpoints ?? [cp('manager_review', 'Manager review', 'manager')],
    packageRequirements: spec.packageRequirements ?? [],
    servicingExpectations: spec.servicingExpectations ?? [],
    annualReviewExpectations: spec.annualReviewExpectations ?? [],
    riskClass: spec.riskClass ?? 'metadata_only',
    status: 'active_template',
    source: SRC,
    caveats: spec.caveats ?? ['Template guidance only — not a live product or policy override.'],
    auditSummary: {
      templateKey: spec.templateKey,
      documentRequirementCount: documentRequirements.length,
      covenantTemplateCount: covenantTemplates.length,
      evidenceRequirementCount: evidenceRequirements.length,
      containsLiveProductWrite: false,
      containsCreditDecision: false,
    },
  };
}

export const PRODUCT_PROCESS_TEMPLATE_REGISTRY: readonly ProductProcessTemplate[] = Object.freeze([
  template({
    templateKey: 'sba_7a_standard_template', displayName: 'SBA 7(a) Standard', templateType: 'loan_product', productFamily: 'SBA', loanStructure: 'term_loan',
    workflowDefault: { routeKey: 'sba_7a_standard', confidence: 'high' },
    guarantorRequirements: ['personal_guarantee'],
    documentRequirements: [doc('annual_financial_statements', 'Borrower financial statements'), doc('tax_returns', 'Tax returns'), doc('ownership_guarantor_docs', 'Ownership / guarantor documents'), doc('insurance_evidence', 'Insurance evidence'), doc('collateral_docs', 'Collateral documents', false), doc('sba_authorization', 'SBA-specific documents (label only)')],
    covenantTemplates: [cov('financial_statement_delivery_requirement', 'Financial statement delivery'), cov('insurance_requirement', 'Insurance'), cov('reporting_requirement', 'Reporting'), cov('dscr', 'DSCR (if defined)', false)],
    evidenceRequirements: [ev('financial_statement_support', 'Financial statement support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Credit memo')],
    riskClass: 'workflow_guidance',
    caveats: ['Template guidance only; not a final SBA eligibility engine.'],
  }),
  template({
    templateKey: 'commercial_term_loan_template', displayName: 'Commercial Term Loan', templateType: 'loan_product', productFamily: 'commercial', loanStructure: 'term_loan',
    workflowDefault: { routeKey: 'small_business_standard', confidence: 'high' },
    documentRequirements: [doc('annual_financial_statements', 'Financial statements'), doc('tax_returns', 'Tax returns'), doc('debt_schedule', 'Debt schedule'), doc('ownership_guarantor_docs', 'Ownership / guarantor documents'), doc('collateral_docs', 'Collateral / insurance documents', false)],
    covenantTemplates: [cov('dscr', 'DSCR'), cov('debt_to_tangible_net_worth', 'Debt / TNW'), cov('financial_statement_delivery_requirement', 'Financial statement delivery')],
    evidenceRequirements: [ev('financial_statement_support', 'Financial statement support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Credit memo')],
    riskClass: 'workflow_guidance',
  }),
  template({
    templateKey: 'commercial_real_estate_template', displayName: 'Commercial Real Estate', templateType: 'loan_product', productFamily: 'CRE', loanStructure: 'term_loan',
    workflowDefault: { routeKey: 'commercial_real_estate', confidence: 'high' },
    collateralTypes: ['real_estate'],
    documentRequirements: [doc('rent_roll', 'Rent roll'), doc('leases', 'Leases'), doc('appraisal', 'Appraisal'), doc('environmental', 'Environmental'), doc('insurance_evidence', 'Insurance'), doc('title', 'Title'), doc('annual_financial_statements', 'Financials / tax returns', false)],
    covenantTemplates: [cov('dscr', 'DSCR'), cov('current_ratio', 'LTV / current ratio', false), cov('reporting_requirement', 'Reporting'), cov('insurance_requirement', 'Insurance')],
    evidenceRequirements: [ev('collateral_support', 'Collateral support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Credit memo')],
    riskClass: 'workflow_guidance',
    caveats: ['No LTV calculation unless collateral facts exist.'],
  }),
  template({
    templateKey: 'working_capital_line_template', displayName: 'Working Capital Line', templateType: 'loan_product', productFamily: 'commercial', loanStructure: 'revolving_line',
    workflowDefault: { routeKey: 'working_capital_line', confidence: 'high' },
    documentRequirements: [doc('ar_aging', 'AR aging'), doc('ap_aging', 'AP aging'), doc('borrowing_base_certificate', 'Borrowing base certificate'), doc('inventory_report', 'Inventory report', false), doc('annual_financial_statements', 'Financials')],
    covenantTemplates: [cov('borrowing_base_required', 'Borrowing base'), cov('current_ratio', 'Current ratio'), cov('reporting_requirement', 'Reporting')],
    evidenceRequirements: [ev('borrowing_base_support', 'Borrowing base support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Credit memo')],
    riskClass: 'workflow_guidance',
  }),
  template({
    templateKey: 'construction_project_template', displayName: 'Construction / Project-Based', templateType: 'loan_structure', productFamily: 'construction', loanStructure: 'construction',
    workflowDefault: { routeKey: 'construction_or_project_based', confidence: 'high' },
    collateralTypes: ['real_estate', 'project'],
    documentRequirements: [doc('budget', 'Budget'), doc('draw_schedule', 'Draw schedule'), doc('inspection', 'Inspection'), doc('appraisal', 'Appraisal'), doc('environmental', 'Environmental'), doc('title', 'Title'), doc('insurance_evidence', 'Insurance')],
    covenantTemplates: [cov('reporting_requirement', 'Reporting'), cov('borrowing_base_required', 'Budget / draw controls', false)],
    evidenceRequirements: [ev('collateral_support', 'Collateral support')],
    approvalCheckpoints: [cp('manager_review', 'Manager review', 'manager'), cp('committee_review', 'Credit committee review', 'manager')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Credit memo')],
    riskClass: 'credit_decision_support',
    caveats: ['Completion milestones are metadata only.'],
  }),
  template({
    templateKey: 'annual_review_standard_template', displayName: 'Annual Review Standard', templateType: 'annual_review', productFamily: 'annual_review',
    workflowDefault: { routeKey: 'annual_review_standard', confidence: 'high' },
    documentRequirements: [doc('annual_financial_statements', 'Annual financial statements'), doc('tax_returns', 'Tax returns'), doc('insurance_evidence', 'Insurance evidence')],
    covenantTemplates: [cov('dscr', 'DSCR'), cov('current_ratio', 'Current ratio'), cov('insurance_requirement', 'Insurance')],
    evidenceRequirements: [ev('financial_statement_support', 'Financial statement support'), ev('covenant_testing_support', 'Covenant testing support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Memo package'), pkg('annual_review_board_package', 'Board package')],
    annualReviewExpectations: [arx('annual_financials', 'Annual borrower financials'), arx('covenant_testing', 'Covenant testing')],
    riskClass: 'workflow_guidance',
  }),
  template({
    templateKey: 'annual_review_covenant_exception_template', displayName: 'Annual Review with Covenant Exception', templateType: 'annual_review', productFamily: 'annual_review',
    workflowDefault: { routeKey: 'annual_review_with_covenant_exception', confidence: 'high' },
    documentRequirements: [doc('annual_financial_statements', 'Annual financial statements'), doc('covenant_compliance_certificate', 'Covenant compliance certificate')],
    covenantTemplates: [cov('dscr', 'DSCR'), cov('debt_to_tangible_net_worth', 'Debt / TNW')],
    evidenceRequirements: [ev('covenant_testing_support', 'Covenant testing support')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Memo with covenant exception summary'), pkg('annual_review_board_package', 'Management follow-up')],
    annualReviewExpectations: [arx('covenant_exception_finding', 'Covenant exception finding (no waiver automation)')],
    riskClass: 'credit_decision_support',
    caveats: ['No waiver automation — covenant exceptions are findings requiring review.'],
  }),
  template({
    templateKey: 'portfolio_boarded_loan_review_template', displayName: 'Portfolio Boarded Loan Review', templateType: 'portfolio_boarding', productFamily: 'portfolio_boarding',
    workflowDefault: { routeKey: 'portfolio_boarded_loan_review', confidence: 'high' },
    documentRequirements: [doc('annual_financial_statements', 'Boarded-loan financials'), doc('insurance_evidence', 'Insurance status', false)],
    evidenceRequirements: [ev('financial_statement_support', 'Boarded loan SOR evidence')],
    servicingExpectations: [srv('servicing_owner', 'Servicing owner assigned'), srv('ticklers', 'Ticklers tracked'), srv('insurance_collateral_status', 'Insurance / collateral status')],
    riskClass: 'workflow_guidance',
  }),
  template({
    templateKey: 'fdic_exam_prep_template', displayName: 'FDIC Exam Prep', templateType: 'fdic_exam_prep', productFamily: 'examiner',
    workflowDefault: { routeKey: 'fdic_examiner_package_required', confidence: 'high' },
    evidenceRequirements: [ev('evidence_inventory', 'Evidence index'), ev('audit_trail_summary', 'Audit trail summary')],
    packageRequirements: [pkg('annual_review_fdic_package', 'Examiner package')],
    riskClass: 'workflow_guidance',
    caveats: ['Examiner-prep guidance only — not filed or submitted.'],
  }),
  template({
    templateKey: 'credit_committee_package_template', displayName: 'Credit Committee Package', templateType: 'board_package', productFamily: 'committee',
    workflowDefault: { routeKey: 'credit_committee_required', confidence: 'high' },
    evidenceRequirements: [ev('financial_statement_support', 'Financial readiness'), ev('covenant_testing_support', 'Covenant status'), ev('evidence_inventory', 'Evidence index')],
    approvalCheckpoints: [cp('manager_review', 'Manager review', 'manager'), cp('committee_review', 'Credit committee review', 'manager')],
    packageRequirements: [pkg('annual_review_credit_memo', 'Memo package'), pkg('annual_review_board_package', 'Board package')],
    riskClass: 'credit_decision_support',
    caveats: ['No voting or approval in this phase — committee is a routing finding only.'],
  }),
]);

export const ALL_PRODUCT_PROCESS_TEMPLATE_KEYS: readonly string[] = Object.freeze(
  PRODUCT_PROCESS_TEMPLATE_REGISTRY.map((t) => t.templateKey),
);

export function getProductProcessTemplate(templateKey: string): ProductProcessTemplate | undefined {
  return PRODUCT_PROCESS_TEMPLATE_REGISTRY.find((t) => t.templateKey === templateKey);
}

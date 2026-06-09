/**
 * Phase 142A — Product / process metadata registry (constants only).
 *
 * Static, template-marked profiles for commercial loan workflows. No admin
 * mutation, no schema mutation, no fake products presented as live data, and all
 * delivery restrictions keep outbound channels disabled / approval-gated.
 */

import type { ProductProcessProfile } from './productProcessMetadataTypes';

const DELIVERY_DISABLED: readonly string[] = [
  'Borrower outreach is preview-only and approval-gated.',
  'Upload-link generation, email, and SMS remain disabled by default.',
];

function profile(p: ProductProcessProfile): ProductProcessProfile {
  return p;
}

export const PRODUCT_PROCESS_REGISTRY: readonly ProductProcessProfile[] = Object.freeze([
  profile({
    profileKey: 'sba_7a', displayName: 'SBA 7(a)', profileType: 'loan_product', isTemplate: true,
    documentRequirements: ['tax_returns', 'annual_financial_statements', 'personal_financial_statement', 'insurance_evidence'],
    covenantRequirementTemplates: ['financial_statement_delivery_requirement', 'insurance_requirement', 'tax_return_requirement'],
    workflowRouteKey: 'sba_7a_standard', approvalCheckpoints: ['manager_review', 'sba_eligibility'],
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support', 'insurance_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'term_loan', displayName: 'Term Loan', profileType: 'loan_product', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'tax_returns'],
    covenantRequirementTemplates: ['dscr', 'debt_to_tangible_net_worth', 'financial_statement_delivery_requirement'],
    workflowRouteKey: 'small_business_standard', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'cre', displayName: 'CRE', profileType: 'loan_product', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'rent_roll', 'insurance_evidence'],
    covenantRequirementTemplates: ['dscr', 'current_ratio', 'insurance_requirement'],
    workflowRouteKey: 'commercial_real_estate', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_credit_memo', 'annual_review_board_package'], evidenceRequirements: ['financial_statement_support', 'collateral_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'working_capital_line', displayName: 'Working Capital Line', profileType: 'loan_product', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'ar_aging', 'ap_aging', 'borrowing_base_certificate'],
    covenantRequirementTemplates: ['current_ratio', 'borrowing_base_required', 'financial_statement_delivery_requirement'],
    workflowRouteKey: 'small_business_standard', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support', 'borrowing_base_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'portfolio_boarded_loan', displayName: 'Portfolio Boarded Loan', profileType: 'loan_product', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'insurance_evidence'],
    covenantRequirementTemplates: ['financial_statement_delivery_requirement', 'insurance_requirement'],
    workflowRouteKey: 'portfolio_boarded_loan_review', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'annual_review_standard', displayName: 'Annual Review Standard', profileType: 'annual_review_type', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'tax_returns', 'insurance_evidence'],
    covenantRequirementTemplates: ['dscr', 'current_ratio', 'insurance_requirement'],
    workflowRouteKey: 'annual_review_standard', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_credit_memo', 'annual_review_board_package'], evidenceRequirements: ['financial_statement_support', 'covenant_testing_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'annual_review_covenant_exception', displayName: 'Annual Review Covenant Exception', profileType: 'annual_review_type', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'covenant_compliance_certificate'],
    covenantRequirementTemplates: ['dscr', 'debt_to_tangible_net_worth'],
    workflowRouteKey: 'annual_review_with_covenant_exception', approvalCheckpoints: ['manager_review', 'committee_review'],
    packageRequirements: ['annual_review_credit_memo', 'annual_review_board_package'], evidenceRequirements: ['covenant_testing_support'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
  profile({
    profileKey: 'fdic_exam_prep', displayName: 'FDIC Exam Prep', profileType: 'package_prep', isTemplate: true,
    documentRequirements: ['annual_financial_statements', 'insurance_evidence'],
    covenantRequirementTemplates: [],
    workflowRouteKey: 'annual_review_standard', approvalCheckpoints: ['manager_review'],
    packageRequirements: ['annual_review_fdic_package'], evidenceRequirements: ['evidence_inventory', 'audit_trail_summary'], deliveryRestrictions: DELIVERY_DISABLED,
  }),
]);

export function getProductProcessProfile(profileKey: string): ProductProcessProfile | undefined {
  return PRODUCT_PROCESS_REGISTRY.find((p) => p.profileKey === profileKey);
}

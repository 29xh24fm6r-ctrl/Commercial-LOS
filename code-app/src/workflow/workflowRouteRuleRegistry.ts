/**
 * Phase 142C — Workflow route rule registry (constants only).
 *
 * Static, governed route rules with declarative (non-executable) conditions. No
 * user-editable rules, no eval/function bodies, no SQL/OData, no route mutation,
 * and no credit approval. The credit-committee rule carries a committee policy
 * but never an approval action.
 */

import {
  DEFAULT_WORKFLOW_POLICY_THRESHOLDS,
  type WorkflowRouteRule,
  type WorkflowRouteRuleCondition,
} from './workflowRoutingConfigTypes';

function cond(
  field: WorkflowRouteRuleCondition['field'],
  operator: WorkflowRouteRuleCondition['operator'],
  value?: WorkflowRouteRuleCondition['value'],
): WorkflowRouteRuleCondition {
  return { field, operator, value };
}

const T = DEFAULT_WORKFLOW_POLICY_THRESHOLDS;

export const WORKFLOW_ROUTE_RULE_REGISTRY: readonly WorkflowRouteRule[] = Object.freeze([
  {
    ruleKey: 'rule_annual_review_covenant_exception', routeKey: 'annual_review_with_covenant_exception', priority: 95,
    description: 'Annual review with a covenant breach / review-required finding.',
    conditions: [cond('annualReviewDueStatus', 'in', ['due', 'past_due']), cond('covenantStatus', 'in', ['breach', 'review_required'])],
    requiredStages: ['borrower_documents', 'spreading', 'covenant_testing', 'package_preparation', 'manager_review', 'credit_committee_review'],
    approvalCheckpoints: ['manager_review', 'committee_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'credit_committee',
    packageRequirements: ['annual_review_credit_memo', 'annual_review_board_package'], evidenceRequirements: ['covenant_testing_support'], blockers: [], warnings: ['Covenant exception present; routed for review.'], riskClass: 'credit_decision_support',
  },
  {
    ruleKey: 'rule_annual_review_missing_financials', routeKey: 'annual_review_missing_financials', priority: 90,
    description: 'Annual review due but borrower financials are missing/partial.',
    conditions: [cond('annualReviewDueStatus', 'in', ['due', 'past_due']), cond('documentReadiness', 'in', ['missing', 'partial'])],
    requiredStages: ['borrower_documents', 'spreading'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker'], committeePolicy: 'none',
    packageRequirements: [], evidenceRequirements: ['financial_statement_support'], blockers: ['Borrower financials are missing or partial.'], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_fdic_examiner_package', routeKey: 'fdic_examiner_package_required', priority: 88,
    description: 'FDIC / examiner package preparation requested.',
    conditions: [cond('requestedAction', 'equals', 'fdic_package')],
    requiredStages: ['package_preparation', 'fdic_package_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['manager'], committeePolicy: 'board_visibility_only',
    packageRequirements: ['annual_review_fdic_package'], evidenceRequirements: ['evidence_inventory', 'audit_trail_summary'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_credit_committee_required', routeKey: 'credit_committee_required', priority: 85,
    description: 'Loan amount at or above the credit committee threshold.',
    conditions: [cond('amount', 'greater_than_or_equal', T.creditCommitteeAmount)],
    requiredStages: ['underwriting', 'package_preparation', 'manager_review', 'credit_committee_review'], approvalCheckpoints: ['manager_review', 'committee_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'credit_committee',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support'], blockers: [], warnings: ['Amount meets the credit committee threshold (finding, not an approval).'], riskClass: 'credit_decision_support',
  },
  {
    ruleKey: 'rule_annual_review_package_review', routeKey: 'annual_review_package_review', priority: 80,
    description: 'Annual review package is draft-ready with caveats.',
    conditions: [cond('packageReadiness', 'equals', 'draft_ready_with_caveats')],
    requiredStages: ['package_preparation', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: [], blockers: [], warnings: ['Package has caveats requiring review.'], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_annual_review_standard', routeKey: 'annual_review_standard', priority: 75,
    description: 'Standard annual review (no covenant exception).',
    conditions: [cond('annualReviewDueStatus', 'in', ['due', 'past_due'])],
    requiredStages: ['borrower_documents', 'spreading', 'covenant_testing', 'package_preparation', 'manager_review', 'annual_review_complete_candidate'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support', 'covenant_testing_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_portfolio_boarded_loan_review', routeKey: 'portfolio_boarded_loan_review', priority: 70,
    description: 'Portfolio boarded-loan review.',
    conditions: [cond('portfolioBoardingStatus', 'equals', 'boarded')],
    requiredStages: ['intake', 'underwriting', 'closing_or_monitoring'], approvalCheckpoints: ['manager_review'], requiredRoles: ['manager'], committeePolicy: 'none',
    packageRequirements: [], evidenceRequirements: ['financial_statement_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_exception_remediation', routeKey: 'exception_remediation', priority: 65,
    description: 'Open exception requiring remediation.',
    conditions: [cond('exceptionStatus', 'equals', 'open')],
    requiredStages: ['intake', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: [], evidenceRequirements: [], blockers: ['Open exception requires remediation.'], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_executive_visibility', routeKey: 'executive_visibility_required', priority: 60,
    description: 'Amount or relationship risk requires executive visibility.',
    conditions: [cond('amount', 'greater_than_or_equal', T.executiveReviewAmount)],
    requiredStages: ['underwriting', 'package_preparation', 'manager_review', 'credit_committee_review', 'board_package_review'], approvalCheckpoints: ['manager_review', 'committee_review'], requiredRoles: ['manager', 'executive'], committeePolicy: 'executive_credit_review',
    packageRequirements: ['annual_review_board_package'], evidenceRequirements: [], blockers: [], warnings: ['Executive visibility flagged (finding, not an approval).'], riskClass: 'credit_decision_support',
  },
  {
    ruleKey: 'rule_sba_7a_standard', routeKey: 'sba_7a_standard', priority: 50,
    description: 'SBA 7(a) origination.',
    conditions: [cond('productType', 'equals', 'sba_7a')],
    requiredStages: ['intake', 'borrower_documents', 'underwriting', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_commercial_real_estate', routeKey: 'commercial_real_estate', priority: 50,
    description: 'Commercial real estate origination.',
    conditions: [cond('productType', 'equals', 'cre')],
    requiredStages: ['intake', 'borrower_documents', 'underwriting', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['collateral_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_construction_or_project_based', routeKey: 'construction_or_project_based', priority: 50,
    description: 'Construction / project-based origination.',
    conditions: [cond('productType', 'equals', 'construction')],
    requiredStages: ['intake', 'underwriting', 'manager_review', 'credit_committee_review'], approvalCheckpoints: ['manager_review', 'committee_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'credit_committee',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['collateral_support'], blockers: [], warnings: [], riskClass: 'credit_decision_support',
  },
  {
    ruleKey: 'rule_working_capital_line', routeKey: 'working_capital_line', priority: 45,
    description: 'Working capital line origination.',
    conditions: [cond('productType', 'equals', 'working_capital')],
    requiredStages: ['intake', 'borrower_documents', 'underwriting', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['borrowing_base_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
  {
    ruleKey: 'rule_small_business_standard', routeKey: 'small_business_standard', priority: 40,
    description: 'Small business standard origination.',
    conditions: [cond('productType', 'equals', 'small_business')],
    requiredStages: ['intake', 'borrower_documents', 'underwriting', 'manager_review'], approvalCheckpoints: ['manager_review'], requiredRoles: ['banker', 'manager'], committeePolicy: 'none',
    packageRequirements: ['annual_review_credit_memo'], evidenceRequirements: ['financial_statement_support'], blockers: [], warnings: [], riskClass: 'runtime_read',
  },
]);

export function getWorkflowRouteRule(ruleKey: string): WorkflowRouteRule | undefined {
  return WORKFLOW_ROUTE_RULE_REGISTRY.find((r) => r.ruleKey === ruleKey);
}

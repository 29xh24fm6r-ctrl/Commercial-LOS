/**
 * Phase 142A — Workflow route deriver.
 *
 * PURE, READ-ONLY. Selects a workflow route from product/amount/client/channel
 * dimensions and overlays dimension-driven flags + blockers/warnings. It creates
 * no tasks, mutates no approvals, and NEVER approves credit. Missing product /
 * amount data routes to `review_required`; a covenant exception routes to the
 * covenant-exception annual-review route; credit-committee-required is a finding.
 */

import { getWorkflowRoute } from './workflowRouteRegistry';
import type { WorkflowRoutingInput, WorkflowRoute } from './workflowRoutingTypes';

function withOverlay(base: WorkflowRoute, input: WorkflowRoutingInput): WorkflowRoute {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Large/jumbo amounts or complex guarantor structures flag committee review.
  const committee =
    base.creditCommitteeRequired ||
    input.amountBand === 'large' ||
    input.amountBand === 'jumbo' ||
    (input.guarantorStructure !== undefined && /multiple|complex/i.test(input.guarantorStructure));
  if (committee && !base.creditCommitteeRequired) {
    warnings.push('Credit committee review flagged by amount / guarantor structure (finding, not an approval).');
  }

  if (input.documentReadiness === 'missing') warnings.push('Document readiness is missing; collection required.');
  if (input.relationshipRisk === 'high') warnings.push('Elevated relationship risk; manager review recommended.');
  if (input.covenantStatus === 'breach' || input.covenantStatus === 'review_required') {
    warnings.push('Covenant exception present; routed for review (no decision is made).');
  }

  return {
    ...base,
    creditCommitteeRequired: committee,
    managerReviewRequired: base.managerReviewRequired || input.relationshipRisk === 'high',
    blockers,
    warnings,
  };
}

function reviewRequired(reason: string): WorkflowRoute {
  const base = getWorkflowRoute('review_required')!;
  return { ...base, blockers: [reason], warnings: [] };
}

export function deriveWorkflowRoute(input: WorkflowRoutingInput): WorkflowRoute {
  // Missing core routing data → review_required.
  if (!input.productType || input.productType === 'unknown' || !input.amountBand || input.amountBand === 'unknown') {
    // Annual-review context can still route even without origination product data.
    if (!(input.annualReviewDueStatus === 'due' || input.annualReviewDueStatus === 'past_due')) {
      return reviewRequired('Insufficient product / amount data to route origination.');
    }
  }

  // Annual review context takes precedence when due.
  if (input.annualReviewDueStatus === 'due' || input.annualReviewDueStatus === 'past_due') {
    const key = input.covenantStatus === 'breach' || input.covenantStatus === 'review_required'
      ? 'annual_review_with_covenant_exception'
      : 'annual_review_standard';
    return withOverlay(getWorkflowRoute(key)!, input);
  }

  // Portfolio boarded loans route to portfolio review.
  if (input.portfolioBoardingStatus === 'boarded') {
    return withOverlay(getWorkflowRoute('portfolio_boarded_loan_review')!, input);
  }

  // Exception remediation when documents are missing and risk is elevated.
  if (input.documentReadiness === 'missing' && input.relationshipRisk === 'high') {
    return withOverlay(getWorkflowRoute('exception_remediation')!, input);
  }

  // Product-driven origination routes.
  const productRoute: Record<string, string> = {
    sba_7a: 'sba_7a_standard',
    cre: 'commercial_real_estate',
    construction: 'construction_or_project_based',
    small_business: 'small_business_standard',
    working_capital: 'small_business_standard',
  };
  const key = productRoute[input.productType ?? ''] ?? 'small_business_standard';
  const route = withOverlay(getWorkflowRoute(key)!, input);

  // A committee flag promotes the displayed route to the committee route's stages.
  if (route.creditCommitteeRequired && key !== 'construction_or_project_based') {
    return withOverlay({ ...getWorkflowRoute('credit_committee_required')!, annualReviewRequired: route.annualReviewRequired }, input);
  }
  return route;
}

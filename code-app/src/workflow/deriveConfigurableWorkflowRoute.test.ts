import { describe, it, expect } from 'vitest';
import { deriveConfigurableWorkflowRoute } from './deriveConfigurableWorkflowRoute';
import type { WorkflowRoutingInput } from './workflowRoutingConfigTypes';

/**
 * Phase 142C — configurable route derivation pins.
 */

function route(input: WorkflowRoutingInput) {
  return deriveConfigurableWorkflowRoute({ input });
}

describe('Phase 142C — route derivation', () => {
  it('product / amount / customer selects small_business_standard', () => {
    expect(route({ productType: 'small_business', amount: 100000, customerType: 'existing' }).routeKey).toBe('small_business_standard');
  });

  it('SBA 7(a) selects sba_7a_standard', () => {
    expect(route({ productType: 'sba_7a', amount: 200000 }).routeKey).toBe('sba_7a_standard');
  });

  it('CRE selects commercial_real_estate', () => {
    expect(route({ productType: 'cre', amount: 300000 }).routeKey).toBe('commercial_real_estate');
  });

  it('a covenant exception selects annual_review_with_covenant_exception', () => {
    expect(route({ annualReviewDueStatus: 'due', covenantStatus: 'breach', documentReadiness: 'complete' }).routeKey).toBe('annual_review_with_covenant_exception');
  });

  it('missing financials selects annual_review_missing_financials', () => {
    expect(route({ annualReviewDueStatus: 'due', documentReadiness: 'missing', covenantStatus: 'in_compliance' }).routeKey).toBe('annual_review_missing_financials');
  });

  it('a high amount selects credit_committee_required', () => {
    expect(route({ productType: 'small_business', amount: 9000000 }).routeKey).toBe('credit_committee_required');
  });

  it('package caveats select annual_review_package_review', () => {
    expect(route({ packageReadiness: 'draft_ready_with_caveats' }).routeKey).toBe('annual_review_package_review');
  });

  it('missing data returns route_review_required', () => {
    const r = route({});
    expect(r.routeStatus).toBe('route_review_required');
    expect(r.routeKey).toBe('review_required');
  });

  it('conflicting top-priority rules return route_review_required', () => {
    // Two same-priority product rules (cre + construction) can never both be set,
    // so we inject a synthetic conflict via custom rules.
    const r = deriveConfigurableWorkflowRoute({
      input: { productType: 'cre' },
      rules: [
        { ruleKey: 'a', routeKey: 'route_a', priority: 50, description: '', conditions: [{ field: 'productType', operator: 'equals', value: 'cre' }], requiredStages: ['intake'], approvalCheckpoints: [], requiredRoles: [], committeePolicy: 'none', packageRequirements: [], evidenceRequirements: [], blockers: [], warnings: [], riskClass: 'runtime_read' },
        { ruleKey: 'b', routeKey: 'route_b', priority: 50, description: '', conditions: [{ field: 'productType', operator: 'equals', value: 'cre' }], requiredStages: ['intake'], approvalCheckpoints: [], requiredRoles: [], committeePolicy: 'none', packageRequirements: [], evidenceRequirements: [], blockers: [], warnings: [], riskClass: 'runtime_read' },
      ],
    });
    expect(r.routeStatus).toBe('route_review_required');
  });

  it('always read-only, never mutating, never approving', () => {
    for (const input of [{ productType: 'small_business' as const, amount: 100 }, { annualReviewDueStatus: 'due' as const }, {}]) {
      const r = route(input);
      expect(r.readOnly).toBe(true);
      expect(r.canMutateWorkflow).toBe(false);
      expect(r.canApproveCredit).toBe(false);
      expect(r.auditSummary.containsCreditDecision).toBe(false);
    }
  });
});

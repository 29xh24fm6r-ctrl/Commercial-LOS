import { describe, it, expect } from 'vitest';
import { deriveWorkflowRoute } from './deriveWorkflowRoute';
import { WORKFLOW_ROUTE_REGISTRY } from './workflowRouteRegistry';

/**
 * Phase 142A — workflow routing pins.
 */

describe('Phase 142A — workflow routing', () => {
  it('routes based on product / amount', () => {
    expect(deriveWorkflowRoute({ productType: 'sba_7a', amountBand: 'small' }).routeKey).toBe('sba_7a_standard');
    expect(deriveWorkflowRoute({ productType: 'cre', amountBand: 'medium' }).routeKey).toBe('commercial_real_estate');
    expect(deriveWorkflowRoute({ productType: 'small_business', amountBand: 'small' }).routeKey).toBe('small_business_standard');
  });

  it('missing product / amount data produces review_required', () => {
    expect(deriveWorkflowRoute({}).routeKey).toBe('review_required');
    expect(deriveWorkflowRoute({ productType: 'unknown', amountBand: 'unknown' }).blockers.length).toBeGreaterThan(0);
  });

  it('a covenant exception routes to annual_review_with_covenant_exception', () => {
    expect(deriveWorkflowRoute({ annualReviewDueStatus: 'due', covenantStatus: 'breach' }).routeKey).toBe('annual_review_with_covenant_exception');
  });

  it('large amount or complex guarantor flags credit committee (a finding, not an approval)', () => {
    const r = deriveWorkflowRoute({ productType: 'small_business', amountBand: 'jumbo' });
    expect(r.creditCommitteeRequired).toBe(true);
    // No checkpoint is ever a final approval.
    for (const route of WORKFLOW_ROUTE_REGISTRY) {
      for (const c of route.approvalCheckpoints) expect(c.finalApproval).toBe(false);
    }
  });

  it('credit committee route does not approve credit', () => {
    const r = deriveWorkflowRoute({ productType: 'construction', amountBand: 'large' });
    expect(r.approvalCheckpoints.every((c) => c.finalApproval === false)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/\b(approved|credit_approved|final_approval)\b/);
  });

  it('the deriver creates no tasks and performs no writes', () => {
    const r = deriveWorkflowRoute({ productType: 'sba_7a', amountBand: 'small' });
    expect(JSON.stringify(r)).not.toMatch(/createRecord|createTask|method:\s*'(POST|PATCH|DELETE)'/);
  });
});

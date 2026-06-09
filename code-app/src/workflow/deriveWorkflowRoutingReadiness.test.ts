import { describe, it, expect } from 'vitest';
import { deriveWorkflowRoutingReadiness } from './deriveWorkflowRoutingReadiness';
import { deriveConfigurableWorkflowRoute } from './deriveConfigurableWorkflowRoute';
import type { WorkflowRoutingInput } from './workflowRoutingConfigTypes';

/**
 * Phase 142C — routing readiness pins.
 */

function readiness(input: WorkflowRoutingInput) {
  const route = deriveConfigurableWorkflowRoute({ input });
  return deriveWorkflowRoutingReadiness({ route, input });
}

describe('Phase 142C — routing readiness', () => {
  it('a complete annual-review route is ready for review', () => {
    const r = readiness({ annualReviewDueStatus: 'due', documentReadiness: 'complete', covenantStatus: 'in_compliance', packageReadiness: 'review_ready' });
    expect(r.readinessStatus).toBe('ready_for_review');
  });

  it('is blocked by missing financials', () => {
    const r = readiness({ annualReviewDueStatus: 'due', documentReadiness: 'missing', covenantStatus: 'in_compliance' });
    expect(r.readinessStatus).toBe('blocked_missing_data');
    expect(r.missingMaterials).toContain('borrower_financials');
  });

  it('is blocked by missing committee evidence', () => {
    const r = readiness({ amount: 9000000, productType: 'small_business', documentReadiness: 'complete', covenantStatus: 'in_compliance', packageReadiness: 'blocked' });
    expect(r.readinessStatus).toBe('blocked_missing_evidence');
  });

  it('is blocked when covenants are unknown on an annual-review route', () => {
    const r = readiness({ annualReviewDueStatus: 'due', documentReadiness: 'complete', covenantStatus: 'unknown' });
    expect(r.readinessStatus).toBe('blocked_missing_data');
  });

  it('a caveated package produces ready_with_caveats', () => {
    const r = readiness({ packageReadiness: 'draft_ready_with_caveats', documentReadiness: 'complete', covenantStatus: 'in_compliance' });
    expect(r.readinessStatus).toBe('ready_with_caveats');
  });

  it('uses no approval language in next best actions', () => {
    const r = readiness({ amount: 9000000, productType: 'small_business', documentReadiness: 'complete', covenantStatus: 'in_compliance', packageReadiness: 'review_ready' });
    expect(JSON.stringify(r.nextBestActions)).not.toMatch(/\bapprove\b|\bdecline\b|recommend approval/i);
  });
});

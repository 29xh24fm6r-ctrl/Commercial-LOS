import { describe, it, expect } from 'vitest';
import { deriveServicingLifecycleStage } from './deriveServicingLifecycleStage';
import type { ServicingLifecycleInput } from './servicingLifecycleTypes';

/**
 * Phase 142E — lifecycle stage pins.
 */

function stage(over: Partial<ServicingLifecycleInput>) {
  return deriveServicingLifecycleStage({ lifecycleId: 'L1', asOfDate: '2026-06-09', ...over });
}

describe('Phase 142E — lifecycle stage', () => {
  it('derives boarding_in_progress from incomplete boarding readiness', () => {
    expect(stage({ boardingReadiness: 'incomplete' }).lifecycleStage).toBe('boarding_in_progress');
  });

  it('derives booked_active from a verified boarded loan', () => {
    expect(stage({ boardedLoan: { verified: true } }).lifecycleStage).toBe('booked_active');
  });

  it('derives annual_review_due from a due annual review', () => {
    expect(stage({ annualReviewDueStatus: 'due' }).lifecycleStage).toBe('annual_review_due');
  });

  it('a covenant exception overrides routine active monitoring', () => {
    expect(stage({ boardedLoan: { verified: true }, covenantExceptionActive: true }).lifecycleStage).toBe('covenant_exception_monitoring');
  });

  it('a maturity window routes to renewal_or_maturity_review', () => {
    expect(stage({ maturityDate: '2026-07-01' }).lifecycleStage).toBe('renewal_or_maturity_review');
  });

  it('insufficient data produces unknown_review_required', () => {
    expect(stage({}).lifecycleStage).toBe('unknown_review_required');
  });

  it('mutates nothing', () => {
    expect(JSON.stringify(stage({ boardedLoan: { verified: true } }))).not.toMatch(/updateStage|mutate|setStage|createRecord/);
  });
});

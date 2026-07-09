import { describe, it, expect } from 'vitest';
import {
  evaluateRiskRatingReadiness,
  evaluateUnderwritingRecommendationReadiness,
  type RiskRatingRecord,
  type UnderwritingRecommendationRecord,
} from './underwritingDeepFacts';

/** ARC Phase 3 — risk-rating and underwriting-recommendation decision policies. */

function rating(over: Partial<RiskRatingRecord> = {}): RiskRatingRecord {
  return { dealId: 'd1', ratingValue: '4', ratingScale: 'OGB-1-8', status: 'assigned', ...over };
}
function rec(over: Partial<UnderwritingRecommendationRecord> = {}): UnderwritingRecommendationRecord {
  return { dealId: 'd1', decision: 'approve', status: 'recorded', ...over };
}

describe('ARC Phase 3 — risk-rating readiness policy', () => {
  it('missing rating is not met', () => {
    expect(evaluateRiskRatingReadiness(undefined).met).toBe(false);
    expect(evaluateRiskRatingReadiness(undefined).reason).toMatch(/no risk rating/i);
  });
  it('a draft rating never satisfies', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'draft' })).met).toBe(false);
  });
  it('an empty value never satisfies', () => {
    expect(evaluateRiskRatingReadiness(rating({ ratingValue: '  ' })).met).toBe(false);
  });
  it('an assigned rating satisfies the default policy (minStatus assigned)', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'assigned' })).met).toBe(true);
    expect(evaluateRiskRatingReadiness(rating({ status: 'reviewed' })).met).toBe(true);
  });
  it('a stricter policy (minStatus reviewed) requires review', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'assigned' }), { minStatus: 'reviewed' }).met).toBe(false);
    expect(evaluateRiskRatingReadiness(rating({ status: 'reviewed' }), { minStatus: 'reviewed' }).met).toBe(true);
  });
});

describe('ARC Phase 3 — underwriting-recommendation readiness policy', () => {
  it('missing recommendation is not met', () => {
    expect(evaluateUnderwritingRecommendationReadiness(undefined).met).toBe(false);
  });
  it('a draft recommendation never satisfies', () => {
    expect(evaluateUnderwritingRecommendationReadiness(rec({ status: 'draft' })).met).toBe(false);
  });
  it('a recorded APPROVE / APPROVE_WITH_CONDITIONS satisfies the forward gate', () => {
    expect(evaluateUnderwritingRecommendationReadiness(rec({ decision: 'approve' })).met).toBe(true);
    expect(evaluateUnderwritingRecommendationReadiness(rec({ decision: 'approve_with_conditions' })).met).toBe(true);
  });
  it('DECLINE does not allow a normal advance and requires the non-forward path', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ decision: 'decline' }));
    expect(r.met).toBe(false);
    expect(r.requiresNonForwardPath).toBe(true);
    expect(r.reason).toMatch(/decline path/i);
  });
  it('RETURN does not allow a normal advance and requires the non-forward path', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ decision: 'return_for_more_information' }));
    expect(r.met).toBe(false);
    expect(r.requiresNonForwardPath).toBe(true);
    expect(r.reason).toMatch(/return path/i);
  });
});

import { describe, it, expect } from 'vitest';
import {
  evaluateRiskRatingReadiness,
  evaluateUnderwritingRecommendationReadiness,
  serializeRiskRatingFormState,
  parseRiskRatingFormState,
  EMPTY_RISK_RATING_FORM_STATE,
  serializeUnderwritingRecommendationFormState,
  parseUnderwritingRecommendationFormState,
  EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE,
  type RiskRatingRecord,
  type UnderwritingRecommendationRecord,
  type RiskRatingFormState,
  type UnderwritingRecommendationFormState,
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

describe('RiskRatingFormState serialize / parse (Factory Arc Phase 5)', () => {
  const filled: RiskRatingFormState = {
    ratingValue: 'BB',
    ratingScale: 'Internal 1-10',
    rationale: 'Stable, seasonal cash flow',
    status: 'reviewed',
  };

  it('round-trips a fully populated form state exactly', () => {
    expect(parseRiskRatingFormState(serializeRiskRatingFormState(filled))).toEqual(filled);
  });

  it('round-trips the empty (draft) state', () => {
    expect(parseRiskRatingFormState(serializeRiskRatingFormState(EMPTY_RISK_RATING_FORM_STATE))).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('parses undefined / empty-string input as the empty state', () => {
    expect(parseRiskRatingFormState(undefined)).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('fails closed on corrupt or wrong-shaped JSON — never throws', () => {
    expect(() => parseRiskRatingFormState('{not valid json')).not.toThrow();
    expect(parseRiskRatingFormState('{not valid json')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('[1,2,3]')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('null')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('rejects an unrecognized status value rather than fabricating one — falls back to draft', () => {
    const json = JSON.stringify({ ratingValue: 'BB', ratingScale: '', rationale: '', status: 'not-a-real-status' });
    expect(parseRiskRatingFormState(json).status).toBe('draft');
  });
});

describe('UnderwritingRecommendationFormState serialize / parse (Factory Arc Phase 5)', () => {
  const filled: UnderwritingRecommendationFormState = {
    decision: 'approve_with_conditions',
    rationale: 'Subject to covenant compliance',
    status: 'recorded',
  };

  it('round-trips a fully populated form state exactly', () => {
    expect(parseUnderwritingRecommendationFormState(serializeUnderwritingRecommendationFormState(filled))).toEqual(filled);
  });

  it('round-trips the empty (draft/approve) state', () => {
    expect(parseUnderwritingRecommendationFormState(serializeUnderwritingRecommendationFormState(EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE))).toEqual(
      EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE,
    );
  });

  it('fails closed on corrupt or wrong-shaped JSON — never throws', () => {
    expect(() => parseUnderwritingRecommendationFormState('{not valid json')).not.toThrow();
    expect(parseUnderwritingRecommendationFormState('{not valid json')).toEqual(EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE);
    expect(parseUnderwritingRecommendationFormState('"just a string"')).toEqual(EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE);
  });

  it('rejects an unrecognized decision value rather than fabricating one — falls back to approve', () => {
    const json = JSON.stringify({ decision: 'not-a-real-decision', rationale: '', status: 'draft' });
    expect(parseUnderwritingRecommendationFormState(json).decision).toBe('approve');
  });
});

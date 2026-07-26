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
  deriveRiskRatingRecordFromDeal,
  deriveUnderwritingRecommendationRecordFromDeal,
  type RiskRatingRecord,
  type UnderwritingRecommendationRecord,
  type RiskRatingFormState,
  type UnderwritingRecommendationFormState,
} from './underwritingDeepFacts';

/**
 * ARC Phase 3 — risk-rating and underwriting-recommendation decision policies.
 * Production Remediation Factory Arc Phase 6 (N-14/N-15) extended these with durable
 * rationale/actor/timestamp/deal-linkage checks — a final/assigned rating or recommendation is no
 * longer "met" on a value + a status alone.
 */

const DEAL_ID = 'd1';

function rating(over: Partial<RiskRatingRecord> = {}): RiskRatingRecord {
  return {
    dealId: DEAL_ID,
    ratingValue: '4',
    ratingScale: 'OGB-1-8',
    rationale: 'Stable, seasonal cash flow supports the assigned rating.',
    assignedBy: 'M. Paller',
    assignedAtIso: '2026-07-20T00:00:00Z',
    status: 'assigned',
    ...over,
  };
}
function rec(over: Partial<UnderwritingRecommendationRecord> = {}): UnderwritingRecommendationRecord {
  return {
    dealId: DEAL_ID,
    decision: 'approve',
    rationale: 'Repayment capacity and collateral support the recommendation.',
    underwriterActor: 'M. Paller',
    recordedAtIso: '2026-07-20T00:00:00Z',
    status: 'recorded',
    ...over,
  };
}

describe('ARC Phase 3 / N-14 remediation — risk-rating readiness policy', () => {
  it('missing rating is not met', () => {
    expect(evaluateRiskRatingReadiness(undefined, DEAL_ID).met).toBe(false);
    expect(evaluateRiskRatingReadiness(undefined, DEAL_ID).reason).toMatch(/no risk rating/i);
  });
  it('a draft rating never satisfies, even with a complete rationale/actor/timestamp', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'draft' }), DEAL_ID).met).toBe(false);
  });
  it('an empty value never satisfies', () => {
    expect(evaluateRiskRatingReadiness(rating({ ratingValue: '  ' }), DEAL_ID).met).toBe(false);
  });
  it('a fully-populated assigned/reviewed rating satisfies the default policy (minStatus assigned)', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'assigned' }), DEAL_ID).met).toBe(true);
    expect(evaluateRiskRatingReadiness(rating({ status: 'reviewed' }), DEAL_ID).met).toBe(true);
  });
  it('a stricter policy (minStatus reviewed) requires review', () => {
    expect(evaluateRiskRatingReadiness(rating({ status: 'assigned' }), DEAL_ID, { minStatus: 'reviewed' }).met).toBe(false);
    expect(evaluateRiskRatingReadiness(rating({ status: 'reviewed' }), DEAL_ID, { minStatus: 'reviewed' }).met).toBe(true);
  });

  // N-14: "Final risk rating can save with blank rationale" — the literal defect. A rating=5,
  // status=assigned record with blank rationale must NOT satisfy the gate.
  it('N-14: blank rationale on an assigned/final rating does not satisfy the gate', () => {
    const r = evaluateRiskRatingReadiness(rating({ rationale: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/rationale/i);
  });
  it('N-14: whitespace-only rationale does not satisfy the gate', () => {
    expect(evaluateRiskRatingReadiness(rating({ rationale: '   ' }), DEAL_ID).met).toBe(false);
  });
  it('N-14: no rating scale does not satisfy the gate', () => {
    const r = evaluateRiskRatingReadiness(rating({ ratingScale: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/scale/i);
  });
  it('N-15: no recorded assigning actor does not satisfy the gate', () => {
    const r = evaluateRiskRatingReadiness(rating({ assignedBy: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/actor/i);
  });
  it('N-15: no recorded assignment timestamp does not satisfy the gate', () => {
    const r = evaluateRiskRatingReadiness(rating({ assignedAtIso: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/timestamp/i);
  });
  it('N-15: a record for a different deal does not satisfy this deal\'s gate', () => {
    const r = evaluateRiskRatingReadiness(rating({ dealId: 'some-other-deal' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/does not match this deal/i);
  });
});

describe('ARC Phase 3 / N-14 remediation — underwriting-recommendation readiness policy', () => {
  it('missing recommendation is not met', () => {
    expect(evaluateUnderwritingRecommendationReadiness(undefined, DEAL_ID).met).toBe(false);
  });
  it('a draft recommendation never satisfies, even with a complete rationale/actor/timestamp', () => {
    expect(evaluateUnderwritingRecommendationReadiness(rec({ status: 'draft' }), DEAL_ID).met).toBe(false);
  });
  it('a recorded APPROVE / APPROVE_WITH_CONDITIONS satisfies the forward gate when durable', () => {
    expect(evaluateUnderwritingRecommendationReadiness(rec({ decision: 'approve' }), DEAL_ID).met).toBe(true);
    expect(evaluateUnderwritingRecommendationReadiness(rec({ decision: 'approve_with_conditions' }), DEAL_ID).met).toBe(true);
  });
  it('DECLINE does not allow a normal advance and requires the non-forward path', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ decision: 'decline' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.requiresNonForwardPath).toBe(true);
    expect(r.reason).toMatch(/decline path/i);
  });
  it('RETURN does not allow a normal advance and requires the non-forward path', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ decision: 'return_for_more_information' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.requiresNonForwardPath).toBe(true);
    expect(r.reason).toMatch(/return path/i);
  });

  it('N-14: blank rationale on a recorded recommendation does not satisfy the gate', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ rationale: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/rationale/i);
  });
  it('N-15: no recorded underwriter does not satisfy the gate', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ underwriterActor: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/underwriter/i);
  });
  it('N-15: no recorded timestamp does not satisfy the gate', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ recordedAtIso: '' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/timestamp/i);
  });
  it('N-15: a record for a different deal does not satisfy this deal\'s gate', () => {
    const r = evaluateUnderwritingRecommendationReadiness(rec({ dealId: 'some-other-deal' }), DEAL_ID);
    expect(r.met).toBe(false);
    expect(r.reason).toMatch(/does not match this deal/i);
  });
});

describe('RiskRatingFormState serialize / parse (Factory Arc Phase 5 + N-14/N-15 durable fields)', () => {
  const filled: RiskRatingFormState = {
    ratingValue: 'BB',
    ratingScale: 'Internal 1-10',
    rationale: 'Stable, seasonal cash flow',
    status: 'reviewed',
    dealId: DEAL_ID,
    assignedBy: 'M. Paller',
    assignedAtIso: '2026-07-20T00:00:00Z',
  };

  it('round-trips a fully populated form state exactly, including dealId/actor/timestamp', () => {
    expect(parseRiskRatingFormState(serializeRiskRatingFormState(filled))).toEqual(filled);
  });

  it('round-trips the empty (draft) state', () => {
    expect(parseRiskRatingFormState(serializeRiskRatingFormState(EMPTY_RISK_RATING_FORM_STATE))).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('parses undefined / empty-string input as the empty state', () => {
    expect(parseRiskRatingFormState(undefined)).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('fails closed on corrupt or wrong-shaped JSON — never throws, never fabricates dealId/actor/timestamp', () => {
    expect(() => parseRiskRatingFormState('{not valid json')).not.toThrow();
    expect(parseRiskRatingFormState('{not valid json')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('[1,2,3]')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
    expect(parseRiskRatingFormState('null')).toEqual(EMPTY_RISK_RATING_FORM_STATE);
  });

  it('rejects an unrecognized status value rather than fabricating one — falls back to draft', () => {
    const json = JSON.stringify({ ratingValue: 'BB', ratingScale: '', rationale: '', status: 'not-a-real-status' });
    expect(parseRiskRatingFormState(json).status).toBe('draft');
  });

  it('a legacy record persisted before Phase 6 (no dealId/actor/timestamp) parses those fields as blank, not fabricated', () => {
    const legacyJson = JSON.stringify({ ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: 'Solid', status: 'assigned' });
    const parsed = parseRiskRatingFormState(legacyJson);
    expect(parsed.dealId).toBe('');
    expect(parsed.assignedBy).toBe('');
    expect(parsed.assignedAtIso).toBe('');
    // And that legacy record correctly fails the new gate (N-15's "durable" requirement), even
    // though it has a value, a rationale, and an assigned status.
    expect(evaluateRiskRatingReadiness(parsed as unknown as RiskRatingRecord, DEAL_ID).met).toBe(false);
  });
});

describe('UnderwritingRecommendationFormState serialize / parse (Factory Arc Phase 5 + N-14/N-15 durable fields)', () => {
  const filled: UnderwritingRecommendationFormState = {
    decision: 'approve_with_conditions',
    rationale: 'Subject to covenant compliance',
    status: 'recorded',
    dealId: DEAL_ID,
    underwriterActor: 'M. Paller',
    recordedAtIso: '2026-07-20T00:00:00Z',
  };

  it('round-trips a fully populated form state exactly, including dealId/actor/timestamp', () => {
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

describe('N-15 remediation — deriveRiskRatingRecordFromDeal / deriveUnderwritingRecommendationRecordFromDeal (WorkflowRequirementFacts loaders)', () => {
  it('returns undefined when the deal has no risk-rating JSON at all (never fabricated as an empty record)', () => {
    expect(deriveRiskRatingRecordFromDeal({ riskRatingInputsJson: undefined })).toBeUndefined();
  });
  it('returns undefined when no rating value has ever been entered', () => {
    expect(deriveRiskRatingRecordFromDeal({ riskRatingInputsJson: serializeRiskRatingFormState(EMPTY_RISK_RATING_FORM_STATE) })).toBeUndefined();
  });
  it('returns a real record, including the persisted dealId, once a rating has been saved', () => {
    const json = serializeRiskRatingFormState({
      ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: 'Stable', status: 'assigned',
      dealId: DEAL_ID, assignedBy: 'M. Paller', assignedAtIso: '2026-07-20T00:00:00Z',
    });
    const record = deriveRiskRatingRecordFromDeal({ riskRatingInputsJson: json });
    expect(record?.dealId).toBe(DEAL_ID);
    expect(record?.ratingValue).toBe('BB');
    expect(evaluateRiskRatingReadiness(record, DEAL_ID).met).toBe(true);
  });
  it('persisted value survives a save/reload round-trip and satisfies the gate', () => {
    const json = serializeRiskRatingFormState({
      ratingValue: '5', ratingScale: 'Internal 1-10', rationale: 'Strong sponsor support', status: 'reviewed',
      dealId: DEAL_ID, assignedBy: 'Underwriter A', assignedAtIso: '2026-07-24T12:00:00Z',
    });
    // Simulate a reload: re-derive the record from the persisted JSON exactly as the loader would.
    const reloaded = deriveRiskRatingRecordFromDeal({ riskRatingInputsJson: json });
    expect(evaluateRiskRatingReadiness(reloaded, DEAL_ID).met).toBe(true);
  });

  it('returns undefined when the deal has no underwriting-recommendation JSON at all', () => {
    expect(deriveUnderwritingRecommendationRecordFromDeal({ underwritingRecommendationInputsJson: undefined })).toBeUndefined();
  });
  it('returns undefined when nothing has ever been saved (the untouched draft default)', () => {
    expect(
      deriveUnderwritingRecommendationRecordFromDeal({
        underwritingRecommendationInputsJson: serializeUnderwritingRecommendationFormState(EMPTY_UNDERWRITING_RECOMMENDATION_FORM_STATE),
      }),
    ).toBeUndefined();
  });
  it('returns a real record, including the persisted dealId, once a recommendation has been saved', () => {
    const json = serializeUnderwritingRecommendationFormState({
      decision: 'approve', rationale: 'Supports repayment capacity', status: 'recorded',
      dealId: DEAL_ID, underwriterActor: 'M. Paller', recordedAtIso: '2026-07-20T00:00:00Z',
    });
    const record = deriveUnderwritingRecommendationRecordFromDeal({ underwritingRecommendationInputsJson: json });
    expect(record?.dealId).toBe(DEAL_ID);
    expect(evaluateUnderwritingRecommendationReadiness(record, DEAL_ID).met).toBe(true);
  });
  it('persisted value survives a save/reload round-trip and satisfies the gate', () => {
    const json = serializeUnderwritingRecommendationFormState({
      decision: 'approve_with_conditions', rationale: 'Subject to covenant compliance', status: 'recorded',
      dealId: DEAL_ID, underwriterActor: 'Underwriter A', recordedAtIso: '2026-07-24T12:00:00Z',
    });
    const reloaded = deriveUnderwritingRecommendationRecordFromDeal({ underwritingRecommendationInputsJson: json });
    expect(evaluateUnderwritingRecommendationReadiness(reloaded, DEAL_ID).met).toBe(true);
  });
});

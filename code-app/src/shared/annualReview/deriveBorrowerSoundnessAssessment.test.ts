import { describe, it, expect } from 'vitest';
import { deriveBorrowerSoundnessAssessment } from './deriveBorrowerSoundnessAssessment';
import type { AnnualReviewLoanSnapshot, AnnualReviewFinancialInputs } from './annualReviewTypes';

function loan(over: Partial<AnnualReviewLoanSnapshot> = {}): AnnualReviewLoanSnapshot {
  return { loanStatus: 'active', loanNumber: 'LN1', borrowerName: 'Synthetic Obligor', riskRating: '4', ...over };
}

const SOUND: AnnualReviewFinancialInputs = {
  revenueTrend: 'stable',
  profitabilityTrend: 'improving',
  liquidityTrend: 'stable',
  leverageTrend: 'stable',
  debtServiceCoverageTrend: 'improving',
  collateralCoverageTrend: 'stable',
  guarantorSupportTrend: 'stable',
};

describe('Phase 141A — soundness is evidence-backed', () => {
  it('no financial inputs → insufficient_information (never inferred sound)', () => {
    const a = deriveBorrowerSoundnessAssessment({ loan: loan() });
    expect(a.status).toBe('insufficient_information');
    expect(a.missingInputs.length).toBeGreaterThan(0);
  });

  it('all-not-available trends also → insufficient_information', () => {
    const a = deriveBorrowerSoundnessAssessment({
      loan: loan({ financialInputs: { revenueTrend: 'not_available', profitabilityTrend: 'not_available' } }),
    });
    expect(a.status).toBe('insufficient_information');
  });

  it('improving/stable financials → sound', () => {
    const a = deriveBorrowerSoundnessAssessment({ loan: loan({ financialInputs: SOUND }) });
    expect(a.status).toBe('sound');
    expect(a.escalationRequired).toBe(false);
  });

  it('several declining trends → deteriorating with escalation', () => {
    const a = deriveBorrowerSoundnessAssessment({
      loan: loan({
        financialInputs: {
          revenueTrend: 'declining',
          profitabilityTrend: 'declining',
          liquidityTrend: 'declining',
          leverageTrend: 'stable',
        },
      }),
    });
    expect(a.status).toBe('deteriorating');
    expect(a.escalationRequired).toBe(true);
  });

  it('covenant breach forces escalation even with otherwise sound financials', () => {
    const a = deriveBorrowerSoundnessAssessment({ loan: loan({ financialInputs: SOUND, covenantStatus: 'breach' }) });
    expect(a.status).toBe('deteriorating');
    expect(a.riskDrivers.some((d) => /Covenant breach/i.test(d))).toBe(true);
    expect(a.escalationRequired).toBe(true);
  });

  it('risk rating deterioration drives a watch status + escalation', () => {
    const a = deriveBorrowerSoundnessAssessment({ loan: loan({ financialInputs: SOUND, riskRating: '6', priorRiskRating: '4' }) });
    expect(a.status).toBe('watch');
    expect(a.escalationRequired).toBe(true);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  evaluateExitGate,
  outstandingRequirements,
  untrackedRequirementIds,
  type StageGateFacts,
} from './stageGateContract';
import { CANONICAL_STAGE_CODES, type CanonicalStageCode } from './stageOrderingContract';

const INTAKE_PACKAGE_MET: StageGateFacts = {
  borrowerPresent: true,
  loanAmountPresent: true,
  productTypePresent: true,
  assignedBankerPresent: true,
  intakeChecklistGenerated: true,
  completeCreditMemoPresent: true,
  loanApplicationReceived: true,
  businessFinancialStatementsReceived: true,
  taxReturnsReceived: true,
  ownershipInformationReceived: true,
  collateralSupportReceived: true,
};

/** All currently satisfiable facts true. Underwriting risk rating is intentionally pending. */
const ALL_MET_EXCEPT_PENDING_RISK_RATING: StageGateFacts = {
  ...INTAKE_PACKAGE_MET,
  underwritingReviewCompleted: true,
  riskRatingAssigned: true,
  underwritingRecommendationRecorded: true,
  creditMemoFinalized: true,
  approvalDecisionRecorded: true,
  approvalAuthoritySufficient: true,
  approvalConditionsDocumented: true,
  commitmentIssued: true,
  borrowerAcceptanceRecorded: true,
  approvalConditionsCleared: true,
  closingDocumentsPrepared: true,
  collateralVerified: true,
  insuranceVerified: true,
  loanDocumentsExecuted: true,
  fundsDisbursed: true,
  boardingCompleted: true,
};

describe('evaluateExitGate - satisfied path', () => {
  it.each(CANONICAL_STAGE_CODES.filter((stage) => stage !== 'UNDERWRITING'))(
    '%s gate is satisfied when all tracked facts are met',
    (stage) => {
      const result = evaluateExitGate(stage as CanonicalStageCode, ALL_MET_EXCEPT_PENDING_RISK_RATING);
      expect(result.satisfied).toBe(true);
      expect(result.requirements.every((r) => r.met)).toBe(true);
      expect(outstandingRequirements(result)).toEqual([]);
    },
  );

  it('UNDERWRITING remains unsatisfied while the risk-rating system is pending', () => {
    const result = evaluateExitGate('UNDERWRITING', ALL_MET_EXCEPT_PENDING_RISK_RATING);
    expect(result.satisfied).toBe(false);
    expect(result.requirements.find((r) => r.id === 'uw.review-complete')?.met).toBe(true);
    expect(result.requirements.find((r) => r.id === 'uw.recommendation')?.met).toBe(true);
    expect(result.requirements.find((r) => r.id === 'uw.risk-rating')).toMatchObject({
      met: false,
      detail: 'risk rating system not yet implemented',
    });
  });
});

describe('evaluateExitGate - OGB Intake package gate', () => {
  it('INTAKE cannot advance to UNDERWRITING without a complete credit memo', () => {
    const r = evaluateExitGate('INTAKE', { ...INTAKE_PACKAGE_MET, completeCreditMemoPresent: false });
    expect(r.satisfied).toBe(false);
    const outstanding = outstandingRequirements(r);
    expect(outstanding.map((o) => o.id)).toEqual(['intake.memo-complete']);
    expect(outstanding[0]!.detail).toMatch(/outstanding/i);
  });

  it('INTAKE component-checks the loan package documents instead of trusting a package-complete flag', () => {
    const r = evaluateExitGate('INTAKE', {
      ...INTAKE_PACKAGE_MET,
      taxReturnsReceived: false,
      collateralSupportReceived: undefined,
    });
    expect(r.satisfied).toBe(false);
    expect(outstandingRequirements(r).map((o) => o.id)).toEqual([
      'intake.tax-returns',
      'intake.collateral-support',
    ]);
    expect(r.requirements.find((req) => req.id === 'intake.tax-returns')!.detail).toMatch(/outstanding/i);
    expect(r.requirements.find((req) => req.id === 'intake.collateral-support')!.detail).toMatch(/not yet tracked/i);
  });

  it('UNDERWRITING exit no longer asks for a credit memo draft', () => {
    const r = evaluateExitGate('UNDERWRITING', {
      underwritingReviewCompleted: true,
      underwritingRecommendationRecorded: true,
    });
    expect(r.requirements.map((req) => req.id)).toEqual([
      'uw.review-complete',
      'uw.risk-rating',
      'uw.recommendation',
    ]);
    expect(r.requirements.some((req) => /memo/i.test(req.label))).toBe(false);
  });
});

describe('evaluateExitGate - fail-closed on each single missing requirement', () => {
  it('CREDIT_APPROVAL fails when the approver authority is insufficient', () => {
    const r = evaluateExitGate('CREDIT_APPROVAL', {
      ...ALL_MET_EXCEPT_PENDING_RISK_RATING,
      approvalAuthoritySufficient: false,
    });
    expect(r.satisfied).toBe(false);
    expect(outstandingRequirements(r).map((o) => o.id)).toContain('ca.authority');
  });

  it('CLOSING_FUNDING fails when funds are not disbursed', () => {
    const r = evaluateExitGate('CLOSING_FUNDING', { ...ALL_MET_EXCEPT_PENDING_RISK_RATING, fundsDisbursed: false });
    expect(r.satisfied).toBe(false);
    expect(outstandingRequirements(r).map((o) => o.id)).toEqual(['close.disbursed']);
  });
});

describe('evaluateExitGate - unknown/untracked data is fail-closed and surfaced honestly', () => {
  it('treats absent facts as not met with a "not yet tracked" detail except for known pending placeholders', () => {
    const r = evaluateExitGate('UNDERWRITING', {});
    expect(r.satisfied).toBe(false);
    expect(r.requirements.every((req) => !req.met)).toBe(true);
    expect(r.requirements.find((req) => req.id === 'uw.review-complete')!.detail).toMatch(/not yet tracked/i);
    expect(r.requirements.find((req) => req.id === 'uw.recommendation')!.detail).toMatch(/not yet tracked/i);
    expect(r.requirements.find((req) => req.id === 'uw.risk-rating')!.detail).toBe(
      'risk rating system not yet implemented',
    );
  });

  it('untrackedRequirementIds enumerates not-yet-tracked gaps without treating risk rating as untracked', () => {
    const facts: StageGateFacts = { underwritingReviewCompleted: true };
    const untracked = untrackedRequirementIds('UNDERWRITING', facts);
    expect(untracked).toContain('uw.recommendation');
    expect(untracked).not.toContain('uw.review-complete');
    expect(untracked).not.toContain('uw.risk-rating');
  });

  it('distinguishes outstanding (false) from not-tracked (undefined) in the detail copy', () => {
    const r = evaluateExitGate('COMMITMENT', { commitmentIssued: false });
    const issued = r.requirements.find((req) => req.id === 'commit.issued')!;
    const acceptance = r.requirements.find((req) => req.id === 'commit.acceptance')!;
    expect(issued.detail).toMatch(/outstanding/i);
    expect(acceptance.detail).toMatch(/not yet tracked/i);
  });
});

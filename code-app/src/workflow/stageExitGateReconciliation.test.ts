// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  reconcileStageExitGate,
  certifyStageExitGatesReconciled,
} from './stageExitGateReconciliation';
import type { StageGateFacts } from './stageGateContract';

const INTAKE_ALL_MET: StageGateFacts = {
  borrowerPresent: true, loanAmountPresent: true, productTypePresent: true,
  assignedBankerPresent: true, intakeChecklistGenerated: true, completeCreditMemoPresent: true,
  loanApplicationReceived: true, businessFinancialStatementsReceived: true, taxReturnsReceived: true,
  ownershipInformationReceived: true, collateralSupportReceived: true,
};

describe('reconcileStageExitGate — WFLOW-G', () => {
  it('aligned-allow + certifiable when live allows, rigorous is satisfied, and all facts are tracked', () => {
    const r = reconcileStageExitGate('INTAKE', INTAKE_ALL_MET, 'clear');
    expect(r.verdict).toBe('aligned-allow');
    expect(r.rigorousSatisfied).toBe(true);
    expect(r.untracked).toEqual([]);
    expect(r.certifiable).toBe(true);
    expect(r.certificationBlockers).toEqual([]);
  });

  it('divergent + NOT certifiable when the live path allows but the rigorous gate blocks (over-permissive)', () => {
    // INTAKE readiness clear (live allows) but a rigorous fact outstanding.
    const r = reconcileStageExitGate('INTAKE', { ...INTAKE_ALL_MET, collateralSupportReceived: false }, 'clear');
    expect(r.liveWouldAllow).toBe(true);
    expect(r.rigorousSatisfied).toBe(false);
    expect(r.verdict).toBe('divergent-live-overpermissive');
    expect(r.certifiable).toBe(false);
    expect(r.certificationBlockers.join(' ')).toMatch(/Collateral support received/);
  });

  it('UNTRACKED risk-rating blocks UNDERWRITING certification even when every other UW fact is met and readiness is clear', () => {
    const uwFacts: StageGateFacts = { underwritingReviewCompleted: true, underwritingRecommendationRecorded: true };
    const r = reconcileStageExitGate('UNDERWRITING', uwFacts, 'clear');
    // The live path would allow the advance; the rigorous gate cannot be satisfied because
    // risk rating is not tracked (system not yet implemented).
    expect(r.liveWouldAllow).toBe(true);
    expect(r.rigorousSatisfied).toBe(false);
    expect(r.untracked).toContain('uw.risk-rating');
    expect(r.verdict).toBe('divergent-live-overpermissive');
    expect(r.certifiable).toBe(false);
    expect(r.certificationBlockers.join(' ')).toMatch(/Risk rating assigned.*not tracked/);
  });

  it('aligned-block when both gates block (readiness blocked AND rigorous unsatisfied)', () => {
    const r = reconcileStageExitGate('CREDIT_APPROVAL', {}, 'blocked');
    expect(r.liveWouldAllow).toBe(false);
    expect(r.rigorousSatisfied).toBe(false);
    expect(r.verdict).toBe('aligned-block');
    expect(r.certifiable).toBe(false);
  });

  it('surfaces the closing/funding + boarding facts as untracked blockers when absent', () => {
    const closing = reconcileStageExitGate('CLOSING_FUNDING', {}, 'clear');
    expect(closing.untracked).toEqual(expect.arrayContaining(['close.executed', 'close.disbursed']));
    expect(closing.certifiable).toBe(false);

    const boarded = reconcileStageExitGate('BOARDED', {}, 'clear');
    expect(boarded.untracked).toContain('boarded.completed');
    expect(boarded.certifiable).toBe(false);
  });
});

describe('certifyStageExitGatesReconciled — aggregate (WFLOW-G)', () => {
  it('untracked facts anywhere BLOCK the whole certification (fail-closed)', () => {
    const cert = certifyStageExitGatesReconciled([
      { stage: 'INTAKE', facts: INTAKE_ALL_MET, liveReadinessStatus: 'clear' },
      // UNDERWRITING carries an untracked risk-rating fact.
      { stage: 'UNDERWRITING', facts: { underwritingReviewCompleted: true, underwritingRecommendationRecorded: true }, liveReadinessStatus: 'clear' },
    ]);
    expect(cert.certified).toBe(false);
    expect(cert.untrackedRequirementIds).toContain('uw.risk-rating');
    expect(cert.divergentStages).toContain('UNDERWRITING');
    expect(cert.blockers.length).toBeGreaterThan(0);
  });

  it('certifies only when EVERY provided stage is certifiable (INTAKE alone, fully met)', () => {
    const cert = certifyStageExitGatesReconciled([
      { stage: 'INTAKE', facts: INTAKE_ALL_MET, liveReadinessStatus: 'clear' },
    ]);
    expect(cert.certified).toBe(true);
    expect(cert.blockers).toEqual([]);
    expect(cert.untrackedRequirementIds).toEqual([]);
  });

  it('an empty stage set is never certified', () => {
    expect(certifyStageExitGatesReconciled([]).certified).toBe(false);
  });
});

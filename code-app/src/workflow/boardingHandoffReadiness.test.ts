// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { evaluateBoardingHandoff } from './boardingHandoffReadiness';

const evidence = (over: Partial<{ active: boolean; assignedServicingOwnerId: string }> = {}) => ({
  portfolioBoardedLoanId: 'pbl-1',
  boardingStatus: 'Boarded',
  active: over.active ?? true,
  assignedServicingOwnerId: over.assignedServicingOwnerId,
});

describe('evaluateBoardingHandoff — WFLOW-H (no stage-string-only trust)', () => {
  it('boarded: deal claims BOARDED AND an active portfolio record exists → boardingCompleted true', () => {
    const r = evaluateBoardingHandoff('BOARDED', evidence());
    expect(r.verdict).toBe('boarded');
    expect(r.boardingCompleted).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('MISSING-HANDOFF blocker: deal stage says BOARDED but NO portfolio record → NOT complete', () => {
    const r = evaluateBoardingHandoff('BOARDED', null);
    expect(r.verdict).toBe('missing-handoff');
    expect(r.boardingCompleted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/no active cr664_portfolioboardedloans handoff record/i);
  });

  it('MISSING-HANDOFF: an INACTIVE portfolio record does not count as handoff evidence', () => {
    const r = evaluateBoardingHandoff('BOARDED', evidence({ active: false }));
    expect(r.verdict).toBe('missing-handoff');
    expect(r.boardingCompleted).toBe(false);
  });

  it('recognizes the ratified stage NAME (not just the code) as the boarded claim', () => {
    const r = evaluateBoardingHandoff('Boarded / Servicing', evidence());
    expect(r.dealClaimsBoarded).toBe(true);
    expect(r.verdict).toBe('boarded');
  });

  it('premature-handoff anomaly: a portfolio record exists but the deal is NOT at BOARDED', () => {
    const r = evaluateBoardingHandoff('CLOSING_FUNDING', evidence());
    expect(r.verdict).toBe('premature-handoff');
    expect(r.boardingCompleted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/disagree/);
  });

  it('not-boarded: neither claim nor evidence', () => {
    const r = evaluateBoardingHandoff('UNDERWRITING', null);
    expect(r.verdict).toBe('not-boarded');
    expect(r.boardingCompleted).toBe(false);
    expect(r.blockers).toEqual([]);
  });
});

describe('evaluateBoardingHandoff — Final LOS Completion arc (Workstream H) — servicingOwnerAssigned', () => {
  it('fails closed when no boarded-loan record exists at all', () => {
    const r = evaluateBoardingHandoff('BOARDED', null);
    expect(r.servicingOwnerAssigned).toBe(false);
  });

  it('fails closed when a boarded-loan record exists but has no assigned servicing owner', () => {
    const r = evaluateBoardingHandoff('BOARDED', evidence());
    expect(r.servicingOwnerAssigned).toBe(false);
  });

  it('is met once the boarded-loan record has an assigned servicing owner', () => {
    const r = evaluateBoardingHandoff('BOARDED', evidence({ assignedServicingOwnerId: 'user-1' }));
    expect(r.servicingOwnerAssigned).toBe(true);
  });

  it('fails closed when the record has an assigned owner but is INACTIVE', () => {
    const r = evaluateBoardingHandoff('BOARDED', evidence({ active: false, assignedServicingOwnerId: 'user-1' }));
    expect(r.servicingOwnerAssigned).toBe(false);
  });
});

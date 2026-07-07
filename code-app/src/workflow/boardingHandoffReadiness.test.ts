// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { boardedGetAll } = vi.hoisted(() => ({ boardedGetAll: vi.fn() }));
vi.mock('../generated/services/Cr664_portfolioboardedloansService', () => ({
  Cr664_portfolioboardedloansService: { getAll: boardedGetAll },
}));

import { evaluateBoardingHandoff, loadBoardingHandoffForDeal } from './boardingHandoffReadiness';

beforeEach(() => boardedGetAll.mockReset());

const evidence = (over: Partial<{ active: boolean }> = {}) => ({
  portfolioBoardedLoanId: 'pbl-1',
  boardingStatus: 'Boarded',
  active: over.active ?? true,
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

describe('loadBoardingHandoffForDeal — live proof (WFLOW-H)', () => {
  it('finds the active linked boarded-loan record and proves the handoff', async () => {
    boardedGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_portfolioboardedloanid: 'pbl-1', cr664_boardingstatus: 'Boarded', statecode: 0, _cr664_originatedloandeal_value: 'deal-1' }],
    });
    const r = await loadBoardingHandoffForDeal('deal-1', 'BOARDED');
    expect(r.verdict).toBe('boarded');
    expect(r.boardingCompleted).toBe(true);
    expect(boardedGetAll).toHaveBeenCalledWith(expect.objectContaining({
      filter: '_cr664_originatedloandeal_value eq deal-1',
    }));
  });

  it('MISSING-HANDOFF: deal says BOARDED but the query returns no linked record', async () => {
    boardedGetAll.mockResolvedValueOnce({ success: true, data: [] });
    const r = await loadBoardingHandoffForDeal('deal-1', 'BOARDED');
    expect(r.verdict).toBe('missing-handoff');
    expect(r.boardingCompleted).toBe(false);
  });

  it('ignores an INACTIVE linked record (statecode 1) — treated as no active handoff', async () => {
    boardedGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_portfolioboardedloanid: 'pbl-1', statecode: 1, _cr664_originatedloandeal_value: 'deal-1' }],
    });
    const r = await loadBoardingHandoffForDeal('deal-1', 'BOARDED');
    expect(r.verdict).toBe('missing-handoff');
    expect(r.boardingCompleted).toBe(false);
  });

  it('FAIL-CLOSED: a failed read reports a blocker and is not boarding-complete', async () => {
    boardedGetAll.mockResolvedValueOnce({ success: false, error: { message: 'dataverse unavailable' } });
    const r = await loadBoardingHandoffForDeal('deal-1', 'BOARDED');
    expect(r.boardingCompleted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/read failed/);
  });

  it('FAIL-CLOSED: a thrown read reports a blocker and is not boarding-complete', async () => {
    boardedGetAll.mockRejectedValueOnce(new Error('boom'));
    const r = await loadBoardingHandoffForDeal('deal-1', 'BOARDED');
    expect(r.boardingCompleted).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/threw: boom/);
  });
});

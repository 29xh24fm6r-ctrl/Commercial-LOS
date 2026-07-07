// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { boardedGetAll } = vi.hoisted(() => ({ boardedGetAll: vi.fn() }));
vi.mock('../generated/services/Cr664_portfolioboardedloansService', () => ({
  Cr664_portfolioboardedloansService: { getAll: boardedGetAll },
}));

import { loadBoardingHandoffForDeal } from './loadBoardingHandoffForDeal';

beforeEach(() => boardedGetAll.mockReset());

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

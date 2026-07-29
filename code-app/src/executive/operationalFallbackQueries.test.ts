import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getAllMock } = vi.hoisted(() => ({ getAllMock: vi.fn() }));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllMock },
}));

import { loadPipelineByStageFallback, loadClosingForecastFallback } from './operationalFallbackQueries';
import { ACTIVE_DEAL_ODATA_PREDICATE } from '../shared/deals/dealVisibilityScopes';

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_loandealid: 'deal-1',
    cr664_dealname: 'Acme Working Capital',
    cr664_stagereferencename: 'Underwriting',
    cr664_amount: 500_000,
    cr664_targetclosedate: '2026-09-15',
    ...overrides,
  };
}

beforeEach(() => getAllMock.mockReset());

describe('operationalFallbackQueries — Factory Arc Phase 6 canonical predicate usage', () => {
  it('loadPipelineByStageFallback queries with the canonical active-deal predicate', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    await loadPipelineByStageFallback();
    expect(getAllMock).toHaveBeenCalledWith({ filter: ACTIVE_DEAL_ODATA_PREDICATE });
  });

  it('loadClosingForecastFallback queries with the canonical active-deal predicate', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    await loadClosingForecastFallback();
    expect(getAllMock).toHaveBeenCalledWith({ filter: ACTIVE_DEAL_ODATA_PREDICATE });
  });
});

describe('loadPipelineByStageFallback', () => {
  it('aggregates deals by stage, excluding test/smoke-named deals', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({ cr664_loandealid: 'd1', cr664_stagereferencename: 'Underwriting', cr664_amount: 100_000 }),
        dealRow({ cr664_loandealid: 'd2', cr664_stagereferencename: 'Underwriting', cr664_amount: 200_000 }),
        dealRow({ cr664_loandealid: 'd3', cr664_stagereferencename: 'Closing', cr664_amount: 50_000 }),
        dealRow({ cr664_loandealid: 'd4', cr664_dealname: '[SMOKE TEST] Placeholder Deal', cr664_stagereferencename: 'Closing', cr664_amount: 999_999 }),
      ],
    });
    const result = await loadPipelineByStageFallback();
    const underwriting = result.find((s) => s.stage === 'Underwriting');
    const closing = result.find((s) => s.stage === 'Closing');
    expect(underwriting).toEqual({ stage: 'Underwriting', count: 2, totalAmount: 300_000 });
    // TEST-named deal excluded — closing stays at 1/50,000, not 2/1,049,999.
    expect(closing).toEqual({ stage: 'Closing', count: 1, totalAmount: 50_000 });
  });

  it('buckets deals with no stage under "(no stage)"', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow({ cr664_stagereferencename: undefined })] });
    const result = await loadPipelineByStageFallback();
    expect(result).toEqual([{ stage: '(no stage)', count: 1, totalAmount: 500_000 }]);
  });

  it('excludes a normally named row when the explicit controlled-record flag is true', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({ cr664_loandealid: 'd1', cr664_istestrecord: true }),
        dealRow({ cr664_loandealid: 'd2', cr664_istestrecord: false }),
      ],
    });
    const result = await loadPipelineByStageFallback();
    expect(result).toEqual([{ stage: 'Underwriting', count: 1, totalAmount: 500_000 }]);
  });

  it('throws on a failed read rather than returning a fabricated empty aggregate', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'boom' } });
    await expect(loadPipelineByStageFallback()).rejects.toThrow('boom');
  });
});

describe('loadClosingForecastFallback', () => {
  it('buckets deals by target-close month, excluding test/smoke-named deals', async () => {
    const now = new Date(2026, 8, 1); // Sept 2026
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({ cr664_loandealid: 'd1', cr664_targetclosedate: '2026-09-15', cr664_amount: 100_000 }),
        dealRow({ cr664_loandealid: 'd2', cr664_targetclosedate: '2026-09-20', cr664_amount: 200_000 }),
        dealRow({ cr664_loandealid: 'd3', cr664_dealname: '[SMOKE TEST] Placeholder Deal', cr664_targetclosedate: '2026-09-25', cr664_amount: 999_999 }),
      ],
    });
    const result = await loadClosingForecastFallback(now);
    const sept = result.find((b) => b.key === '2026-09');
    expect(sept).toMatchObject({ count: 2, totalAmount: 300_000, past: false });
  });

  it('buckets a past target-close date under the Past bucket', async () => {
    const now = new Date(2026, 8, 1);
    getAllMock.mockResolvedValue({ success: true, data: [dealRow({ cr664_targetclosedate: '2026-01-01' })] });
    const result = await loadClosingForecastFallback(now);
    expect(result[0]).toMatchObject({ key: '__past__', label: 'Past target close', past: true });
  });

  it('buckets a deal with no target-close date under the No-date bucket', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [dealRow({ cr664_targetclosedate: undefined })] });
    const result = await loadClosingForecastFallback();
    expect(result[0]).toMatchObject({ key: '__no_date__', label: 'No target close date' });
  });

  it('throws on a failed read rather than returning a fabricated empty aggregate', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'boom' } });
    await expect(loadClosingForecastFallback()).rejects.toThrow('boom');
  });
});

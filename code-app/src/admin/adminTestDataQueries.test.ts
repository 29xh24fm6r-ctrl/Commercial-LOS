import { describe, it, expect, vi } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadTestDataSnapshot } from './adminTestDataQueries';

const getAll = vi.mocked(Cr664_loandealsService.getAll);

function dealRow(id: string, name: string) {
  // Minimal shape — only the fields loadTestDataSnapshot reads.
  return {
    cr664_loandealid: id,
    cr664_dealname: name,
    createdon: '2026-07-01T00:00:00Z',
    cr664_stagereferencename: 'Underwriting',
  };
}

describe('loadTestDataSnapshot', () => {
  it('partitions deals into operational vs test/smoke by the shared naming convention', async () => {
    getAll.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow('deal-1', 'Acme Working Capital'),
        dealRow('deal-2', 'SYSTEM TEST - regression fixture'),
        dealRow('deal-3', '[SMOKE TEST] pipeline check'),
      ],
    } as never);

    const snapshot = await loadTestDataSnapshot();
    expect(snapshot.operationalCount).toBe(1);
    expect(snapshot.testRows.map((r) => r.id)).toEqual(['deal-2', 'deal-3']);
  });

  it('reports the real service error rather than silently returning an empty set', async () => {
    getAll.mockResolvedValueOnce({ success: false, error: { message: 'Dataverse query failed.' } } as never);
    await expect(loadTestDataSnapshot()).rejects.toThrow('Dataverse query failed.');
  });
});

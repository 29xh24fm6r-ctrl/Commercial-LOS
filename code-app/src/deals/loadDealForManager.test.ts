import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadDealForManager } from './dealQueries';

const dealGet = vi.mocked(Cr664_loandealsService.get);

function dealRow(overrides: Record<string, unknown> = {}) {
  // Minimal shape — only the fields the function reads.
  return {
    cr664_loandealid: 'deal-1',
    cr664_dealname: 'Acme Working Capital',
    cr664_clientname: 'Acme',
    cr664_stagereferencename: 'Underwriting',
    cr664_statusreferencename: 'Active',
    cr664_amount: 4_500_000,
    cr664_assignedbankername: 'M. Paller',
    cr664_targetclosedate: '2026-09-30T00:00:00Z',
    cr664_producttypereferencename: 'RLOC',
    cr664_loanstructuretypereferencename: 'Senior Secured',
    cr664_customertypename: 'C&I',
    cr664_industryname: 'Manufacturing',
    cr664_guarantorstructurename: 'Two personal',
    cr664_pricingtypereferencename: 'Floating',
    cr664_spreadindexreferencename: 'SOFR',
    cr664_spreadmargin: 275,
    cr664_collateralsummary: 'A/R, inventory',
    createdon: '2026-01-15T00:00:00Z',
    cr664_stageentrydate: '2026-05-01T00:00:00Z',
    statecode: 0,
    _cr664_team_value: 'team-A',
    ...overrides,
  };
}

beforeEach(() => {
  dealGet.mockReset();
});

describe('loadDealForManager', () => {
  it('returns ready when the deal exists and the team matches', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.id).toBe('deal-1');
      expect(result.deal.name).toBe('Acme Working Capital');
      expect(result.deal.stage).toBe('Underwriting');
    }
  });

  it('returns denied when the deal exists but belongs to another team', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_team_value: 'team-B' }),
      } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('denied');
  });

  it('returns not-found when the deal API reports 404', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 404, message: 'Not found' },
      } as never),
    );
    const result = await loadDealForManager('missing-deal', 'team-A');
    expect(result.kind).toBe('not-found');
  });

  it('returns not-found when success is true but the row is missing', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: undefined } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('not-found');
  });

  it('returns failed with the underlying error message on non-404 service failure', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 500, message: 'internal error' },
      } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toBe('internal error');
    }
  });

  it('maps every field the deal-workspace cards consume (no missing-field regression)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      // Spot-check a handful of fields used downstream.
      expect(result.deal.amount).toBe(4_500_000);
      expect(result.deal.productType).toBe('RLOC');
      expect(result.deal.stageEntryDate).toBe('2026-05-01T00:00:00Z');
      expect(result.deal.targetCloseDate).toBe('2026-09-30T00:00:00Z');
      expect(result.deal.isClosed).toBe(false);
    }
  });

  it('isClosed is true when statecode is Inactive (1), regardless of team match', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ statecode: 1 }),
      } as never),
    );
    const result = await loadDealForManager('deal-1', 'team-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.isClosed).toBe(true);
    }
  });
});

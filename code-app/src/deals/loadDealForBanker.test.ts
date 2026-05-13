import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadDealForBanker } from './dealQueries';

const dealGet = vi.mocked(Cr664_loandealsService.get);

function dealRow(overrides: Record<string, unknown> = {}) {
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
    _cr664_assignedbanker_value: 'banker-A',
    _cr664_team_value: 'team-A',
    ...overrides,
  };
}

beforeEach(() => {
  dealGet.mockReset();
});

describe('loadDealForBanker', () => {
  it('returns ready when the assigned banker matches the caller', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.id).toBe('deal-1');
      expect(result.deal.bankerName).toBe('M. Paller');
    }
  });

  it('returns denied when the deal is assigned to another banker (no cross-banker leakage)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_assignedbanker_value: 'banker-OTHER' }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('returns denied if the assigned-banker FK is missing (defensive — no banker = not yours)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_assignedbanker_value: undefined }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('does NOT use team match — a banker without the assignment is denied even on a team deal', async () => {
    // Cross-role guarantee: banker auth must NEVER fall back to team
    // match. If the assigned-banker FK doesn't match, denied — even
    // when the deal lives on the banker's team.
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({
          _cr664_assignedbanker_value: 'banker-OTHER',
          _cr664_team_value: 'team-A',
        }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('returns not-found when the deal API reports 404 or empty data', async () => {
    dealGet.mockReturnValueOnce(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 404, message: 'Not found' },
      } as never),
    );
    expect((await loadDealForBanker('missing', 'banker-A')).kind).toBe(
      'not-found',
    );

    dealGet.mockReturnValueOnce(
      Promise.resolve({ success: true, data: undefined } as never),
    );
    expect((await loadDealForBanker('also-missing', 'banker-A')).kind).toBe(
      'not-found',
    );
  });

  it('returns failed with the underlying error message on non-404 service failure', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 500, message: 'internal error' },
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toBe('internal error');
    }
  });

  it('maps every field the deal-workspace cards consume', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.amount).toBe(4_500_000);
      expect(result.deal.productType).toBe('RLOC');
      expect(result.deal.stageEntryDate).toBe('2026-05-01T00:00:00Z');
      expect(result.deal.targetCloseDate).toBe('2026-09-30T00:00:00Z');
      expect(result.deal.isClosed).toBe(false);
    }
  });
});

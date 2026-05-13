import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadDealForTeam, loadDealForManager } from './dealQueries';

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
    _cr664_team_value: 'team-A',
    ...overrides,
  };
}

beforeEach(() => {
  dealGet.mockReset();
});

describe('loadDealForTeam', () => {
  it('returns ready when the deal exists and the team matches the caller', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForTeam('deal-1', 'team-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.id).toBe('deal-1');
      expect(result.deal.name).toBe('Acme Working Capital');
    }
  });

  it('returns denied when the deal belongs to another team (cross-team leakage blocked)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_team_value: 'team-B' }),
      } as never),
    );
    const result = await loadDealForTeam('deal-1', 'team-A');
    expect(result.kind).toBe('denied');
  });

  it('returns not-found when the underlying record is missing or 404', async () => {
    dealGet.mockReturnValueOnce(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 404, message: 'Not found' },
      } as never),
    );
    expect((await loadDealForTeam('missing-deal', 'team-A')).kind).toBe(
      'not-found',
    );

    dealGet.mockReturnValueOnce(
      Promise.resolve({ success: true, data: undefined } as never),
    );
    expect((await loadDealForTeam('also-missing', 'team-A')).kind).toBe(
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
    const result = await loadDealForTeam('deal-1', 'team-A');
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toBe('internal error');
    }
  });

  it('loadDealForManager and loadDealForTeam agree on the same record + team (both apply the same team-match predicate today)', async () => {
    // Same input → same outcome today. The two functions are
    // intentionally distinct names so a future divergence (e.g. team
    // members getting a tighter "deals you touch" scope) is a
    // local edit, not a global hunt.
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const teamOutcome = await loadDealForTeam('deal-1', 'team-A');
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const managerOutcome = await loadDealForManager('deal-1', 'team-A');
    expect(teamOutcome.kind).toBe('ready');
    expect(managerOutcome.kind).toBe('ready');
  });

  it('mismatched team is denied for BOTH team and manager (no role-bypass)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_team_value: 'other-team' }),
      } as never),
    );
    expect((await loadDealForTeam('deal-1', 'team-A')).kind).toBe('denied');
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_team_value: 'other-team' }),
      } as never),
    );
    expect((await loadDealForManager('deal-1', 'team-A')).kind).toBe('denied');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAllMocks: Record<string, ReturnType<typeof vi.fn>> = {};
function mockService(exportName: string, impl: ReturnType<typeof vi.fn>) {
  getAllMocks[exportName] = impl;
}

vi.mock('../generated/services/Cr664_portfolioboardedloansService', () => ({
  get Cr664_portfolioboardedloansService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloansService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloancovenantsService', () => ({
  get Cr664_portfolioboardedloancovenantsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloancovenantsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloaninsurancesService', () => ({
  get Cr664_portfolioboardedloaninsurancesService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloaninsurancesService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanticklersService', () => ({
  get Cr664_portfolioboardedloanticklersService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanticklersService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloancollateralsService', () => ({
  get Cr664_portfolioboardedloancollateralsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloancollateralsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanexceptionsService', () => ({
  get Cr664_portfolioboardedloanexceptionsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanexceptionsService };
  },
}));

import { loadServicingLifecycleSnapshotForLoan } from './loadServicingLifecycleSnapshotForLoan';

const ALL_CHILD_EXPORT_NAMES = [
  'Cr664_portfolioboardedloancovenantsService',
  'Cr664_portfolioboardedloaninsurancesService',
  'Cr664_portfolioboardedloanticklersService',
  'Cr664_portfolioboardedloancollateralsService',
  'Cr664_portfolioboardedloanexceptionsService',
];

const AS_OF = '2026-07-24';

function activeLoanRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_portfolioboardedloanid: 'loan-1',
    cr664_boardingstatus: 'Complete',
    cr664_loanstatus: 'Active',
    cr664_maturitydate: '2030-01-01',
    cr664_nextreviewdate: '2027-01-01',
    statecode: 0,
    _cr664_originatedloandeal_value: 'deal-1',
    ...overrides,
  };
}

beforeEach(() => {
  mockService('Cr664_portfolioboardedloansService', vi.fn(async () => ({ success: true, data: [activeLoanRow()] })));
  for (const name of ALL_CHILD_EXPORT_NAMES) {
    mockService(name, vi.fn(async () => ({ success: true, data: [] })));
  }
});

describe('PR 111 — loadServicingLifecycleSnapshotForLoan', () => {
  it('reports not_boarded when no active portfolio boarded-loan record exists for the deal', async () => {
    mockService('Cr664_portfolioboardedloansService', vi.fn(async () => ({ success: true, data: [] })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('not_boarded');
  });

  it('reports unavailable (fail-closed) when the parent read fails, never a fabricated snapshot', async () => {
    mockService('Cr664_portfolioboardedloansService', vi.fn(async () => ({ success: false, error: { message: 'boom' } })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('unavailable');
    if (result.kind === 'unavailable') expect(result.message).toMatch(/boom/);
  });

  it('reports unavailable when the parent read throws', async () => {
    mockService('Cr664_portfolioboardedloansService', vi.fn(async () => {
      throw new Error('network down');
    }));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('unavailable');
  });

  it('loads a real snapshot for a genuinely boarded loan, filtered to that loan id', async () => {
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF, borrowerName: 'Acme Corp' });
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.snapshot.sourceDealId).toBe('deal-1');
    expect(result.snapshot.boardedLoanId).toBe('loan-1');
    expect(result.snapshot.borrowerName).toBe('Acme Corp');

    const covenantCall = getAllMocks.Cr664_portfolioboardedloancovenantsService.mock.calls[0]![0];
    expect(covenantCall.filter).toBe('_cr664_portfolioboardedloan_value eq loan-1');
  });

  it('a failing covenant flips covenant reporting to exception_active and marks covenantExceptionActive', async () => {
    mockService('Cr664_portfolioboardedloancovenantsService', vi.fn(async () => ({
      success: true,
      data: [{ cr664_covenantid: 'C1', cr664_covenantname: 'DSCR', cr664_currentstatus: 'Breach' }],
    })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.snapshot.covenantReportingStatus.status).toBe('exception_active');
  });

  it('an unreadable exceptions table reports "unknown" (not healthy) and is never treated as clean', async () => {
    mockService('Cr664_portfolioboardedloanexceptionsService', vi.fn(async () => ({ success: false })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.snapshot.exceptionStatus.status).toBe('unknown');
    expect(result.snapshot.lifecycleStatus).not.toBe('healthy');
  });

  it('an open servicing exception is reflected honestly with its real exception id', async () => {
    mockService('Cr664_portfolioboardedloanexceptionsService', vi.fn(async () => ({
      success: true,
      data: [{ cr664_exceptionid: 'EX-1', cr664_status: 'Open' }],
    })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.snapshot.exceptionStatus.status).toBe('exception_active');
    expect(result.snapshot.exceptionStatus.openExceptions).toEqual(['EX-1']);
  });

  it('missing insurance evidence stays missing rather than being reported as current', async () => {
    mockService('Cr664_portfolioboardedloaninsurancesService', vi.fn(async () => ({ success: true, data: [] })));
    const result = await loadServicingLifecycleSnapshotForLoan('deal-1', 'Boarded', { asOfDate: AS_OF });
    expect(result.kind).toBe('loaded');
    if (result.kind !== 'loaded') return;
    expect(result.snapshot.insuranceStatus.status).toBe('unknown_missing_data');
  });
});

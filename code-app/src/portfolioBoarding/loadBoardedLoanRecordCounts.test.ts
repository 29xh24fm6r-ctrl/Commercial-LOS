import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EXISTING_LOAN_CHILD_KEYS } from './existingLoanEntryAdapter';

const getAllMocks: Record<string, ReturnType<typeof vi.fn>> = {};

function mockService(exportName: string, impl: ReturnType<typeof vi.fn>) {
  getAllMocks[exportName] = impl;
}

vi.mock('../generated/services/Cr664_portfolioboardedloanborrowersService', () => ({
  get Cr664_portfolioboardedloanborrowersService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanborrowersService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloancollateralsService', () => ({
  get Cr664_portfolioboardedloancollateralsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloancollateralsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanguarantorsService', () => ({
  get Cr664_portfolioboardedloanguarantorsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanguarantorsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloancovenantsService', () => ({
  get Cr664_portfolioboardedloancovenantsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloancovenantsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanticklersService', () => ({
  get Cr664_portfolioboardedloanticklersService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanticklersService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloaninsurancesService', () => ({
  get Cr664_portfolioboardedloaninsurancesService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloaninsurancesService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloandocumentsService', () => ({
  get Cr664_portfolioboardedloandocumentsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloandocumentsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanexceptionsService', () => ({
  get Cr664_portfolioboardedloanexceptionsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanexceptionsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanreviewsService', () => ({
  get Cr664_portfolioboardedloanreviewsService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanreviewsService };
  },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanexaminernotesService', () => ({
  get Cr664_portfolioboardedloanexaminernotesService() {
    return { getAll: getAllMocks.Cr664_portfolioboardedloanexaminernotesService };
  },
}));

import { loadBoardedLoanRecordCounts } from './loadBoardedLoanRecordCounts';

const ALL_EXPORT_NAMES = [
  'Cr664_portfolioboardedloanborrowersService',
  'Cr664_portfolioboardedloancollateralsService',
  'Cr664_portfolioboardedloanguarantorsService',
  'Cr664_portfolioboardedloancovenantsService',
  'Cr664_portfolioboardedloanticklersService',
  'Cr664_portfolioboardedloaninsurancesService',
  'Cr664_portfolioboardedloandocumentsService',
  'Cr664_portfolioboardedloanexceptionsService',
  'Cr664_portfolioboardedloanreviewsService',
  'Cr664_portfolioboardedloanexaminernotesService',
];

beforeEach(() => {
  for (const name of ALL_EXPORT_NAMES) {
    mockService(name, vi.fn(async () => ({ success: true, data: [] })));
  }
});

describe('Factory Arc Phase 9 — loadBoardedLoanRecordCounts', () => {
  it('reads all ten child groups, filtered to the one boarded loan', async () => {
    mockService('Cr664_portfolioboardedloancollateralsService', vi.fn(async () => ({ success: true, data: [{}, {}] })));
    mockService('Cr664_portfolioboardedloanguarantorsService', vi.fn(async () => ({ success: true, data: [{}] })));

    const counts = await loadBoardedLoanRecordCounts('loan-1');

    expect(Object.keys(counts).sort()).toEqual([...EXISTING_LOAN_CHILD_KEYS].sort());
    expect(counts.collateral).toBe(2);
    expect(counts.guarantors).toBe(1);
    expect(counts.borrowers).toBe(0);

    const collateralCall = getAllMocks.Cr664_portfolioboardedloancollateralsService.mock.calls[0]![0];
    expect(collateralCall.filter).toBe('_cr664_portfolioboardedloan_value eq loan-1');
  });

  it('reports null (not zero) for a group whose read failed — fail-closed, never a fabricated empty', async () => {
    mockService('Cr664_portfolioboardedloanexceptionsService', vi.fn(async () => ({ success: false })));

    const counts = await loadBoardedLoanRecordCounts('loan-1');

    expect(counts.exceptions).toBeNull();
  });

  it('reports null when a group read throws', async () => {
    mockService('Cr664_portfolioboardedloanreviewsService', vi.fn(async () => {
      throw new Error('network error');
    }));

    const counts = await loadBoardedLoanRecordCounts('loan-1');

    expect(counts.reviews).toBeNull();
  });
});

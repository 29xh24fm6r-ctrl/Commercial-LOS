import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_portfolioboardedloansService', () => ({
  Cr664_portfolioboardedloansService: { create: vi.fn(), update: vi.fn(), get: vi.fn(), getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_portfolioboardedloanborrowersService', () => ({
  Cr664_portfolioboardedloanborrowersService: { create: vi.fn(), update: vi.fn(), get: vi.fn(), getAll: vi.fn() },
}));

import { Cr664_portfolioboardedloansService } from '../generated/services/Cr664_portfolioboardedloansService';
import { Cr664_portfolioboardedloanborrowersService } from '../generated/services/Cr664_portfolioboardedloanborrowersService';
import { buildLivePortfolioBoardingDataverseWriteClient } from './portfolioLoanBoardingDataverseWriteClient';

const createMock = vi.mocked(Cr664_portfolioboardedloansService.create);
const updateMock = vi.mocked(Cr664_portfolioboardedloansService.update);
const getMock = vi.mocked(Cr664_portfolioboardedloansService.get);
const getAllMock = vi.mocked(Cr664_portfolioboardedloansService.getAll);
const borrowerCreateMock = vi.mocked(Cr664_portfolioboardedloanborrowersService.create);

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  getMock.mockReset();
  getAllMock.mockReset();
  borrowerCreateMock.mockReset();
});

describe('buildLivePortfolioBoardingDataverseWriteClient', () => {
  it('creates a record and extracts the id via the entity-specific id field', async () => {
    createMock.mockResolvedValue({
      success: true,
      data: { cr664_portfolioboardedloanid: 'loan-1', cr664_loannumber: 'LN-1' },
    } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.create('cr664_portfolioboardedloans', { cr664_loannumber: 'LN-1' });
    expect(result).toEqual({ ok: true, id: 'loan-1', record: { cr664_portfolioboardedloanid: 'loan-1', cr664_loannumber: 'LN-1' } });
    expect(createMock).toHaveBeenCalledWith({ cr664_loannumber: 'LN-1' });
  });

  it('routes each entity set to its own generated service', async () => {
    borrowerCreateMock.mockResolvedValue({
      success: true,
      data: { cr664_portfolioboardedloanborrowerid: 'b-1' },
    } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.create('cr664_portfolioboardedloanborrowers', { cr664_legalentitytype: 'LLC' });
    expect(result).toEqual({ ok: true, id: 'b-1', record: { cr664_portfolioboardedloanborrowerid: 'b-1' } });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('fails closed for an entity set outside the 12-entity registry', async () => {
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.create('cr664_someotherentity', {});
    expect(result).toEqual({ ok: false, error: 'entity_not_registered' });
  });

  it('reports a non-success create honestly, never a fake id', async () => {
    createMock.mockResolvedValue({ success: false, error: { message: 'validation failed' } } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.create('cr664_portfolioboardedloans', {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe('validation failed');
  });

  it('update calls the entity service update with the id and fields', async () => {
    updateMock.mockResolvedValue({ success: true, data: { cr664_loannumber: 'LN-2' } } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.update('cr664_portfolioboardedloans', 'loan-1', { cr664_loannumber: 'LN-2' });
    expect(result).toEqual({ ok: true, record: { cr664_loannumber: 'LN-2' } });
    expect(updateMock).toHaveBeenCalledWith('loan-1', { cr664_loannumber: 'LN-2' });
  });

  it('retrieve calls the entity service get', async () => {
    getMock.mockResolvedValue({ success: true, data: { cr664_loannumber: 'LN-1' } } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.retrieve('cr664_portfolioboardedloans', 'loan-1');
    expect(result).toEqual({ ok: true, record: { cr664_loannumber: 'LN-1' } });
  });

  it('retrieveMultiple passes the query through as a filter', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [{ cr664_loannumber: 'LN-1' }] } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.retrieveMultiple('cr664_portfolioboardedloans', "cr664_loannumber eq 'LN-1'");
    expect(result).toEqual({ ok: true, records: [{ cr664_loannumber: 'LN-1' }] });
    expect(getAllMock).toHaveBeenCalledWith({ filter: "cr664_loannumber eq 'LN-1'" });
  });

  it('retrieveMultiple with no query omits the filter', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] } as never);
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    await client.retrieveMultiple('cr664_portfolioboardedloans', undefined);
    expect(getAllMock).toHaveBeenCalledWith(undefined);
  });

  it('catches a thrown error from the SDK call', async () => {
    createMock.mockRejectedValue(new Error('network down'));
    const client = buildLivePortfolioBoardingDataverseWriteClient();
    const result = await client.create('cr664_portfolioboardedloans', {});
    expect(result).toEqual({ ok: false, error: 'network down' });
  });
});

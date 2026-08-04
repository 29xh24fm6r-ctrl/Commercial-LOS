import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: vi.fn() },
}));

import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { loadDocumentRequirements } from './documentRequirementLiveReader';

const getAllMock = vi.mocked(Cr664_documentchecklistsService.getAll);

beforeEach(() => {
  getAllMock.mockReset();
});

describe('loadDocumentRequirements', () => {
  it('derives requirements from the deal and reconciles against live rows', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_documentchecklistid: 'row-1',
          cr664_documentname: 'Loan Application',
          cr664_requirementstatus: 788190104,
          cr664_required: true,
          cr664_acknowledged: true,
          cr664_revieweddate: '2026-07-01T00:00:00Z',
        },
      ],
    } as never);

    const result = await loadDocumentRequirements({
      dealId: 'deal-1',
      deal: { productType: undefined, loanStructure: undefined, customerType: undefined, guarantorStructure: undefined, collateralSummary: undefined, industry: undefined, stage: 'INTAKE' },
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      const loanApp = result.rows.find((r) => r.documentName === 'Loan Application');
      expect(loanApp).toEqual(expect.objectContaining({ id: 'row-1', status: 'reviewed' }));
    }
    expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: expect.stringContaining('deal-1') }));
  });

  it('a required document with no matching live row surfaces as a virtual not_assessed row', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] } as never);
    const result = await loadDocumentRequirements({
      dealId: 'deal-1',
      deal: { productType: undefined, loanStructure: undefined, customerType: undefined, guarantorStructure: undefined, collateralSummary: undefined, industry: undefined, stage: 'INTAKE' },
    });
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      const loanApp = result.rows.find((r) => r.documentName === 'Business Credit Application');
      expect(loanApp).toEqual(expect.objectContaining({ id: undefined, status: 'not_assessed' }));
    }
  });

  it('reports failed honestly on a non-success read', async () => {
    getAllMock.mockResolvedValue({ success: false, error: { message: 'boom' } } as never);
    const result = await loadDocumentRequirements({
      dealId: 'deal-1',
      deal: { productType: undefined, loanStructure: undefined, customerType: undefined, guarantorStructure: undefined, collateralSummary: undefined, industry: undefined, stage: undefined },
    });
    expect(result).toEqual({ kind: 'failed', message: 'boom' });
  });

  it('catches a thrown error', async () => {
    getAllMock.mockRejectedValue(new Error('network down'));
    const result = await loadDocumentRequirements({
      dealId: 'deal-1',
      deal: { productType: undefined, loanStructure: undefined, customerType: undefined, guarantorStructure: undefined, collateralSummary: undefined, industry: undefined, stage: undefined },
    });
    expect(result).toEqual({ kind: 'failed', message: 'network down' });
  });
});

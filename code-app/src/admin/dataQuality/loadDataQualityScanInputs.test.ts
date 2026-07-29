import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: vi.fn() },
}));
vi.mock('../../generated/services/Cr664_crmorganizationsService', () => ({
  Cr664_crmorganizationsService: { getAll: vi.fn() },
}));
vi.mock('../../generated/services/Cr664_portfolioboardedloansService', () => ({
  Cr664_portfolioboardedloansService: { getAll: vi.fn() },
}));
vi.mock('../adminAccessGrantLookup', () => ({
  listAdminEntitlementRows: vi.fn(),
}));

import { Cr664_loandealsService } from '../../generated/services/Cr664_loandealsService';
import { Cr664_crmorganizationsService } from '../../generated/services/Cr664_crmorganizationsService';
import { Cr664_portfolioboardedloansService } from '../../generated/services/Cr664_portfolioboardedloansService';
import { listAdminEntitlementRows } from '../adminAccessGrantLookup';
import { loadDataQualityScanInputs } from './loadDataQualityScanInputs';

const dealsGetAll = vi.mocked(Cr664_loandealsService.getAll);
const orgsGetAll = vi.mocked(Cr664_crmorganizationsService.getAll);
const boardedGetAll = vi.mocked(Cr664_portfolioboardedloansService.getAll);
const entitlementsLoad = vi.mocked(listAdminEntitlementRows);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Workstream O — loadDataQualityScanInputs', () => {
  it('maps every domain successfully and reports no failed domains', async () => {
    dealsGetAll.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_loandealid: 'd1',
          cr664_dealname: 'Real Deal',
          cr664_clientname: 'Acme',
          cr664_amount: 100,
          cr664_stagereferencename: 'BOARDED',
        },
      ],
    } as never);
    orgsGetAll.mockResolvedValue({
      success: true,
      data: [
        { cr664_crmorganizationid: 'o1', cr664_name: 'Acme LLC', cr664_legalname: 'Acme LLC', cr664_website: 'acme.com' },
      ],
    } as never);
    boardedGetAll.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_portfolioboardedloanid: 'b1',
          _cr664_originatedloandeal_value: 'd1',
          _cr664_assignedservicingowner_value: 'u1',
          statecode: 0,
        },
      ],
    } as never);
    entitlementsLoad.mockResolvedValue({
      success: true,
      rows: [{ id: 'e1', entitlementName: 'a@b.com - Admin Full Access', accessLevelKind: 'Full', active: true }],
    });

    const result = await loadDataQualityScanInputs();
    expect(result.failedDomains).toHaveLength(0);
    expect(result.inputs.deals).toEqual([
      { dealId: 'd1', dealName: 'Real Deal', clientName: 'Acme', amount: 100, stage: 'BOARDED' },
    ]);
    expect(result.inputs.organizations).toEqual([
      { organizationId: 'o1', name: 'Acme LLC', legalName: 'Acme LLC', website: 'acme.com' },
    ]);
    expect(result.inputs.boardedLoans).toEqual([
      expect.objectContaining({
        portfolioBoardedLoanId: 'b1',
        originatedLoanDealId: 'd1',
        assignedServicingOwnerId: 'u1',
        active: true,
      }),
    ]);
    expect(result.inputs.entitlements).toEqual([
      { id: 'e1', entitlementName: 'a@b.com - Admin Full Access', accessLevelKind: 'Full', active: true },
    ]);
  });

  it('retains controlled rows in the Admin scan so classification conflicts can be surfaced', async () => {
    dealsGetAll.mockResolvedValue({
      success: true,
      data: [
        { cr664_loandealid: 'd1', cr664_dealname: 'SMOKE TEST DEAL', cr664_amount: 1 },
        { cr664_loandealid: 'd2', cr664_dealname: 'Real Deal', cr664_amount: 1 },
      ],
    } as never);
    orgsGetAll.mockResolvedValue({ success: true, data: [] } as never);
    boardedGetAll.mockResolvedValue({ success: true, data: [] } as never);
    entitlementsLoad.mockResolvedValue({ success: true, rows: [] });

    const result = await loadDataQualityScanInputs();
    expect(result.inputs.deals.map((d) => d.dealId)).toEqual(['d1', 'd2']);
  });

  it('reports a failed domain without blocking the others', async () => {
    dealsGetAll.mockResolvedValue({ success: false, error: { message: 'deal read failed' } } as never);
    orgsGetAll.mockResolvedValue({ success: true, data: [] } as never);
    boardedGetAll.mockResolvedValue({ success: true, data: [] } as never);
    entitlementsLoad.mockResolvedValue({ success: true, rows: [] });

    const result = await loadDataQualityScanInputs();
    expect(result.failedDomains).toEqual([{ domain: 'deals', message: 'deal read failed' }]);
    expect(result.inputs.deals).toEqual([]);
    // The other domains still loaded.
    expect(result.inputs.organizations).toEqual([]);
  });

  it('reports every domain that fails, not just the first', async () => {
    dealsGetAll.mockRejectedValue(new Error('deals boom'));
    orgsGetAll.mockRejectedValue(new Error('orgs boom'));
    boardedGetAll.mockResolvedValue({ success: true, data: [] } as never);
    entitlementsLoad.mockResolvedValue({ success: false, error: 'entitlements boom' });

    const result = await loadDataQualityScanInputs();
    const domains = result.failedDomains.map((f) => f.domain).sort();
    expect(domains).toEqual(['deals', 'entitlements', 'organizations']);
  });
});

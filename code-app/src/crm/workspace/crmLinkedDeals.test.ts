// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../generated/services/Cr664_clientrelationshipsService', () => ({
  Cr664_clientrelationshipsService: { getAll: vi.fn() },
}));
vi.mock('../../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: vi.fn() },
}));

import { Cr664_clientrelationshipsService } from '../../generated/services/Cr664_clientrelationshipsService';
import { Cr664_loandealsService } from '../../generated/services/Cr664_loandealsService';
import { mapLinkedDeal, loadLinkedDealsForOrganization } from './crmLinkedDeals';

const relGetAll = vi.mocked(Cr664_clientrelationshipsService.getAll);
const dealGetAll = vi.mocked(Cr664_loandealsService.getAll);

function ok(data: Array<Record<string, unknown>>) {
  return { success: true, data } as never;
}

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REL_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const REL_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';

beforeEach(() => {
  relGetAll.mockReset();
  dealGetAll.mockReset();
});

describe('crmLinkedDeals — mapLinkedDeal', () => {
  it('maps a raw loan deal to name / stage / status / amount', () => {
    const d = mapLinkedDeal({
      cr664_loandealid: 'd-1',
      cr664_dealname: 'Acme Expansion',
      cr664_amount: 2_000_000,
      cr664_stagereferencename: 'Underwriting',
      cr664_statusreferencename: 'Active',
    });
    expect(d).toMatchObject({ id: 'd-1', name: 'Acme Expansion', stage: 'Underwriting', status: 'Active' });
    expect(d.amount).toMatch(/2,000,000/);
  });

  it('falls back to "Deal" and omits absent optional fields', () => {
    const d = mapLinkedDeal({ cr664_loandealid: 'd-2' });
    expect(d.name).toBe('Deal');
    expect(d.stage).toBeUndefined();
  });
});

describe('crmLinkedDeals — loadLinkedDealsForOrganization (DEFECT 6)', () => {
  it('short-circuits to empty (no SDK call) for a blank or non-GUID org id', async () => {
    expect(await loadLinkedDealsForOrganization('')).toEqual({ status: 'ready', deals: [] });
    expect(await loadLinkedDealsForOrganization('not-a-guid')).toEqual({ status: 'ready', deals: [] });
    expect(relGetAll).not.toHaveBeenCalled();
  });

  it('resolves the org via its bridged client relationship(s), then loads the deals linked to them', async () => {
    relGetAll.mockResolvedValue(ok([{ cr664_clientrelationshipid: REL_1 }, { cr664_clientrelationshipid: REL_2 }]));
    dealGetAll.mockResolvedValue(
      ok([
        { cr664_loandealid: 'd-1', cr664_dealname: 'Acme Expansion', cr664_amount: 2_000_000 },
        { cr664_loandealid: 'd-2', cr664_dealname: 'Acme Working Capital', cr664_amount: 500_000 },
      ]),
    );

    const result = await loadLinkedDealsForOrganization(ORG);

    // Step 1 filtered client relationships by the org reverse link (id-based).
    expect(relGetAll.mock.calls[0]![0]!.filter).toContain(`_cr664_organization_value eq ${ORG}`);
    // Step 2 filtered deals by the CLIENT RELATIONSHIP ids (not the org id directly).
    const dealFilter = dealGetAll.mock.calls[0]![0]!.filter as string;
    expect(dealFilter).toContain(`_cr664_client_value eq ${REL_1}`);
    expect(dealFilter).toContain(`_cr664_client_value eq ${REL_2}`);
    expect(result).toEqual({
      status: 'ready',
      deals: [
        expect.objectContaining({ id: 'd-1', name: 'Acme Expansion' }),
        expect.objectContaining({ id: 'd-2', name: 'Acme Working Capital' }),
      ],
    });
  });

  it('matches only by id — a different company with a SIMILAR name does not surface its deals', async () => {
    // This org bridges to REL_1 only; the similarly-named other company bridges to REL_2.
    relGetAll.mockResolvedValue(ok([{ cr664_clientrelationshipid: REL_1 }]));
    dealGetAll.mockResolvedValue(ok([{ cr664_loandealid: 'd-1', cr664_dealname: 'Acme Holdings LLC deal' }]));

    const result = await loadLinkedDealsForOrganization(ORG);

    const dealFilter = dealGetAll.mock.calls[0]![0]!.filter as string;
    expect(dealFilter).toContain(`_cr664_client_value eq ${REL_1}`);
    expect(dealFilter).not.toContain(REL_2); // the other similarly-named company's relationship is never queried
    // No name-based clause is ever used.
    expect(dealFilter).not.toMatch(/cr664_dealname|clientname|contains\(/i);
    expect(result.status).toBe('ready');
  });

  it('returns empty (not a crash) when the org has no bridged client relationship', async () => {
    relGetAll.mockResolvedValue(ok([]));
    dealGetAll.mockResolvedValue(ok([]));
    const result = await loadLinkedDealsForOrganization(ORG);
    expect(result).toEqual({ status: 'ready', deals: [] });
  });

  it('de-duplicates a deal that matches more than one client-id clause', async () => {
    relGetAll.mockResolvedValue(ok([{ cr664_clientrelationshipid: REL_1 }]));
    dealGetAll.mockResolvedValue(
      ok([
        { cr664_loandealid: 'd-1', cr664_dealname: 'Acme' },
        { cr664_loandealid: 'd-1', cr664_dealname: 'Acme' },
      ]),
    );
    const result = await loadLinkedDealsForOrganization(ORG);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.deals).toHaveLength(1);
  });

  it('fails closed to unavailable when the relationship read fails', async () => {
    relGetAll.mockResolvedValue({ success: false, error: { message: 'x' } } as never);
    const result = await loadLinkedDealsForOrganization(ORG);
    expect(result.status).toBe('unavailable');
    expect(dealGetAll).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mapLinkedDeal, loadLinkedDealsForOrganization } from './crmLinkedDeals';

describe('crmLinkedDeals', () => {
  it('maps a raw loan deal to name / stage / status / amount', () => {
    const d = mapLinkedDeal({
      cr664_loandealid: 'd-1',
      cr664_dealname: 'Acme Expansion',
      cr664_amount: 2_000_000,
      cr664_stagereferencename: 'Underwriting',
      cr664_statusreferencename: 'Active',
    });
    expect(d.id).toBe('d-1');
    expect(d.name).toBe('Acme Expansion');
    expect(d.stage).toBe('Underwriting');
    expect(d.status).toBe('Active');
    expect(d.amount).toMatch(/2,000,000/);
  });

  it('falls back to "Deal" and omits absent optional fields', () => {
    const d = mapLinkedDeal({ cr664_loandealid: 'd-2' });
    expect(d.name).toBe('Deal');
    expect(d.stage).toBeUndefined();
    expect(d.status).toBeUndefined();
    expect(d.amount).toBeUndefined();
  });

  it('short-circuits to empty (no SDK call) for a blank or non-GUID org id', async () => {
    expect(await loadLinkedDealsForOrganization('')).toEqual({ status: 'ready', deals: [] });
    expect(await loadLinkedDealsForOrganization('not-a-guid')).toEqual({ status: 'ready', deals: [] });
  });
});

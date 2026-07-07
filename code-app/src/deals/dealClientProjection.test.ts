import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadDealForBanker, type DealDetail } from './dealQueries';

/**
 * Phase 2 — projecting the verified CRM client relationship into the deal row.
 *
 * The deal lookup cr664_loandeal.cr664_Client targets a cr664_clientrelationship.
 * When that lookup is set (the governed link path), the cockpit must treat the
 * client as present and prefer the lookup's name over any stale free-text
 * cr664_clientname — without inferring a client from contacts or unbridged
 * organizations.
 */

const dealGet = vi.mocked(Cr664_loandealsService.get);
const CLIENT_FV = '_cr664_client_value@OData.Community.Display.V1.FormattedValue';

function row(overrides: Record<string, unknown> = {}) {
  return {
    cr664_loandealid: 'deal-1',
    cr664_dealname: 'OmniCare 365 Working Capital',
    statecode: 0,
    _cr664_assignedbanker_value: 'banker-A',
    ...overrides,
  };
}

async function load(overrides: Record<string, unknown> = {}): Promise<DealDetail> {
  dealGet.mockReturnValue(Promise.resolve({ success: true, data: row(overrides) } as never));
  const result = await loadDealForBanker('deal-1', 'banker-A');
  if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
  return result.deal;
}

beforeEach(() => dealGet.mockReset());

describe('client projection — verified cr664_Client lookup', () => {
  it('hydrates clientName + effectiveClientName from the linked client relationship', async () => {
    const deal = await load({
      _cr664_client_value: 'client-rel-1',
      [CLIENT_FV]: 'OmniCare 365',
    });
    expect(deal.clientId).toBe('client-rel-1');
    expect(deal.effectiveClientSource).toBe('crm-client-relationship');
    expect(deal.effectiveClientName).toBe('OmniCare 365');
    expect(deal.clientName).toBe('OmniCare 365');
    expect(deal.clientLookupClassification).toBe('real-lookup');
  });

  it('the verified lookup name WINS over a stale explicit cr664_clientname', async () => {
    const deal = await load({
      _cr664_client_value: 'client-rel-1',
      [CLIENT_FV]: 'OmniCare 365',
      cr664_clientname: 'Stale Old Name',
    });
    expect(deal.effectiveClientName).toBe('OmniCare 365');
    expect(deal.clientName).toBe('OmniCare 365');
  });

  it('a verified lookup with NO formatted name is still sourced from the CRM relationship', async () => {
    const deal = await load({ _cr664_client_value: 'client-rel-1' });
    expect(deal.effectiveClientSource).toBe('crm-client-relationship');
    expect(deal.clientId).toBe('client-rel-1');
  });
});

describe('client projection — no verified lookup', () => {
  it('falls back to the explicit deal client name when only cr664_clientname is set', async () => {
    const deal = await load({ cr664_clientname: 'Legacy Co' });
    expect(deal.clientId).toBeUndefined();
    expect(deal.effectiveClientSource).toBe('deal-client-name');
    expect(deal.effectiveClientName).toBe('Legacy Co');
    expect(deal.clientName).toBe('Legacy Co');
  });

  it('is missing when neither a lookup nor an explicit name exists (no fabrication)', async () => {
    const deal = await load();
    expect(deal.effectiveClientSource).toBe('missing');
    expect(deal.effectiveClientName).toBeUndefined();
    expect(deal.clientName).toBeUndefined();
  });

  it('a contact-only / unbridged CRM record does not set the lookup, so Client stays unsourced', async () => {
    // Contact-only / unbridged org data never writes cr664_Client — the row has
    // no _cr664_client_value, so it can never resolve to crm-client-relationship.
    const deal = await load({ cr664_someunrelatedcontactfield: 'a contact' });
    expect(deal.effectiveClientSource).toBe('missing');
    expect(deal.clientId).toBeUndefined();
  });
});

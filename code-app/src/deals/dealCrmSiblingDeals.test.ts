import { describe, it, expect, vi } from 'vitest';
import { loadDealCrmSiblingDeals, type DealCrmSiblingDealsDeps } from './dealCrmSiblingDeals';
import type { LinkedDeal } from '../crm/workspace/crmLinkedDeals';

/**
 * Remediation 2026-07-22 (Workstream D) — authoritative, ID-based sibling deals.
 *
 * Pins: real relationship-key matching (never name matching), the current deal excluded from the
 * sibling ROWS but included in the total relationship EXPOSURE, and fail-closed honesty for every
 * unresolved hop.
 */

function deps(overrides: Partial<DealCrmSiblingDealsDeps> = {}): DealCrmSiblingDealsDeps {
  return {
    resolveOrganizationId: vi.fn().mockResolvedValue({ success: true, organizationId: 'org-1' }),
    loadLinkedDeals: vi.fn().mockResolvedValue({ status: 'ready', deals: [] }),
    ...overrides,
  };
}

function sibling(over: Partial<LinkedDeal> = {}): LinkedDeal {
  return { id: 'sib-1', name: 'Sibling Deal', ...over };
}

describe('loadDealCrmSiblingDeals', () => {
  it('returns no-client-link honestly when the deal has no linked client relationship', async () => {
    const result = await loadDealCrmSiblingDeals('cur', 1_000_000, undefined, deps());
    expect(result.status).toBe('no-client-link');
  });

  it('returns no-org-link honestly when the client relationship is not bridged to a CRM org', async () => {
    const result = await loadDealCrmSiblingDeals(
      'cur',
      1_000_000,
      'client-1',
      deps({ resolveOrganizationId: vi.fn().mockResolvedValue({ success: true, organizationId: undefined }) }),
    );
    expect(result.status).toBe('no-org-link');
  });

  it('fails closed to unavailable when the organization read fails', async () => {
    const result = await loadDealCrmSiblingDeals(
      'cur',
      1_000_000,
      'client-1',
      deps({ resolveOrganizationId: vi.fn().mockResolvedValue({ success: false, error: 'denied' }) }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('fails closed to unavailable when the linked-deals read fails', async () => {
    const result = await loadDealCrmSiblingDeals(
      'cur',
      1_000_000,
      'client-1',
      deps({ loadLinkedDeals: vi.fn().mockResolvedValue({ status: 'unavailable', reason: 'x' }) }),
    );
    expect(result.status).toBe('unavailable');
  });

  it('excludes the current deal from siblingDeals but includes its amount in totalRelationshipExposure', async () => {
    const result = await loadDealCrmSiblingDeals(
      'cur',
      1_000_000,
      'client-1',
      deps({
        loadLinkedDeals: vi.fn().mockResolvedValue({
          status: 'ready',
          deals: [
            { id: 'cur', name: 'Current Deal', amountValue: 1_000_000 },
            sibling({ id: 'sib-1', name: 'Sibling One', amountValue: 500_000 }),
            sibling({ id: 'sib-2', name: 'Sibling Two', amountValue: 250_000 }),
          ],
        }),
      }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.siblingDeals.map((d) => d.id)).toEqual(['sib-1', 'sib-2']);
    expect(result.siblingDeals.some((d) => d.id === 'cur')).toBe(false);
    expect(result.totalRelationshipExposure).toBe(1_750_000);
    expect(result.exposureIncomplete).toBe(false);
  });

  it('flags exposureIncomplete honestly when a sibling has no parseable amount (never fabricates $0)', async () => {
    const result = await loadDealCrmSiblingDeals(
      'cur',
      1_000_000,
      'client-1',
      deps({
        loadLinkedDeals: vi.fn().mockResolvedValue({
          status: 'ready',
          deals: [sibling({ id: 'sib-1', amountValue: undefined })],
        }),
      }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.exposureIncomplete).toBe(true);
    expect(result.totalRelationshipExposure).toBe(1_000_000);
  });

  it('flags exposureIncomplete when the current deal itself has no parseable amount', async () => {
    const result = await loadDealCrmSiblingDeals('cur', undefined, 'client-1', deps());
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.exposureIncomplete).toBe(true);
    expect(result.totalRelationshipExposure).toBe(0);
  });

  it('never uses display-name matching -- it is keyed entirely by the resolved organization id', async () => {
    const loadLinkedDeals = vi.fn().mockResolvedValue({ status: 'ready', deals: [] });
    await loadDealCrmSiblingDeals('cur', 1_000_000, 'client-1', deps({ loadLinkedDeals }));
    expect(loadLinkedDeals).toHaveBeenCalledWith('org-1');
  });
});

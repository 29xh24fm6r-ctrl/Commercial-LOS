import { describe, it, expect, vi } from 'vitest';
import { resolveDealBridgedOrganizationId, type DealBridgedOrganizationLookupDeps } from './dealBridgedOrganizationLookup';

function deps(overrides: Partial<DealBridgedOrganizationLookupDeps> = {}): DealBridgedOrganizationLookupDeps {
  return {
    readDealClientId: vi.fn(async (_dealId: string) => ({ success: true, clientRelationshipId: 'client-1' })),
    readOrganizationIdForClient: vi.fn(async (_clientRelationshipId: string) => ({ success: true, organizationId: 'org-1' })),
    ...overrides,
  };
}

describe('resolveDealBridgedOrganizationId', () => {
  it('returns ready with the organization id on a full two-hop resolution', async () => {
    const result = await resolveDealBridgedOrganizationId('deal-1', deps());
    expect(result).toEqual({ status: 'ready', organizationId: 'org-1' });
  });

  it('fails closed with unavailable when no deal id is supplied', async () => {
    const result = await resolveDealBridgedOrganizationId('  ', deps());
    expect(result.status).toBe('unavailable');
  });

  it('returns no-client-link when the deal has no bridged client relationship', async () => {
    const result = await resolveDealBridgedOrganizationId(
      'deal-1',
      deps({ readDealClientId: vi.fn(async () => ({ success: true, clientRelationshipId: undefined })) }),
    );
    expect(result).toEqual({ status: 'no-client-link' });
  });

  it('returns no-org-link when the client relationship has no bridged organization', async () => {
    const result = await resolveDealBridgedOrganizationId(
      'deal-1',
      deps({ readOrganizationIdForClient: vi.fn(async () => ({ success: true, organizationId: undefined })) }),
    );
    expect(result).toEqual({ status: 'no-org-link' });
  });

  it('fails closed to unavailable when the deal lookup itself fails', async () => {
    const result = await resolveDealBridgedOrganizationId(
      'deal-1',
      deps({ readDealClientId: vi.fn(async () => ({ success: false, error: 'deal not found' })) }),
    );
    expect(result).toEqual({ status: 'unavailable', error: 'deal not found' });
  });

  it('fails closed to unavailable when the client-relationship lookup itself fails', async () => {
    const result = await resolveDealBridgedOrganizationId(
      'deal-1',
      deps({ readOrganizationIdForClient: vi.fn(async () => ({ success: false, error: 'client not found' })) }),
    );
    expect(result).toEqual({ status: 'unavailable', error: 'client not found' });
  });

  it('never calls the organization lookup when there is no client relationship to look up', async () => {
    const readOrganizationIdForClient = vi.fn(async () => ({ success: true, organizationId: 'org-1' }));
    await resolveDealBridgedOrganizationId(
      'deal-1',
      deps({
        readDealClientId: vi.fn(async () => ({ success: true, clientRelationshipId: undefined })),
        readOrganizationIdForClient,
      }),
    );
    expect(readOrganizationIdForClient).not.toHaveBeenCalled();
  });
});

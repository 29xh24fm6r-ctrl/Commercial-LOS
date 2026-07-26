import { describe, it, expect, vi } from 'vitest';
import {
  loadDealIndustryProjection,
  buildLiveDealIndustryProjectionDeps,
  type DealIndustryProjectionDeps,
} from './dealIndustryProjection';
import type { NaicsIndustryMapRow } from './naics/naicsIndustryMap';

vi.mock('../generated/services/Cr664_naicsindustrymapsService', () => ({
  Cr664_naicsindustrymapsService: { getAll: vi.fn() },
}));

import { Cr664_naicsindustrymapsService } from '../generated/services/Cr664_naicsindustrymapsService';

/**
 * Deal Industry projection from the linked CRM organization's NAICS.
 *
 * Pins the governed path deal → client relationship → organization → NAICS →
 * mapped industry, and every honest missing-hop state. Contact-only records and
 * unbridged orgs surface as `no-org-link` (they never drive Industry). No hop is
 * ever fabricated; a failed read is `unavailable`.
 */

const MAP_ROWS: NaicsIndustryMapRow[] = [
  { sectorCode: '31-33', dealIndustry: 'Manufacturing', active: true },
  { sectorCode: '62', dealIndustry: 'Healthcare', active: true },
];

function deps(over: Partial<DealIndustryProjectionDeps> = {}): DealIndustryProjectionDeps {
  return {
    readClientOrganizationId: async () => ({ success: true, organizationId: 'org-1' }),
    readOrganizationNaics: async () => ({ success: true, naicsCode: '333111' }),
    fetchMappingRows: async () => ({ success: true, rows: MAP_ROWS }),
    readNaicsTitle: async () => 'Iron and Steel Mills and Ferroalloy Manufacturing',
    ...over,
  };
}

describe('loadDealIndustryProjection', () => {
  it('derives the mapped industry through the full governed path', async () => {
    const r = await loadDealIndustryProjection('client-1', deps());
    expect(r).toMatchObject({ kind: 'derived', dealIndustry: 'Manufacturing', naicsCode: '333111', sectorCode: '31-33' });
  });

  // N-22/N-23 remediation (Production Remediation Factory Arc Phase 7)
  it('carries the exact NAICS title alongside the sector title when derived', async () => {
    const r = await loadDealIndustryProjection('client-1', deps());
    expect(r).toMatchObject({ kind: 'derived', naicsTitle: 'Iron and Steel Mills and Ferroalloy Manufacturing' });
  });

  it('a failed/unavailable title lookup never blocks the rest of the projection — naicsTitle is simply undefined', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readNaicsTitle: async () => undefined }));
    expect(r).toMatchObject({ kind: 'derived', dealIndustry: 'Manufacturing' });
    expect((r as { naicsTitle?: string }).naicsTitle).toBeUndefined();
  });

  it('a throwing title lookup never blocks the rest of the projection', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readNaicsTitle: async () => { throw new Error('boom'); } }));
    expect(r.kind).toBe('derived');
    expect((r as { naicsTitle?: string }).naicsTitle).toBeUndefined();
  });

  it('carries the exact NAICS title even in a no-mapping (honest blocked) projection — N-23\'s restaurant example', async () => {
    // Sector 72 (Accommodation/Food Services) is not in MAP_ROWS — mirrors the audit's 722511 example.
    const r = await loadDealIndustryProjection(
      'client-1',
      deps({
        readOrganizationNaics: async () => ({ success: true, naicsCode: '722511' }),
        readNaicsTitle: async () => 'Full-Service Restaurants',
      }),
    );
    expect(r).toMatchObject({ kind: 'no-mapping', naicsCode: '722511', naicsTitle: 'Full-Service Restaurants', sectorCode: '72' });
  });

  it('is no-crm-link when the deal has no client relationship', async () => {
    expect((await loadDealIndustryProjection(undefined, deps())).kind).toBe('no-crm-link');
    expect((await loadDealIndustryProjection('   ', deps())).kind).toBe('no-crm-link');
  });

  it('is no-org-link when the client relationship is not linked to an org (unbridged / contact-only)', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readClientOrganizationId: async () => ({ success: true, organizationId: undefined }) }));
    expect(r.kind).toBe('no-org-link');
  });

  it('is no-naics when the organization has no NAICS code', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readOrganizationNaics: async () => ({ success: true, naicsCode: '' }) }));
    expect(r.kind).toBe('no-naics');
  });

  it('is no-sector when the NAICS code is invalid / unknown', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readOrganizationNaics: async () => ({ success: true, naicsCode: '999999' }) }));
    expect(r).toMatchObject({ kind: 'no-sector', naicsCode: '999999' });
  });

  it('is no-mapping when the sector has no active mapping (honest blocked)', async () => {
    // 44-45 Retail is not in MAP_ROWS.
    const r = await loadDealIndustryProjection('client-1', deps({ readOrganizationNaics: async () => ({ success: true, naicsCode: '445110' }) }));
    expect(r).toMatchObject({ kind: 'no-mapping', sectorCode: '44-45', naicsCode: '445110' });
  });

  it('is unavailable when the client read fails', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readClientOrganizationId: async () => ({ success: false, error: 'no column' }) }));
    expect(r.kind).toBe('unavailable');
  });

  it('is unavailable when the organization read throws', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ readOrganizationNaics: async () => { throw new Error('boom'); } }));
    expect(r.kind).toBe('unavailable');
  });

  it('is unavailable when the mapping read fails (table not deployed)', async () => {
    const r = await loadDealIndustryProjection('client-1', deps({ fetchMappingRows: async () => ({ success: false, error: 'data source not found' }) }));
    expect(r.kind).toBe('unavailable');
  });
});

describe('buildLiveDealIndustryProjectionDeps — fetchMappingRows (Factory Arc Phase 8)', () => {
  it('reads cr664_naicsindustrymaps via the real generated service and maps rows', async () => {
    vi.mocked(Cr664_naicsindustrymapsService.getAll).mockResolvedValue({
      success: true,
      data: [
        { cr664_sectorcode: '31-33', cr664_dealindustry: 'Manufacturing', cr664_activeflag: true },
        { cr664_sectorcode: '62', cr664_dealindustry: 'Healthcare', cr664_activeflag: false },
      ],
    } as never);

    const result = await buildLiveDealIndustryProjectionDeps().fetchMappingRows();
    expect(result.success).toBe(true);
    expect(result.rows).toEqual([
      { sectorCode: '31-33', dealIndustry: 'Manufacturing', active: true },
      { sectorCode: '62', dealIndustry: 'Healthcare', active: false },
    ]);
    expect(Cr664_naicsindustrymapsService.getAll).toHaveBeenCalledWith({
      select: ['cr664_sectorcode', 'cr664_dealindustry', 'cr664_activeflag'],
      top: 200,
    });
  });

  it('surfaces a failed read honestly (never fabricates rows)', async () => {
    vi.mocked(Cr664_naicsindustrymapsService.getAll).mockResolvedValue({
      success: false,
      error: { message: 'data source not found' },
    } as never);
    const result = await buildLiveDealIndustryProjectionDeps().fetchMappingRows();
    expect(result.success).toBe(false);
    expect(result.error).toBe('data source not found');
  });
});

describe('buildLiveDealIndustryProjectionDeps — readNaicsTitle (N-22/N-23 remediation)', () => {
  it('is a callable dep that resolves to undefined or a string, never throws, for a code the reference table does not have', async () => {
    const title = await buildLiveDealIndustryProjectionDeps().readNaicsTitle('000000');
    expect(title === undefined || typeof title === 'string').toBe(true);
  });
});

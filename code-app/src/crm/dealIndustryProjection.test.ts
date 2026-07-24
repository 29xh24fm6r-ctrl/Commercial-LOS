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
    ...over,
  };
}

describe('loadDealIndustryProjection', () => {
  it('derives the mapped industry through the full governed path', async () => {
    const r = await loadDealIndustryProjection('client-1', deps());
    expect(r).toMatchObject({ kind: 'derived', dealIndustry: 'Manufacturing', naicsCode: '333111', sectorCode: '31-33' });
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

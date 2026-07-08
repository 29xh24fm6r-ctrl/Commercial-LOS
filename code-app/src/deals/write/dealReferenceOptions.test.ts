import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadDealReferenceOptions,
  DEAL_REFERENCE_LOOKUPS,
  buildLiveDealReferenceOptionsDeps,
  type DealReferenceOptionsDeps,
  type DealReferenceRow,
} from './dealReferenceOptions';

/**
 * Read-only deal reference-lookup loaders.
 *
 * Pins: real rows only (no local enum / free text), active-only filtering,
 * honest `unavailable` when the datasource read fails, and honest `empty` when
 * the registered table has no active rows.
 */

function deps(over: Partial<DealReferenceOptionsDeps> = {}): DealReferenceOptionsDeps {
  return {
    fetchReferenceRows: async () => ({ success: true, rows: [] }),
    ...over,
  };
}

const ROWS: DealReferenceRow[] = [
  { cr664_producttypereferenceid: 'r-term', cr664_name: 'Term Loan', cr664_code: 'TERM_LOAN', cr664_sortorder: 2, cr664_activeflag: true, statecode: 0 },
  { cr664_producttypereferenceid: 'r-sba', cr664_name: 'SBA 7(a)', cr664_code: 'SBA_7A', cr664_sortorder: 1, cr664_activeflag: true, statecode: 0 },
  // Inactive rows must be excluded.
  { cr664_producttypereferenceid: 'r-old', cr664_name: 'Retired Product', cr664_code: 'OLD', cr664_activeflag: false, statecode: 1 },
];

describe('loadDealReferenceOptions', () => {
  it('returns active rows as options, sorted by sort order (real rows only)', async () => {
    const r = await loadDealReferenceOptions(deps({ fetchReferenceRows: async () => ({ success: true, rows: ROWS }) }));
    expect(r.kind).toBe('ready');
    if (r.kind === 'ready') {
      expect(r.options.map((o) => o.id)).toEqual(['r-sba', 'r-term']); // sorted by sortOrder
      expect(r.options[0]).toMatchObject({ id: 'r-sba', name: 'SBA 7(a)', code: 'SBA_7A', active: true });
      // The retired/inactive row is excluded.
      expect(r.options.find((o) => o.id === 'r-old')).toBeUndefined();
    }
  });

  it('returns "empty" (honest) when the table is registered but has no active rows', async () => {
    const r = await loadDealReferenceOptions(deps({
      fetchReferenceRows: async () => ({ success: true, rows: [{ cr664_producttypereferenceid: 'x', cr664_name: 'Inactive', cr664_activeflag: false, statecode: 1 }] }),
    }));
    expect(r.kind).toBe('empty');
    if (r.kind === 'empty') expect(r.reason).toMatch(/No active product\/loan\/pricing reference rows/i);
  });

  it('returns "empty" for a completely empty table', async () => {
    const r = await loadDealReferenceOptions(deps({ fetchReferenceRows: async () => ({ success: true, rows: [] }) }));
    expect(r.kind).toBe('empty');
  });

  it('returns "unavailable" with the exact reason when the datasource read fails', async () => {
    const r = await loadDealReferenceOptions(deps({
      fetchReferenceRows: async () => ({ success: false, error: 'Unable to find data source: cr664_producttypereferences.' }),
    }));
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') {
      expect(r.reason).toMatch(/could not be loaded/i);
      expect(r.reason).toMatch(/cr664_producttypereferences/);
    }
  });

  it('returns "unavailable" when the fetch throws', async () => {
    const r = await loadDealReferenceOptions(deps({
      fetchReferenceRows: async () => { throw new Error('boom'); },
    }));
    expect(r.kind).toBe('unavailable');
  });
});

describe('DEAL_REFERENCE_LOOKUPS — bindings target the shared reference table', () => {
  it('maps each field to its lookup bind property + readback value + shared table', () => {
    expect(DEAL_REFERENCE_LOOKUPS.productType).toMatchObject({
      bindProperty: 'cr664_ProductTypeReference@odata.bind',
      targetTable: 'cr664_producttypereferences',
      readbackValueField: '_cr664_producttypereference_value',
    });
    expect(DEAL_REFERENCE_LOOKUPS.loanStructure.bindProperty).toBe('cr664_LoanStructureTypeReference@odata.bind');
    expect(DEAL_REFERENCE_LOOKUPS.loanStructure.readbackValueField).toBe('_cr664_loanstructuretypereference_value');
    expect(DEAL_REFERENCE_LOOKUPS.pricingType.bindProperty).toBe('cr664_PricingTypeReference@odata.bind');
    expect(DEAL_REFERENCE_LOOKUPS.pricingType.readbackValueField).toBe('_cr664_pricingtypereference_value');
    // All three share the one registered reference table.
    for (const f of ['productType', 'loanStructure', 'pricingType'] as const) {
      expect(DEAL_REFERENCE_LOOKUPS[f].targetTable).toBe('cr664_producttypereferences');
    }
  });

  it('the live loader binds to the registered cr664_producttypereferences service (no local enum)', () => {
    const src = readFileSync(resolve(__dirname, 'dealReferenceOptions.ts'), 'utf8');
    expect(src).toContain('Cr664_producttypereferencesService');
    // No hard-coded product/loan/pricing values anywhere in the loader.
    expect(src).not.toMatch(/SBA 7|Term Loan|Variable|Fixed/);
    expect(typeof buildLiveDealReferenceOptionsDeps().fetchReferenceRows).toBe('function');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadDealReferenceOptionsByCategory,
  DEAL_REFERENCE_LOOKUPS,
  buildLiveDealReferenceOptionsDeps,
  type DealReferenceOptionsDeps,
  type DealReferenceRow,
} from './dealReferenceOptions';
import { DEAL_REFERENCE_CATEGORY_OPTION } from '../../shared/governance/dealReferenceCategories';

/**
 * Category-scoped deal reference-lookup loader.
 *
 * Pins: real rows only (no local enum / free text), active-only filtering,
 * per-category partition (a row only appears under its own field), honest
 * `unavailable` when the read fails, and honest `empty` when a category has no
 * active rows.
 */

function deps(over: Partial<DealReferenceOptionsDeps> = {}): DealReferenceOptionsDeps {
  return {
    fetchReferenceRows: async () => ({ success: true, rows: [] }),
    ...over,
  };
}

const PT = DEAL_REFERENCE_CATEGORY_OPTION.productType;
const LS = DEAL_REFERENCE_CATEGORY_OPTION.loanStructure;
const PR = DEAL_REFERENCE_CATEGORY_OPTION.pricingType;

const ROWS: DealReferenceRow[] = [
  { cr664_producttypereferenceid: 'pt-term', cr664_name: 'Term Loan', cr664_code: 'TERM_LOAN', cr664_sortorder: 2, cr664_activeflag: true, statecode: 0, cr664_category: PT },
  { cr664_producttypereferenceid: 'pt-sba', cr664_name: 'SBA 7(a)', cr664_code: 'SBA_7A', cr664_sortorder: 1, cr664_activeflag: true, statecode: 0, cr664_category: PT },
  { cr664_producttypereferenceid: 'ls-rev', cr664_name: 'Revolving line of credit', cr664_code: 'REVOLVING_LOC', cr664_sortorder: 1, cr664_activeflag: true, statecode: 0, cr664_category: LS },
  // Inactive rows must be excluded.
  { cr664_producttypereferenceid: 'pt-old', cr664_name: 'Retired Product', cr664_code: 'OLD', cr664_activeflag: false, statecode: 1, cr664_category: PT },
  // Un-categorized rows must NOT appear under any field.
  { cr664_producttypereferenceid: 'uncat', cr664_name: 'Legacy', cr664_code: 'LEGACY', cr664_activeflag: true, statecode: 0 },
];

describe('loadDealReferenceOptionsByCategory', () => {
  it('partitions active rows by category and never mixes lists', async () => {
    const r = await loadDealReferenceOptionsByCategory(deps({ fetchReferenceRows: async () => ({ success: true, rows: ROWS }) }));

    expect(r.productType.kind).toBe('ready');
    if (r.productType.kind === 'ready') {
      // Sorted by sortOrder; the loan-structure + uncategorized + inactive rows are absent.
      expect(r.productType.options.map((o) => o.id)).toEqual(['pt-sba', 'pt-term']);
      expect(r.productType.options.find((o) => o.id === 'ls-rev')).toBeUndefined();
      expect(r.productType.options.find((o) => o.id === 'uncat')).toBeUndefined();
      expect(r.productType.options.find((o) => o.id === 'pt-old')).toBeUndefined();
    }

    expect(r.loanStructure.kind).toBe('ready');
    if (r.loanStructure.kind === 'ready') {
      expect(r.loanStructure.options.map((o) => o.id)).toEqual(['ls-rev']);
    }

    // No pricing-type rows in the fixture → honest empty for that field only.
    expect(r.pricingType.kind).toBe('empty');
    if (r.pricingType.kind === 'empty') expect(r.pricingType.reason).toMatch(/Pricing type/i);
  });

  it('returns "empty" per field with no active categorized rows', async () => {
    const r = await loadDealReferenceOptionsByCategory(deps({ fetchReferenceRows: async () => ({ success: true, rows: [] }) }));
    expect(r.productType.kind).toBe('empty');
    expect(r.loanStructure.kind).toBe('empty');
    expect(r.pricingType.kind).toBe('empty');
  });

  it('un-categorized rows never leak into a field (all empty)', async () => {
    const r = await loadDealReferenceOptionsByCategory(deps({
      fetchReferenceRows: async () => ({ success: true, rows: [{ cr664_producttypereferenceid: 'x', cr664_name: 'No Cat', cr664_code: 'NC', cr664_activeflag: true, statecode: 0 }] }),
    }));
    expect(r.productType.kind).toBe('empty');
    expect(r.loanStructure.kind).toBe('empty');
    expect(r.pricingType.kind).toBe('empty');
  });

  it('returns "unavailable" for all three fields when the datasource read fails', async () => {
    const r = await loadDealReferenceOptionsByCategory(deps({
      fetchReferenceRows: async () => ({ success: false, error: 'Unable to find data source: cr664_producttypereferences.' }),
    }));
    for (const f of ['productType', 'loanStructure', 'pricingType'] as const) {
      expect(r[f].kind).toBe('unavailable');
      if (r[f].kind === 'unavailable') {
        expect((r[f] as { reason: string }).reason).toMatch(/could not be loaded/i);
        expect((r[f] as { reason: string }).reason).toMatch(/cr664_producttypereferences/);
      }
    }
  });

  it('returns "unavailable" when the fetch throws', async () => {
    const r = await loadDealReferenceOptionsByCategory(deps({
      fetchReferenceRows: async () => { throw new Error('boom'); },
    }));
    expect(r.productType.kind).toBe('unavailable');
    expect(r.loanStructure.kind).toBe('unavailable');
    expect(r.pricingType.kind).toBe('unavailable');
  });
});

describe('DEAL_REFERENCE_LOOKUPS — bindings + category scoping', () => {
  it('maps each field to its lookup bind property + readback value + shared table + category value', () => {
    expect(DEAL_REFERENCE_LOOKUPS.productType).toMatchObject({
      bindProperty: 'cr664_ProductTypeReference@odata.bind',
      targetTable: 'cr664_producttypereferences',
      readbackValueField: '_cr664_producttypereference_value',
      categoryValue: PT,
    });
    expect(DEAL_REFERENCE_LOOKUPS.loanStructure).toMatchObject({
      bindProperty: 'cr664_LoanStructureTypeReference@odata.bind',
      readbackValueField: '_cr664_loanstructuretypereference_value',
      categoryValue: LS,
    });
    expect(DEAL_REFERENCE_LOOKUPS.pricingType).toMatchObject({
      bindProperty: 'cr664_PricingTypeReference@odata.bind',
      readbackValueField: '_cr664_pricingtypereference_value',
      categoryValue: PR,
    });
    // All three share the one registered reference table.
    for (const f of ['productType', 'loanStructure', 'pricingType'] as const) {
      expect(DEAL_REFERENCE_LOOKUPS[f].targetTable).toBe('cr664_producttypereferences');
    }
  });

  it('the live loader binds to the registered service + selects the category column (no local enum)', () => {
    const src = readFileSync(resolve(__dirname, 'dealReferenceOptions.ts'), 'utf8');
    expect(src).toContain('Cr664_producttypereferencesService');
    expect(src).toContain('DEAL_REFERENCE_CATEGORY_COLUMN');
    // No hard-coded product/loan/pricing values anywhere in the loader.
    expect(src).not.toMatch(/SBA 7|Term Loan|Variable|Fixed/);
    expect(typeof buildLiveDealReferenceOptionsDeps().fetchReferenceRows).toBe('function');
  });
});

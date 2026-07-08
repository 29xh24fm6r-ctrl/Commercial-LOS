import { describe, it, expect } from 'vitest';
import {
  loadDealReferenceAdminRows,
  type DealReferenceAdminQueriesDeps,
  type DealReferenceAdminFetchRow,
} from './dealReferenceAdminQueries';
import { DEAL_REFERENCE_CATEGORY_OPTION } from '../shared/governance/dealReferenceCategories';

const PT = DEAL_REFERENCE_CATEGORY_OPTION.productType;
const LS = DEAL_REFERENCE_CATEGORY_OPTION.loanStructure;

function deps(rows: DealReferenceAdminFetchRow[], ok = true): DealReferenceAdminQueriesDeps {
  return { fetchAllRows: async () => (ok ? { success: true, rows } : { success: false, error: 'boom' }) };
}

describe('loadDealReferenceAdminRows', () => {
  it('groups active + inactive rows by category and surfaces uncategorized rows', async () => {
    const r = await loadDealReferenceAdminRows(
      deps([
        { cr664_producttypereferenceid: 'pt1', cr664_name: 'Equipment', cr664_code: 'EQUIP', cr664_activeflag: true, cr664_sortorder: 10, cr664_category: PT },
        { cr664_producttypereferenceid: 'pt2', cr664_name: 'Retired', cr664_code: 'OLD', cr664_activeflag: false, cr664_category: PT },
        { cr664_producttypereferenceid: 'ls1', cr664_name: 'Revolver', cr664_code: 'REV', cr664_activeflag: true, cr664_category: LS },
        { cr664_producttypereferenceid: 'u1', cr664_name: 'Legacy', cr664_code: 'LEG', cr664_activeflag: true },
      ]),
    );
    expect(r.kind).toBe('ready');
    if (r.kind !== 'ready') return;
    // Product type has both rows, active sorted before inactive.
    expect(r.data.byCategory.productType.map((x) => x.id)).toEqual(['pt1', 'pt2']);
    expect(r.data.byCategory.productType[0].active).toBe(true);
    expect(r.data.byCategory.productType[1].active).toBe(false);
    expect(r.data.byCategory.loanStructure.map((x) => x.id)).toEqual(['ls1']);
    expect(r.data.byCategory.pricingType).toEqual([]);
    // Uncategorized legacy row is surfaced, not silently dropped.
    expect(r.data.uncategorized.map((x) => x.id)).toEqual(['u1']);
  });

  it('is honest (unavailable) when the read fails', async () => {
    const r = await loadDealReferenceAdminRows(deps([], false));
    expect(r.kind).toBe('unavailable');
    if (r.kind === 'unavailable') expect(r.reason).toMatch(/could not be loaded/i);
  });

  it('is unavailable when the fetch throws', async () => {
    const r = await loadDealReferenceAdminRows({ fetchAllRows: async () => { throw new Error('x'); } });
    expect(r.kind).toBe('unavailable');
  });
});

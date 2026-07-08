/**
 * Read-only loaders for the Loan Deal reference-lookup lists.
 *
 * The deal's Product Type / Loan Structure / Pricing Type are Dataverse LOOKUPS.
 * Per the Phase 122E / 187E reference audit, all three columns target the SAME
 * reference table `cr664_producttypereference` (entity set
 * `cr664_producttypereferences`; required columns cr664_name, cr664_code,
 * cr664_activeflag; primary id cr664_producttypereferenceid).
 *
 * Phase 4A adds the `cr664_category` CHOICE discriminator so the one table can
 * back three DISTINCT dropdowns: each field loads ONLY the rows whose
 * `cr664_category` matches it (see loadDealReferenceOptionsByCategory). The three
 * lists are no longer the same flat set.
 *
 * Honesty rules (no fabrication):
 *   - Options come ONLY from real, registered Dataverse rows — never a local
 *     enum, never free text.
 *   - Active rows only (statecode Active + cr664_activeflag true).
 *   - Category-scoped: a row with no / a different `cr664_category` never appears
 *     under a field it does not belong to.
 *   - If the datasource is not registered / not deployed, the read fails and we
 *     return `unavailable` with the exact reason.
 *   - If the table is registered but has no active rows for a category, we return
 *     `empty` with the exact reason. Either way the caller keeps the field
 *     READ-ONLY.
 *
 * Pure over injected deps (SDK-free static graph); a live factory pulls the
 * generated service via dynamic import.
 */

import {
  DEAL_REFERENCE_CATEGORIES,
  DEAL_REFERENCE_CATEGORY_COLUMN,
  optionValueForCategory,
  type DealReferenceCategory,
} from '../../shared/governance/dealReferenceCategories';

/** One selectable reference row. */
export interface DealReferenceOption {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
  readonly sortOrder?: number;
  readonly active: boolean;
}

/**
 * The three deal reference lookup fields. Identical to the shared
 * `DealReferenceCategory` (kept as an alias so existing imports keep working).
 */
export type DealReferenceLookupField = DealReferenceCategory;

export interface DealReferenceLookupConfig {
  /** OData bind property set on the deal update. */
  readonly bindProperty: string;
  /** Target table the lookup binds to (shared reference table). */
  readonly targetTable: string;
  /** `_<lookup>_value` field read back off the deal to prove the link. */
  readonly readbackValueField: string;
  readonly label: string;
  /** The `cr664_category` option value that scopes this field's rows. */
  readonly categoryValue: number;
}

/** The three deal reference lookups (all target the shared reference table). */
export const DEAL_REFERENCE_LOOKUPS: Readonly<Record<DealReferenceLookupField, DealReferenceLookupConfig>> = {
  productType: {
    bindProperty: 'cr664_ProductTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_producttypereference_value',
    label: 'Product type',
    categoryValue: optionValueForCategory('productType'),
  },
  loanStructure: {
    bindProperty: 'cr664_LoanStructureTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_loanstructuretypereference_value',
    label: 'Loan structure',
    categoryValue: optionValueForCategory('loanStructure'),
  },
  pricingType: {
    bindProperty: 'cr664_PricingTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_pricingtypereference_value',
    label: 'Pricing type',
    categoryValue: optionValueForCategory('pricingType'),
  },
};

export type DealReferenceOptionsResult =
  | { kind: 'ready'; options: readonly DealReferenceOption[] }
  | { kind: 'empty'; reason: string }
  | { kind: 'unavailable'; reason: string };

/** Raw reference row (subset of Cr664_producttypereferences we read). */
export interface DealReferenceRow {
  readonly cr664_producttypereferenceid?: string;
  readonly cr664_name?: string;
  readonly cr664_code?: string;
  readonly cr664_sortorder?: number;
  readonly cr664_sequence?: number;
  readonly cr664_activeflag?: boolean;
  /** The Phase 4A CHOICE discriminator (read via this local interface — the
   * generated model gains it on the next SDK regen). */
  readonly cr664_category?: number;
  readonly statecode?: number;
}

/** A per-category result map — one entry per deal reference field. */
export type DealReferenceOptionsByCategory = Readonly<Record<DealReferenceLookupField, DealReferenceOptionsResult>>;

export interface DealReferenceOptionsDeps {
  readonly fetchReferenceRows: () => Promise<{ success: boolean; rows?: readonly DealReferenceRow[]; error?: string }>;
}

const UNAVAILABLE_REASON =
  'The product/loan/pricing reference list could not be loaded. The cr664_producttypereferences ' +
  'datasource may not be registered or deployed in this environment.';

function emptyReason(field: DealReferenceLookupField): string {
  return (
    `No active ${DEAL_REFERENCE_LOOKUPS[field].label} reference values exist yet. Add them in ` +
    `Admin → Deal Reference Values (or run the approved seed) before this field can be completed.`
  );
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Map + sort the active rows for one category into selectable options. */
function optionsForCategory(
  rows: readonly DealReferenceRow[],
  field: DealReferenceLookupField,
): DealReferenceOption[] {
  const categoryValue = DEAL_REFERENCE_LOOKUPS[field].categoryValue;
  return rows
    // Active rows only — statecode Active(0) AND cr664_activeflag true.
    .filter((r) => r.statecode === undefined || r.statecode === 0)
    .filter((r) => r.cr664_activeflag !== false)
    // Category-scoped: only this field's rows (never an un-/mis-categorized row).
    .filter((r) => r.cr664_category === categoryValue)
    .map((r): DealReferenceOption | null => {
      const id = firstString(r.cr664_producttypereferenceid);
      const name = firstString(r.cr664_name);
      if (!id || !name) return null;
      return {
        id,
        name,
        code: firstString(r.cr664_code),
        sortOrder: typeof r.cr664_sortorder === 'number' ? r.cr664_sortorder : r.cr664_sequence,
        active: true,
      };
    })
    .filter((o): o is DealReferenceOption => o !== null)
    .sort((a, b) => {
      const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Load the active reference options for EACH category in a single fetch. Pure
 * over the injected fetch dep. A fetch failure returns `unavailable` for all
 * three fields; a category with no active rows returns `empty` for that field.
 */
export async function loadDealReferenceOptionsByCategory(
  deps: DealReferenceOptionsDeps,
): Promise<DealReferenceOptionsByCategory> {
  let res: { success: boolean; rows?: readonly DealReferenceRow[]; error?: string };
  try {
    res = await deps.fetchReferenceRows();
  } catch (err: unknown) {
    return allFields({ kind: 'unavailable', reason: `${UNAVAILABLE_REASON} (${err instanceof Error ? err.message : String(err)})` });
  }
  if (!res.success) {
    return allFields({ kind: 'unavailable', reason: `${UNAVAILABLE_REASON}${res.error ? ` (${res.error})` : ''}` });
  }
  const rows = res.rows ?? [];
  const out = {} as Record<DealReferenceLookupField, DealReferenceOptionsResult>;
  for (const field of DEAL_REFERENCE_CATEGORIES) {
    const options = optionsForCategory(rows, field);
    out[field] = options.length === 0 ? { kind: 'empty', reason: emptyReason(field) } : { kind: 'ready', options };
  }
  return out;
}

/** Same result for every field (used when the whole fetch failed). */
function allFields(result: DealReferenceOptionsResult): DealReferenceOptionsByCategory {
  const out = {} as Record<DealReferenceLookupField, DealReferenceOptionsResult>;
  for (const field of DEAL_REFERENCE_CATEGORIES) out[field] = result;
  return out;
}

// ---------------------------------------------------------------------------
// Live dependency factory (dynamic import keeps the SDK out of the static graph)
// ---------------------------------------------------------------------------

const OPTION_CAP = 200;

export function buildLiveDealReferenceOptionsDeps(): DealReferenceOptionsDeps {
  return {
    fetchReferenceRows: async () => {
      try {
        const { Cr664_producttypereferencesService: s } = await import(
          '../../generated/services/Cr664_producttypereferencesService'
        );
        const r = await s.getAll({
          select: [
            'cr664_producttypereferenceid',
            'cr664_name',
            'cr664_code',
            'cr664_sortorder',
            'cr664_activeflag',
            DEAL_REFERENCE_CATEGORY_COLUMN,
          ],
          top: OPTION_CAP,
        });
        return {
          success: r.success,
          rows: (r.data ?? undefined) as unknown as readonly DealReferenceRow[] | undefined,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/**
 * Convenience: load the active options for all three fields in one fetch,
 * partitioned by `cr664_category`. This is what the Deal Profile modal uses.
 */
export function loadLiveDealReferenceOptionsByCategory(): Promise<DealReferenceOptionsByCategory> {
  return loadDealReferenceOptionsByCategory(buildLiveDealReferenceOptionsDeps());
}

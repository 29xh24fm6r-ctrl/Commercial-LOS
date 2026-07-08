/**
 * Read-only loaders for the Loan Deal reference-lookup lists.
 *
 * The deal's Product Type / Loan Structure / Pricing Type are Dataverse LOOKUPS.
 * Per the Phase 122E / 187E reference audit, all three columns target the SAME
 * reference table `cr664_producttypereference` (entity set
 * `cr664_producttypereferences`; required columns cr664_name, cr664_code,
 * cr664_activeflag; primary id cr664_producttypereferenceid). So one loader
 * serves all three fields.
 *
 * Honesty rules (no fabrication):
 *   - Options come ONLY from real, registered Dataverse rows — never a local
 *     enum, never free text.
 *   - Active rows only (statecode Active + cr664_activeflag true).
 *   - If the datasource is not registered / not deployed, the read fails and we
 *     return `unavailable` with the exact reason.
 *   - If the table is registered but has no active rows, we return `empty` with
 *     the exact reason. Either way the caller keeps the field READ-ONLY.
 *
 * Pure over injected deps (SDK-free static graph); a live factory pulls the
 * generated service via dynamic import.
 */

/** One selectable reference row. */
export interface DealReferenceOption {
  readonly id: string;
  readonly name: string;
  readonly code?: string;
  readonly sortOrder?: number;
  readonly active: boolean;
}

export type DealReferenceLookupField = 'productType' | 'loanStructure' | 'pricingType';

export interface DealReferenceLookupConfig {
  /** OData bind property set on the deal update. */
  readonly bindProperty: string;
  /** Target table the lookup binds to (shared reference table). */
  readonly targetTable: string;
  /** `_<lookup>_value` field read back off the deal to prove the link. */
  readonly readbackValueField: string;
  readonly label: string;
}

/** The three deal reference lookups (all target the shared reference table). */
export const DEAL_REFERENCE_LOOKUPS: Readonly<Record<DealReferenceLookupField, DealReferenceLookupConfig>> = {
  productType: {
    bindProperty: 'cr664_ProductTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_producttypereference_value',
    label: 'Product type',
  },
  loanStructure: {
    bindProperty: 'cr664_LoanStructureTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_loanstructuretypereference_value',
    label: 'Loan structure',
  },
  pricingType: {
    bindProperty: 'cr664_PricingTypeReference@odata.bind',
    targetTable: 'cr664_producttypereferences',
    readbackValueField: '_cr664_pricingtypereference_value',
    label: 'Pricing type',
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
  readonly statecode?: number;
}

export interface DealReferenceOptionsDeps {
  readonly fetchReferenceRows: () => Promise<{ success: boolean; rows?: readonly DealReferenceRow[]; error?: string }>;
}

const UNAVAILABLE_REASON =
  'The product/loan/pricing reference list could not be loaded. The cr664_producttypereferences ' +
  'datasource may not be registered or deployed in this environment.';
const EMPTY_REASON =
  'No active product/loan/pricing reference rows exist yet. Seed them via the approved reference ' +
  'seed before these fields can be completed.';

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Load the shared reference option list. Pure given its injected fetch dep. */
export async function loadDealReferenceOptions(
  deps: DealReferenceOptionsDeps,
): Promise<DealReferenceOptionsResult> {
  let res: { success: boolean; rows?: readonly DealReferenceRow[]; error?: string };
  try {
    res = await deps.fetchReferenceRows();
  } catch (err: unknown) {
    return { kind: 'unavailable', reason: `${UNAVAILABLE_REASON} (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!res.success) {
    return { kind: 'unavailable', reason: `${UNAVAILABLE_REASON}${res.error ? ` (${res.error})` : ''}` };
  }
  const rows = res.rows ?? [];
  const options: DealReferenceOption[] = rows
    // Active rows only — statecode Active(0) AND cr664_activeflag true.
    .filter((r) => r.statecode === undefined || r.statecode === 0)
    .filter((r) => r.cr664_activeflag !== false)
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

  if (options.length === 0) {
    return { kind: 'empty', reason: EMPTY_REASON };
  }
  return { kind: 'ready', options };
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
          select: ['cr664_producttypereferenceid', 'cr664_name', 'cr664_code', 'cr664_sortorder', 'cr664_activeflag'],
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

/** Convenience: load once (all three fields share the same reference table). */
export function loadLiveDealReferenceOptions(): Promise<DealReferenceOptionsResult> {
  return loadDealReferenceOptions(buildLiveDealReferenceOptionsDeps());
}

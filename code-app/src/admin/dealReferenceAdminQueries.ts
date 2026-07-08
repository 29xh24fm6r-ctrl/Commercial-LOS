/**
 * Phase 4A — admin read loader for Deal Reference values.
 *
 * Lists EVERY row (active + inactive) in cr664_producttypereference, grouped by
 * the cr664_category CHOICE discriminator, so the Admin → Deal Reference Values
 * panel can show each category's values, offer an inactive toggle, and drive the
 * governed writes (dealReferenceValueWrite). Pure over an injected fetch; a live
 * factory pulls the generated service via dynamic import (SDK-free static graph).
 *
 * Honest: un-categorized legacy rows (no cr664_category) are surfaced in their
 * own bucket so an admin can see them — they never silently vanish, and they
 * never appear under a real category.
 */

import {
  DEAL_REFERENCE_CATEGORIES,
  DEAL_REFERENCE_CATEGORY_COLUMN,
  categoryForOptionValue,
  type DealReferenceCategory,
} from '../shared/governance/dealReferenceCategories';
import type { DealReferenceAdminRow } from './dealReferenceValueWrite';

export interface DealReferenceAdminData {
  /** Rows for each of the three known categories (sorted by sortOrder, name). */
  readonly byCategory: Readonly<Record<DealReferenceCategory, readonly DealReferenceAdminRow[]>>;
  /** Legacy rows with no / an unrecognized cr664_category. */
  readonly uncategorized: readonly DealReferenceAdminRow[];
}

export type DealReferenceAdminResult =
  | { kind: 'ready'; data: DealReferenceAdminData }
  | { kind: 'unavailable'; reason: string };

export interface DealReferenceAdminFetchRow {
  readonly cr664_producttypereferenceid?: string;
  readonly cr664_name?: string;
  readonly cr664_code?: string;
  readonly cr664_activeflag?: boolean;
  readonly cr664_sortorder?: number;
  readonly cr664_category?: number;
}

export interface DealReferenceAdminQueriesDeps {
  readonly fetchAllRows: () => Promise<{ success: boolean; rows?: readonly DealReferenceAdminFetchRow[]; error?: string }>;
}

const UNAVAILABLE_REASON =
  'The deal reference values could not be loaded. The cr664_producttypereferences datasource ' +
  'may not be registered, or the cr664_category column may not be added yet (see ' +
  'docs/DEAL_REFERENCE_VALUES_SETUP.md).';

function mapRow(raw: DealReferenceAdminFetchRow): DealReferenceAdminRow {
  const categoryValue = typeof raw.cr664_category === 'number' ? raw.cr664_category : undefined;
  return {
    id: raw.cr664_producttypereferenceid ?? '',
    name: typeof raw.cr664_name === 'string' ? raw.cr664_name : '',
    code: typeof raw.cr664_code === 'string' ? raw.cr664_code : '',
    category: categoryForOptionValue(categoryValue),
    categoryValue,
    active: raw.cr664_activeflag !== false,
    sortOrder: typeof raw.cr664_sortorder === 'number' ? raw.cr664_sortorder : undefined,
  };
}

function sortRows(rows: DealReferenceAdminRow[]): DealReferenceAdminRow[] {
  return rows.sort((a, b) => {
    // Active first, then by sort order, then name.
    if (a.active !== b.active) return a.active ? -1 : 1;
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.name.localeCompare(b.name);
  });
}

/** Load + group every reference row. Pure over the injected fetch dep. */
export async function loadDealReferenceAdminRows(
  deps: DealReferenceAdminQueriesDeps,
): Promise<DealReferenceAdminResult> {
  let res: { success: boolean; rows?: readonly DealReferenceAdminFetchRow[]; error?: string };
  try {
    res = await deps.fetchAllRows();
  } catch (err: unknown) {
    return { kind: 'unavailable', reason: `${UNAVAILABLE_REASON} (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!res.success) {
    return { kind: 'unavailable', reason: `${UNAVAILABLE_REASON}${res.error ? ` (${res.error})` : ''}` };
  }

  const buckets = {} as Record<DealReferenceCategory, DealReferenceAdminRow[]>;
  for (const c of DEAL_REFERENCE_CATEGORIES) buckets[c] = [];
  const uncategorized: DealReferenceAdminRow[] = [];

  for (const raw of res.rows ?? []) {
    const row = mapRow(raw);
    if (!row.id) continue;
    if (row.category) buckets[row.category].push(row);
    else uncategorized.push(row);
  }

  const byCategory = {} as Record<DealReferenceCategory, readonly DealReferenceAdminRow[]>;
  for (const c of DEAL_REFERENCE_CATEGORIES) byCategory[c] = sortRows(buckets[c]);

  return { kind: 'ready', data: { byCategory, uncategorized: sortRows(uncategorized) } };
}

// ---------------------------------------------------------------------------
// Live dependency factory (dynamic import keeps the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveDealReferenceAdminQueriesDeps(): DealReferenceAdminQueriesDeps {
  return {
    fetchAllRows: async () => {
      try {
        const { Cr664_producttypereferencesService: s } = await import(
          '../generated/services/Cr664_producttypereferencesService'
        );
        const r = await s.getAll({
          select: [
            'cr664_producttypereferenceid',
            'cr664_name',
            'cr664_code',
            'cr664_activeflag',
            'cr664_sortorder',
            DEAL_REFERENCE_CATEGORY_COLUMN,
          ],
          top: 500,
        });
        return {
          success: r.success,
          rows: (r.data ?? undefined) as unknown as readonly DealReferenceAdminFetchRow[] | undefined,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function loadLiveDealReferenceAdminRows(): Promise<DealReferenceAdminResult> {
  return loadDealReferenceAdminRows(buildLiveDealReferenceAdminQueriesDeps());
}

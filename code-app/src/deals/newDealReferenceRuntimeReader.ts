/**
 * BUGFIX (banker create runtime resolver) -- hand-written runtime reader for the
 * two Stage/Status reference tables.
 *
 * Reads `cr664_dealstagereferences` / `cr664_dealstatusreferences` directly
 * through the Power Apps data client by data-source NAME, independent of the
 * generated typed service classes. This is the spec's preferred reader: it makes
 * the production resolver's runtime dependency explicit and self-contained, so a
 * missing/regenerated typed service never blocks banker create. It reads
 * read-only (least-privilege `select`), maps rows to `ReferenceRow`, and throws
 * on a non-success result so the fail-closed resolver maps it to `serviceError`.
 * It NEVER writes, NEVER selects by GUID, and resolves nothing on its own.
 */

import type { NewDealReferenceReader, ReferenceRow } from './newDealReferenceResolver';
import { STAGE_REFERENCE, STATUS_REFERENCE } from './newDealReferenceTargets';

const STAGE_DATA_SOURCE = STAGE_REFERENCE.entitySetName; // cr664_dealstagereferences
const STATUS_DATA_SOURCE = STATUS_REFERENCE.entitySetName; // cr664_dealstatusreferences
// Phase 226 — `new_productionapproved` is the governed production-approval marker.
const STAGE_SELECT = [STAGE_REFERENCE.primaryId, 'cr664_name', 'cr664_code', 'cr664_activeflag', 'new_productionapproved'];
const STATUS_SELECT = [STATUS_REFERENCE.primaryId, 'cr664_name', 'cr664_code', 'cr664_activeflag', 'new_productionapproved'];

interface RawReferenceRow {
  cr664_name?: string;
  cr664_code?: string;
  cr664_activeflag?: boolean;
  new_productionapproved?: boolean;
  [key: string]: unknown;
}

/** Result shape of a least-privilege read of one reference table. */
export interface RetrieveResult {
  readonly success: boolean;
  readonly data?: readonly RawReferenceRow[];
  readonly error?: { readonly message?: string };
}

/** Injected read function -- (dataSourceName, select) -> rows. */
export type RetrieveMultiple = (
  dataSourceName: string,
  select: readonly string[],
) => Promise<RetrieveResult>;

function mapRow(idAttr: string, r: RawReferenceRow): ReferenceRow {
  return {
    id: String((r as Record<string, unknown>)[idAttr] ?? ''),
    name: r.cr664_name ?? '',
    code: r.cr664_code ?? '',
    activeFlag: r.cr664_activeflag === true,
    // Phase 226 — production-approved ONLY when the governed marker is exactly true.
    productionApproved: r.new_productionapproved === true,
  };
}

/**
 * Build a reader over an injected `retrieve` function. Pure and SDK-free, so the
 * resolver behaviour is fully unit-testable without the live data client.
 */
export function buildNewDealReferenceRuntimeReader(
  retrieve: RetrieveMultiple,
): NewDealReferenceReader {
  return {
    async readStageReferences(): Promise<readonly ReferenceRow[]> {
      const res = await retrieve(STAGE_DATA_SOURCE, STAGE_SELECT);
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to read Stage references.');
      return (res.data ?? []).map((r) => mapRow(STAGE_REFERENCE.primaryId, r));
    },
    async readStatusReferences(): Promise<readonly ReferenceRow[]> {
      const res = await retrieve(STATUS_DATA_SOURCE, STATUS_SELECT);
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to read Status references.');
      return (res.data ?? []).map((r) => mapRow(STATUS_REFERENCE.primaryId, r));
    },
  };
}

/**
 * Live `retrieve` over the Power Apps data client (by data-source name). The
 * SDK + gitignored data-source manifest are loaded via dynamic import so this
 * module's static graph stays SDK-free (importing the reader never pulls the
 * SDK; only a real read does).
 */
function liveRetrieve(): RetrieveMultiple {
  return async (dataSourceName, select) => {
    const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
      import('@microsoft/power-apps/data'),
      import('../../.power/schemas/appschemas/dataSourcesInfo'),
    ]);
    const client = getClient(dataSourcesInfo);
    const res = await client.retrieveMultipleRecordsAsync<RawReferenceRow>(dataSourceName, {
      select: select as string[],
    });
    return { success: res.success, data: res.data ?? undefined, error: res.error ?? undefined };
  };
}

/** The runtime reader used by the production resolver in the app. */
export function createNewDealReferenceRuntimeReader(): NewDealReferenceReader {
  return buildNewDealReferenceRuntimeReader(liveRetrieve());
}

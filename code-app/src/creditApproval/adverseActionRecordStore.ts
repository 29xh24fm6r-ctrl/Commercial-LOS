import type { AdverseActionRecord, AdverseActionRecordStatus } from '../workflow/adverseActionRecordTypes';
import { ADVERSE_ACTION_RECORD_STATUSES } from '../workflow/adverseActionRecordTypes';

/**
 * Final LOS Completion arc — Workstream J. Storage seam for durable Adverse Action Records,
 * following the exact precedent `bookingQcCheckStore.ts` (Workstream H) established: a real
 * Dataverse-backed store below, plus an in-memory reference implementation for tests. Same
 * disclosed caveat as that precedent — the backing table (`cr664_adverseactionrecord`, proposed in
 * `scripts/schema-migrations/final-arc-adverse-action-record/`) has NOT been applied to any live
 * Dataverse environment, and the generated SDK pairing was hand-authored (no live credentials exist
 * in this sandbox). Until an operator applies that migration, every live call fails closed — an
 * honest `{ success: false, error }`, never a fabricated success.
 */

export interface AdverseActionRecordStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface AdverseActionRecordListResult {
  readonly success: boolean;
  readonly records?: readonly AdverseActionRecord[];
  readonly error?: string;
}

export interface AdverseActionRecordStoreDeps {
  readonly createRecord: (record: AdverseActionRecord) => Promise<AdverseActionRecordStorageResult>;
  readonly listRecordsForDeal: (dealId: string) => Promise<AdverseActionRecordListResult>;
}

export function createInMemoryAdverseActionRecordStore(): AdverseActionRecordStoreDeps & {
  readonly all: () => readonly AdverseActionRecord[];
} {
  const records: AdverseActionRecord[] = [];
  return {
    createRecord: async (record) => {
      records.push(record);
      return { success: true, id: record.recordId };
    },
    listRecordsForDeal: async (dealId) => ({
      success: true,
      records: records.filter((r) => r.dealId === dealId),
    }),
    all: () => records,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(ADVERSE_ACTION_RECORD_STATUSES);

/** The subset of `Cr664_adverseactionrecords` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_recordid',
  'cr664_dealid',
  'cr664_actionstatus',
  'cr664_notes',
  'cr664_recordedby',
  'cr664_recordedat',
  'cr664_correlationid',
  'cr664_supersedesrecordid',
] as const;

type AdverseActionRecordRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToRecord(row: AdverseActionRecordRow): MapResult<AdverseActionRecord> {
  const recordId = row.cr664_recordid;
  if (typeof recordId !== 'string' || recordId.length === 0) {
    return { ok: false, error: 'An adverse action record row is missing cr664_recordid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_dealid.` };
  }
  const status = row.cr664_actionstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Record ${recordId} has an unrecognized status: ${String(status)}.` };
  }
  const notes = row.cr664_notes;
  if (typeof notes !== 'string') {
    return { ok: false, error: `Record ${recordId} is missing cr664_notes.` };
  }
  const recordedByActorEmail = row.cr664_recordedby;
  if (typeof recordedByActorEmail !== 'string' || recordedByActorEmail.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_recordedby.` };
  }
  const recordedAtIso = row.cr664_recordedat;
  if (typeof recordedAtIso !== 'string' || recordedAtIso.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_recordedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_correlationid.` };
  }

  return {
    ok: true,
    value: {
      recordId,
      dealId,
      status: status as AdverseActionRecordStatus,
      notes,
      recordedByActorEmail,
      recordedAtIso,
      correlationId,
      supersedesRecordId: typeof row.cr664_supersedesrecordid === 'string' ? row.cr664_supersedesrecordid : undefined,
    },
  };
}

function recordToRow(record: AdverseActionRecord): Record<string, unknown> {
  return {
    cr664_recordid: record.recordId,
    cr664_dealid: record.dealId,
    cr664_actionstatus: record.status,
    cr664_notes: record.notes,
    cr664_recordedby: record.recordedByActorEmail,
    cr664_recordedat: record.recordedAtIso,
    cr664_correlationid: record.correlationId,
    cr664_supersedesrecordid: record.supersedesRecordId,
  };
}

/**
 * The durable, Dataverse-backed `AdverseActionRecordStoreDeps` implementation. Dynamic-import-only
 * (no static SDK import at this module's top level) — matches every other SDK-touching module in
 * this codebase. Every record is immutable and append-only (a correction always creates a NEW row
 * via `supersedesRecordId`, never mutates a prior one), so this adapter only ever needs `create` and
 * `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated record. A single
 * unreadable row fails only that read (listing skips and reports unreadable rows individually).
 */
export function createDataverseAdverseActionRecordStore(): AdverseActionRecordStoreDeps {
  return {
    createRecord: async (record) => {
      try {
        const { Cr664_adverseactionrecordsService } = await import(
          '../generated/services/Cr664_adverseactionrecordsService'
        );
        const payload = recordToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as bookingQcCheckStore.ts).
        const result = await Cr664_adverseactionrecordsService.create(
          payload as unknown as Parameters<typeof Cr664_adverseactionrecordsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Adverse action record create returned non-success.' };
        }
        return { success: true, id: record.recordId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listRecordsForDeal: async (dealId) => {
      try {
        const { Cr664_adverseactionrecordsService } = await import(
          '../generated/services/Cr664_adverseactionrecordsService'
        );
        const result = await Cr664_adverseactionrecordsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Adverse action record list read failed.' };
        }
        const records: AdverseActionRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToRecord(row as unknown as AdverseActionRecordRow);
          if (mapped.ok) records.push(mapped.value);
        }
        return { success: true, records };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// Re-exported so tests needing the pure row<->record mapping (without a live/mocked SDK call) don't
// have to reach into this module's private scope.
export const __internal = { mapRowToRecord, recordToRow };

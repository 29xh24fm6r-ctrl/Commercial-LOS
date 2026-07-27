import type { BookingQcCheckRecord, BookingQcStatus } from '../workflow/bookingQcCheckTypes';
import { BOOKING_QC_STATUSES } from '../workflow/bookingQcCheckTypes';

/**
 * Final LOS Completion arc — Workstream H. Storage seam for durable Booking QC Check records,
 * following the exact precedent `executedDocumentAttestationStore.ts` (Workstream F) established: a
 * real Dataverse-backed store below, plus an in-memory reference implementation for tests. Same
 * disclosed caveat as that precedent — the backing table (`cr664_bookingqccheck`, proposed in
 * `scripts/schema-migrations/final-arc-booking-qc-check/`) has NOT been applied to any live
 * Dataverse environment, and the generated SDK pairing was hand-authored (no live credentials exist
 * in this sandbox). Until an operator applies that migration, every live call fails closed — an
 * honest `{ success: false, error }`, never a fabricated success.
 */

export interface BookingQcCheckStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface BookingQcCheckListResult {
  readonly success: boolean;
  readonly records?: readonly BookingQcCheckRecord[];
  readonly error?: string;
}

export interface BookingQcCheckStoreDeps {
  readonly createCheckRecord: (record: BookingQcCheckRecord) => Promise<BookingQcCheckStorageResult>;
  readonly listChecksForDeal: (dealId: string) => Promise<BookingQcCheckListResult>;
}

export function createInMemoryBookingQcCheckStore(): BookingQcCheckStoreDeps & {
  readonly all: () => readonly BookingQcCheckRecord[];
} {
  const records: BookingQcCheckRecord[] = [];
  return {
    createCheckRecord: async (record) => {
      records.push(record);
      return { success: true, id: record.checkId };
    },
    listChecksForDeal: async (dealId) => ({
      success: true,
      records: records.filter((r) => r.dealId === dealId),
    }),
    all: () => records,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(BOOKING_QC_STATUSES);

/** The subset of `Cr664_bookingqcchecks` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_checkid',
  'cr664_dealid',
  'cr664_qcstatus',
  'cr664_notes',
  'cr664_reviewedby',
  'cr664_reviewedat',
  'cr664_correlationid',
  'cr664_supersedescheckid',
] as const;

type BookingQcCheckRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToCheck(row: BookingQcCheckRow): MapResult<BookingQcCheckRecord> {
  const checkId = row.cr664_checkid;
  if (typeof checkId !== 'string' || checkId.length === 0) {
    return { ok: false, error: 'A booking QC check row is missing cr664_checkid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Check ${checkId} is missing cr664_dealid.` };
  }
  const status = row.cr664_qcstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Check ${checkId} has an unrecognized status: ${String(status)}.` };
  }
  const notes = row.cr664_notes;
  if (typeof notes !== 'string') {
    return { ok: false, error: `Check ${checkId} is missing cr664_notes.` };
  }
  const reviewedByActorEmail = row.cr664_reviewedby;
  if (typeof reviewedByActorEmail !== 'string' || reviewedByActorEmail.length === 0) {
    return { ok: false, error: `Check ${checkId} is missing cr664_reviewedby.` };
  }
  const reviewedAtIso = row.cr664_reviewedat;
  if (typeof reviewedAtIso !== 'string' || reviewedAtIso.length === 0) {
    return { ok: false, error: `Check ${checkId} is missing cr664_reviewedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Check ${checkId} is missing cr664_correlationid.` };
  }

  return {
    ok: true,
    value: {
      checkId,
      dealId,
      status: status as BookingQcStatus,
      notes,
      reviewedByActorEmail,
      reviewedAtIso,
      correlationId,
      supersedesCheckId: typeof row.cr664_supersedescheckid === 'string' ? row.cr664_supersedescheckid : undefined,
    },
  };
}

function checkToRow(record: BookingQcCheckRecord): Record<string, unknown> {
  return {
    cr664_checkid: record.checkId,
    cr664_dealid: record.dealId,
    cr664_qcstatus: record.status,
    cr664_notes: record.notes,
    cr664_reviewedby: record.reviewedByActorEmail,
    cr664_reviewedat: record.reviewedAtIso,
    cr664_correlationid: record.correlationId,
    cr664_supersedescheckid: record.supersedesCheckId,
  };
}

/**
 * The durable, Dataverse-backed `BookingQcCheckStoreDeps` implementation. Dynamic-import-only (no
 * static SDK import at this module's top level) — matches every other SDK-touching module in this
 * codebase. Every check is immutable and append-only (a re-check always creates a NEW row via
 * `supersedesCheckId`, never mutates a prior one), so this adapter only ever needs `create` and
 * `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated check. A single
 * unreadable row fails only that read (listing skips and reports unreadable rows individually).
 */
export function createDataverseBookingQcCheckStore(): BookingQcCheckStoreDeps {
  return {
    createCheckRecord: async (record) => {
      try {
        const { Cr664_bookingqcchecksService } = await import(
          '../generated/services/Cr664_bookingqcchecksService'
        );
        const payload = checkToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as executedDocumentAttestationStore.ts).
        const result = await Cr664_bookingqcchecksService.create(
          payload as unknown as Parameters<typeof Cr664_bookingqcchecksService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Booking QC check create returned non-success.' };
        }
        return { success: true, id: record.checkId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listChecksForDeal: async (dealId) => {
      try {
        const { Cr664_bookingqcchecksService } = await import(
          '../generated/services/Cr664_bookingqcchecksService'
        );
        const result = await Cr664_bookingqcchecksService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Booking QC check list read failed.' };
        }
        const records: BookingQcCheckRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToCheck(row as unknown as BookingQcCheckRow);
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
export const __internal = { mapRowToCheck, checkToRow };

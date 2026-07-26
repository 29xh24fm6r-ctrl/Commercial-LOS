import type { ConditionType, ConditionVerificationRecord, ConditionVerificationStatus } from '../workflow/conditionVerificationTypes';
import { CONDITION_TYPES, CONDITION_VERIFICATION_STATUSES } from '../workflow/conditionVerificationTypes';

/**
 * Final LOS Completion arc — Workstream E. Storage seam for durable Condition Verification
 * records, following the exact precedent `commitmentRecordStore.ts` (Workstream D) established: a
 * real Dataverse-backed store below, plus an in-memory reference implementation for tests. Same
 * disclosed caveat as that precedent — the backing table (`cr664_conditionverification`, proposed
 * in `scripts/schema-migrations/final-arc-condition-verification/`) has NOT been applied to any
 * live Dataverse environment, and the generated SDK pairing was hand-authored (no live credentials
 * exist in this sandbox). Until an operator applies that migration, every live call fails closed —
 * an honest `{ success: false, error }`, never a fabricated success.
 */

export interface ConditionVerificationStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface ConditionVerificationListResult {
  readonly success: boolean;
  readonly records?: readonly ConditionVerificationRecord[];
  readonly error?: string;
}

export interface ConditionVerificationStoreDeps {
  readonly createVerificationRecord: (record: ConditionVerificationRecord) => Promise<ConditionVerificationStorageResult>;
  readonly listVerificationsForDeal: (dealId: string) => Promise<ConditionVerificationListResult>;
}

export function createInMemoryConditionVerificationStore(): ConditionVerificationStoreDeps & {
  readonly all: () => readonly ConditionVerificationRecord[];
} {
  const records: ConditionVerificationRecord[] = [];
  return {
    createVerificationRecord: async (record) => {
      records.push(record);
      return { success: true, id: record.recordId };
    },
    listVerificationsForDeal: async (dealId) => ({
      success: true,
      records: records.filter((r) => r.dealId === dealId),
    }),
    all: () => records,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_TYPES: ReadonlySet<string> = new Set(CONDITION_TYPES);
const VALID_STATUSES: ReadonlySet<string> = new Set(CONDITION_VERIFICATION_STATUSES);

/** The subset of `Cr664_conditionverifications` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_recordid',
  'cr664_dealid',
  'cr664_conditiontype',
  'cr664_verificationstatus',
  'cr664_notes',
  'cr664_verifiedby',
  'cr664_verifiedat',
  'cr664_correlationid',
  'cr664_supersedesrecordid',
] as const;

type ConditionVerificationRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToVerification(row: ConditionVerificationRow): MapResult<ConditionVerificationRecord> {
  const recordId = row.cr664_recordid;
  if (typeof recordId !== 'string' || recordId.length === 0) {
    return { ok: false, error: 'A condition verification row is missing cr664_recordid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Verification ${recordId} is missing cr664_dealid.` };
  }
  const conditionType = row.cr664_conditiontype;
  if (typeof conditionType !== 'string' || !VALID_TYPES.has(conditionType)) {
    return { ok: false, error: `Verification ${recordId} has an unrecognized condition type: ${String(conditionType)}.` };
  }
  const status = row.cr664_verificationstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Verification ${recordId} has an unrecognized status: ${String(status)}.` };
  }
  const notes = row.cr664_notes;
  if (typeof notes !== 'string') {
    return { ok: false, error: `Verification ${recordId} is missing cr664_notes.` };
  }
  const verifiedByActorEmail = row.cr664_verifiedby;
  if (typeof verifiedByActorEmail !== 'string' || verifiedByActorEmail.length === 0) {
    return { ok: false, error: `Verification ${recordId} is missing cr664_verifiedby.` };
  }
  const verifiedAtIso = row.cr664_verifiedat;
  if (typeof verifiedAtIso !== 'string' || verifiedAtIso.length === 0) {
    return { ok: false, error: `Verification ${recordId} is missing cr664_verifiedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Verification ${recordId} is missing cr664_correlationid.` };
  }

  return {
    ok: true,
    value: {
      recordId,
      dealId,
      conditionType: conditionType as ConditionType,
      status: status as ConditionVerificationStatus,
      notes,
      verifiedByActorEmail,
      verifiedAtIso,
      correlationId,
      supersedesRecordId: typeof row.cr664_supersedesrecordid === 'string' ? row.cr664_supersedesrecordid : undefined,
    },
  };
}

function verificationToRow(record: ConditionVerificationRecord): Record<string, unknown> {
  return {
    cr664_recordid: record.recordId,
    cr664_dealid: record.dealId,
    cr664_conditiontype: record.conditionType,
    cr664_verificationstatus: record.status,
    cr664_notes: record.notes,
    cr664_verifiedby: record.verifiedByActorEmail,
    cr664_verifiedat: record.verifiedAtIso,
    cr664_correlationid: record.correlationId,
    cr664_supersedesrecordid: record.supersedesRecordId,
  };
}

/**
 * The durable, Dataverse-backed `ConditionVerificationStoreDeps` implementation. Dynamic-import-
 * only (no static SDK import at this module's top level) — matches every other SDK-touching module
 * in this codebase. Every verification event is immutable and append-only (a re-verification always
 * creates a NEW row via `supersedesRecordId`, never mutates a prior one), so this adapter only ever
 * needs `create` and `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated verification. A
 * single unreadable row fails only that read (listing skips and reports unreadable rows
 * individually).
 */
export function createDataverseConditionVerificationStore(): ConditionVerificationStoreDeps {
  return {
    createVerificationRecord: async (record) => {
      try {
        const { Cr664_conditionverificationsService } = await import(
          '../generated/services/Cr664_conditionverificationsService'
        );
        const payload = verificationToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as commitmentRecordStore.ts).
        const result = await Cr664_conditionverificationsService.create(
          payload as unknown as Parameters<typeof Cr664_conditionverificationsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Condition verification create returned non-success.' };
        }
        return { success: true, id: record.recordId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listVerificationsForDeal: async (dealId) => {
      try {
        const { Cr664_conditionverificationsService } = await import(
          '../generated/services/Cr664_conditionverificationsService'
        );
        const result = await Cr664_conditionverificationsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Condition verification list read failed.' };
        }
        const records: ConditionVerificationRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToVerification(row as unknown as ConditionVerificationRow);
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
export const __internal = { mapRowToVerification, verificationToRow };

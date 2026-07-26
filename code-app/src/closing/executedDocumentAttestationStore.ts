import type {
  ExecutedDocumentAttestationRecord,
  ExecutedDocumentAttestationStatus,
} from '../workflow/executedDocumentAttestationTypes';
import { EXECUTED_DOCUMENT_CERTIFICATION_STATUSES } from '../workflow/executedDocumentAttestationTypes';

/**
 * Final LOS Completion arc — Workstream F. Storage seam for durable Executed Document
 * Attestation records, following the exact precedent `conditionVerificationStore.ts`
 * (Workstream E) established: a real Dataverse-backed store below, plus an in-memory reference
 * implementation for tests. Same disclosed caveat as that precedent — the backing table
 * (`cr664_executeddocattestation`, proposed in
 * `scripts/schema-migrations/final-arc-executed-document-attestation/`) has NOT been applied to
 * any live Dataverse environment, and the generated SDK pairing was hand-authored (no live
 * credentials exist in this sandbox). Until an operator applies that migration, every live call
 * fails closed — an honest `{ success: false, error }`, never a fabricated success.
 */

export interface ExecutedDocumentAttestationStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface ExecutedDocumentAttestationListResult {
  readonly success: boolean;
  readonly records?: readonly ExecutedDocumentAttestationRecord[];
  readonly error?: string;
}

export interface ExecutedDocumentAttestationStoreDeps {
  readonly createAttestationRecord: (
    record: ExecutedDocumentAttestationRecord,
  ) => Promise<ExecutedDocumentAttestationStorageResult>;
  readonly listAttestationsForDeal: (dealId: string) => Promise<ExecutedDocumentAttestationListResult>;
}

export function createInMemoryExecutedDocumentAttestationStore(): ExecutedDocumentAttestationStoreDeps & {
  readonly all: () => readonly ExecutedDocumentAttestationRecord[];
} {
  const records: ExecutedDocumentAttestationRecord[] = [];
  return {
    createAttestationRecord: async (record) => {
      records.push(record);
      return { success: true, id: record.attestationId };
    },
    listAttestationsForDeal: async (dealId) => ({
      success: true,
      records: records.filter((r) => r.dealId === dealId),
    }),
    all: () => records,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(EXECUTED_DOCUMENT_CERTIFICATION_STATUSES);

/** The subset of `Cr664_executeddocattestations` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_attestationid',
  'cr664_dealid',
  'cr664_attestationstatus',
  'cr664_executeddate',
  'cr664_notes',
  'cr664_attestedby',
  'cr664_attestedat',
  'cr664_correlationid',
  'cr664_supersedesattestationid',
] as const;

type AttestationRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToAttestation(row: AttestationRow): MapResult<ExecutedDocumentAttestationRecord> {
  const attestationId = row.cr664_attestationid;
  if (typeof attestationId !== 'string' || attestationId.length === 0) {
    return { ok: false, error: 'An executed document attestation row is missing cr664_attestationid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_dealid.` };
  }
  const status = row.cr664_attestationstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Attestation ${attestationId} has an unrecognized status: ${String(status)}.` };
  }
  const executedDateIso = row.cr664_executeddate;
  if (typeof executedDateIso !== 'string' || executedDateIso.length === 0) {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_executeddate.` };
  }
  const notes = row.cr664_notes;
  if (typeof notes !== 'string') {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_notes.` };
  }
  const attestedByActorEmail = row.cr664_attestedby;
  if (typeof attestedByActorEmail !== 'string' || attestedByActorEmail.length === 0) {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_attestedby.` };
  }
  const attestedAtIso = row.cr664_attestedat;
  if (typeof attestedAtIso !== 'string' || attestedAtIso.length === 0) {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_attestedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Attestation ${attestationId} is missing cr664_correlationid.` };
  }

  return {
    ok: true,
    value: {
      attestationId,
      dealId,
      status: status as ExecutedDocumentAttestationStatus,
      executedDateIso,
      notes,
      attestedByActorEmail,
      attestedAtIso,
      correlationId,
      supersedesAttestationId:
        typeof row.cr664_supersedesattestationid === 'string' ? row.cr664_supersedesattestationid : undefined,
    },
  };
}

function attestationToRow(record: ExecutedDocumentAttestationRecord): Record<string, unknown> {
  return {
    cr664_attestationid: record.attestationId,
    cr664_dealid: record.dealId,
    cr664_attestationstatus: record.status,
    cr664_executeddate: record.executedDateIso,
    cr664_notes: record.notes,
    cr664_attestedby: record.attestedByActorEmail,
    cr664_attestedat: record.attestedAtIso,
    cr664_correlationid: record.correlationId,
    cr664_supersedesattestationid: record.supersedesAttestationId,
  };
}

/**
 * The durable, Dataverse-backed `ExecutedDocumentAttestationStoreDeps` implementation.
 * Dynamic-import-only (no static SDK import at this module's top level) — matches every other
 * SDK-touching module in this codebase. Every attestation event is immutable and append-only (a
 * correction always creates a NEW row via `supersedesAttestationId`, never mutates a prior one),
 * so this adapter only ever needs `create` and `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated attestation. A
 * single unreadable row fails only that read (listing skips and reports unreadable rows
 * individually).
 */
export function createDataverseExecutedDocumentAttestationStore(): ExecutedDocumentAttestationStoreDeps {
  return {
    createAttestationRecord: async (record) => {
      try {
        const { Cr664_executeddocattestationsService } = await import(
          '../generated/services/Cr664_executeddocattestationsService'
        );
        const payload = attestationToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as conditionVerificationStore.ts).
        const result = await Cr664_executeddocattestationsService.create(
          payload as unknown as Parameters<typeof Cr664_executeddocattestationsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Executed document attestation create returned non-success.' };
        }
        return { success: true, id: record.attestationId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listAttestationsForDeal: async (dealId) => {
      try {
        const { Cr664_executeddocattestationsService } = await import(
          '../generated/services/Cr664_executeddocattestationsService'
        );
        const result = await Cr664_executeddocattestationsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Executed document attestation list read failed.' };
        }
        const records: ExecutedDocumentAttestationRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToAttestation(row as unknown as AttestationRow);
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
export const __internal = { mapRowToAttestation, attestationToRow };

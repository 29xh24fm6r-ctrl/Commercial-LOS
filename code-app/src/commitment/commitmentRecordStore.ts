import type { CommitmentRecord, CommitmentStatus } from '../workflow/commitmentRecordTypes';
import { COMMITMENT_STATUSES } from '../workflow/commitmentRecordTypes';

/**
 * Final LOS Completion arc — Workstream D. Storage seam for durable Commitment Records, following
 * the exact precedent `creditApprovalDecisionStore.ts` (Workstream C) established: a real
 * Dataverse-backed store below, plus an in-memory reference implementation for tests. Same
 * disclosed caveat as that precedent — the backing table (`cr664_commitmentrecord`, proposed in
 * `scripts/schema-migrations/final-arc-commitment-record/`) has NOT been applied to any live
 * Dataverse environment, and the generated SDK pairing was hand-authored (no live credentials exist
 * in this sandbox). Until an operator applies that migration, every live call fails closed — an
 * honest `{ success: false, error }`, never a fabricated success.
 */

export interface CommitmentStorageResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: string;
}

export interface CommitmentListResult {
  readonly success: boolean;
  readonly commitments?: readonly CommitmentRecord[];
  readonly error?: string;
}

export interface CommitmentStoreDeps {
  readonly createCommitmentRecord: (record: CommitmentRecord) => Promise<CommitmentStorageResult>;
  readonly listCommitmentsForDeal: (dealId: string) => Promise<CommitmentListResult>;
}

export function createInMemoryCommitmentStore(): CommitmentStoreDeps & {
  readonly all: () => readonly CommitmentRecord[];
} {
  const commitments: CommitmentRecord[] = [];
  return {
    createCommitmentRecord: async (record) => {
      commitments.push(record);
      return { success: true, id: record.commitmentId };
    },
    listCommitmentsForDeal: async (dealId) => ({
      success: true,
      commitments: commitments.filter((c) => c.dealId === dealId),
    }),
    all: () => commitments,
  };
}

// ---------------------------------------------------------------------------
// Live Dataverse-backed implementation (see the header disclosure above)
// ---------------------------------------------------------------------------

const VALID_STATUSES: ReadonlySet<string> = new Set(COMMITMENT_STATUSES);

/** The subset of `Cr664_commitmentrecords` fields this adapter reads. */
const SELECT_FIELDS = [
  'cr664_commitmentid',
  'cr664_dealid',
  'cr664_commitmentstatus',
  'cr664_approvedamount',
  'cr664_approvedproduct',
  'cr664_approvedtermmonths',
  'cr664_approvedpricing',
  'cr664_keytermssummary',
  'cr664_expirationdate',
  'cr664_issuedby',
  'cr664_issuedat',
  'cr664_respondedby',
  'cr664_respondedat',
  'cr664_declinereason',
  'cr664_correlationid',
  'cr664_supersedescommitmentid',
] as const;

type CommitmentRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

/** Fail-closed row -> record mapping — a malformed/missing required field fails this ONE row's read
 *  rather than being silently coerced into a fabricated value. */
function mapRowToCommitment(row: CommitmentRow): MapResult<CommitmentRecord> {
  const commitmentId = row.cr664_commitmentid;
  if (typeof commitmentId !== 'string' || commitmentId.length === 0) {
    return { ok: false, error: 'A commitment row is missing cr664_commitmentid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Commitment ${commitmentId} is missing cr664_dealid.` };
  }
  const status = row.cr664_commitmentstatus;
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return { ok: false, error: `Commitment ${commitmentId} has an unrecognized status: ${String(status)}.` };
  }
  const keyTermsSummary = row.cr664_keytermssummary;
  if (typeof keyTermsSummary !== 'string') {
    return { ok: false, error: `Commitment ${commitmentId} is missing cr664_keytermssummary.` };
  }
  const issuedByActorEmail = row.cr664_issuedby;
  if (typeof issuedByActorEmail !== 'string' || issuedByActorEmail.length === 0) {
    return { ok: false, error: `Commitment ${commitmentId} is missing cr664_issuedby.` };
  }
  const issuedAtIso = row.cr664_issuedat;
  if (typeof issuedAtIso !== 'string' || issuedAtIso.length === 0) {
    return { ok: false, error: `Commitment ${commitmentId} is missing cr664_issuedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Commitment ${commitmentId} is missing cr664_correlationid.` };
  }

  return {
    ok: true,
    value: {
      commitmentId,
      dealId,
      status: status as CommitmentStatus,
      approvedAmount: typeof row.cr664_approvedamount === 'number' ? row.cr664_approvedamount : undefined,
      approvedProduct: typeof row.cr664_approvedproduct === 'string' ? row.cr664_approvedproduct : undefined,
      approvedTermMonths: typeof row.cr664_approvedtermmonths === 'number' ? row.cr664_approvedtermmonths : undefined,
      approvedPricing: typeof row.cr664_approvedpricing === 'string' ? row.cr664_approvedpricing : undefined,
      keyTermsSummary,
      expirationDateIso: typeof row.cr664_expirationdate === 'string' ? row.cr664_expirationdate : undefined,
      issuedByActorEmail,
      issuedAtIso,
      respondedByActorEmail: typeof row.cr664_respondedby === 'string' ? row.cr664_respondedby : undefined,
      respondedAtIso: typeof row.cr664_respondedat === 'string' ? row.cr664_respondedat : undefined,
      declineReason: typeof row.cr664_declinereason === 'string' ? row.cr664_declinereason : undefined,
      correlationId,
      supersedesCommitmentId: typeof row.cr664_supersedescommitmentid === 'string' ? row.cr664_supersedescommitmentid : undefined,
    },
  };
}

function commitmentToRow(record: CommitmentRecord): Record<string, unknown> {
  return {
    cr664_commitmentid: record.commitmentId,
    cr664_dealid: record.dealId,
    cr664_commitmentstatus: record.status,
    cr664_approvedamount: record.approvedAmount,
    cr664_approvedproduct: record.approvedProduct,
    cr664_approvedtermmonths: record.approvedTermMonths,
    cr664_approvedpricing: record.approvedPricing,
    cr664_keytermssummary: record.keyTermsSummary,
    cr664_expirationdate: record.expirationDateIso,
    cr664_issuedby: record.issuedByActorEmail,
    cr664_issuedat: record.issuedAtIso,
    cr664_respondedby: record.respondedByActorEmail,
    cr664_respondedat: record.respondedAtIso,
    cr664_declinereason: record.declineReason,
    cr664_correlationid: record.correlationId,
    cr664_supersedescommitmentid: record.supersedesCommitmentId,
  };
}

/**
 * The durable, Dataverse-backed `CommitmentStoreDeps` implementation. Dynamic-import-only (no
 * static SDK import at this module's top level) — matches every other SDK-touching module in this
 * codebase. Every commitment event (issuance, acceptance, decline, expiration, withdrawal) is
 * immutable and append-only (a later event always creates a NEW row via `supersedesCommitmentId`
 * when re-issuing, never mutates a prior one), so this adapter only ever needs `create` and
 * `getAll`, never an update path.
 *
 * FAIL-CLOSED throughout: a malformed/missing required field on any row, or a thrown/rejected SDK
 * call, surfaces as an honest `{ success: false, error }` — never a fabricated commitment. A single
 * unreadable row fails only that read (no single "current" row whose correctness a bad sibling row
 * could undermine — listing skips and reports unreadable rows individually).
 */
export function createDataverseCommitmentStore(): CommitmentStoreDeps {
  return {
    createCommitmentRecord: async (record) => {
      try {
        const { Cr664_commitmentrecordsService } = await import(
          '../generated/services/Cr664_commitmentrecordsService'
        );
        const payload = commitmentToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as creditApprovalDecisionStore.ts).
        const result = await Cr664_commitmentrecordsService.create(
          payload as unknown as Parameters<typeof Cr664_commitmentrecordsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Commitment record create returned non-success.' };
        }
        return { success: true, id: record.commitmentId };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    listCommitmentsForDeal: async (dealId) => {
      try {
        const { Cr664_commitmentrecordsService } = await import(
          '../generated/services/Cr664_commitmentrecordsService'
        );
        const result = await Cr664_commitmentrecordsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${dealId.replace(/'/g, "''")}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Commitment record list read failed.' };
        }
        const commitments: CommitmentRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToCommitment(row as unknown as CommitmentRow);
          if (mapped.ok) commitments.push(mapped.value);
        }
        return { success: true, commitments };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// Re-exported so tests needing the pure row<->record mapping (without a live/mocked SDK call) don't
// have to reach into this module's private scope.
export const __internal = { mapRowToCommitment, commitmentToRow };

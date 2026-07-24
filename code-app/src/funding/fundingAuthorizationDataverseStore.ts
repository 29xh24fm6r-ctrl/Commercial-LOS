import type { FundingException, FundingAuthorizationRecord } from './fundingAuthorizationTypes';
import type { FundingAuthorizationStorageDeps } from './fundingAuthorizationStorage';

/**
 * PR 112 — the durable, Dataverse-backed `FundingAuthorizationStorageDeps` implementation,
 * replacing `createInMemoryFundingAuthorizationStore()` in the mounted production path
 * (`DealFundingAuthorizationPanel.tsx`). Dynamic-import-only (no static SDK import at this module's
 * top level) — matches every other SDK-touching module in this codebase.
 *
 * Every `FundingAuthorizationRecord` field maps 1:1 onto `cr664_fundingauthorization`'s 18 columns +
 * primary `cr664_recordid` (see `Cr664_fundingauthorizationsModel.ts`'s own header for this table's
 * generation-disclosure status). Stateless by design — no field on this adapter caches anything in
 * memory across calls, so a fresh instance created after a component remount reads exactly the same
 * durable history a prior instance would have. There is nothing for a remount to lose.
 *
 * Durable history is preserved automatically by construction, not by any special-case code here:
 * `createRecord` always performs a genuine Dataverse CREATE (never an upsert), and `updateRecord`
 * always targets the one existing row whose `cr664_recordid` exactly matches the record being
 * updated. When the domain layer supersedes a prior REVOKED/REJECTED/CANCELLED record (see
 * `fundingRequestAdapter.ts`), it does so by creating a BRAND NEW record with a new `recordId` and a
 * `supersedesRecordId` pointer — this adapter never touches the row being superseded.
 *
 * FAIL-CLOSED throughout: a malformed JSON column, a missing/unrecognized required field, an
 * ambiguous (zero/multiple) row match for an update, or a thrown/rejected SDK call all surface as an
 * honest `{ success: false, error }` — never a fabricated record, never a guessed default, never a
 * silent partial success. A single unreadable row in a deal's history fails the entire
 * `getCurrentRecordForDeal` read (rather than silently dropping it), since an incomplete picture of
 * a deal's authorization history could misidentify which record is actually "current."
 */

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

type MapResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

function safeParseStringArray(json: string | undefined, fieldLabel: string): MapResult<readonly string[]> {
  if (json === undefined || json === '') return { ok: true, value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err: unknown) {
    return { ok: false, error: `${fieldLabel} is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!Array.isArray(parsed) || !parsed.every((v): v is string => typeof v === 'string')) {
    return { ok: false, error: `${fieldLabel} did not decode to a string array.` };
  }
  return { ok: true, value: parsed };
}

function safeParseExceptions(json: string | undefined): MapResult<readonly FundingException[]> {
  if (json === undefined || json === '') return { ok: true, value: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err: unknown) {
    return { ok: false, error: `exceptions is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: 'exceptions did not decode to an array.' };
  const exceptions: FundingException[] = [];
  for (const item of parsed) {
    const row = item as Record<string, unknown>;
    if (
      !item ||
      typeof item !== 'object' ||
      typeof row.id !== 'string' ||
      typeof row.description !== 'string' ||
      typeof row.resolved !== 'boolean'
    ) {
      return { ok: false, error: 'exceptions contained a malformed entry.' };
    }
    exceptions.push({ id: row.id, description: row.description, resolved: row.resolved });
  }
  return { ok: true, value: exceptions };
}

const VALID_AUTHORIZATION_STATUSES: ReadonlySet<string> = new Set([
  'NOT_REQUESTED',
  'PENDING',
  'BLOCKED',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'FUNDED',
  'CANCELLED',
]);

const VALID_DESTINATION_VERIFICATION_STATUSES: ReadonlySet<string> = new Set(['unverified', 'verified', 'failed']);

/** The subset of `Cr664_fundingauthorizations` fields this adapter reads/writes. */
const SELECT_FIELDS = [
  'cr664_recordid',
  'cr664_dealid',
  'cr664_authorizationstatus',
  'cr664_requestedamount',
  'cr664_approvedamount',
  'cr664_fundingdate',
  'cr664_fundingmethod',
  'cr664_destinationverificationstatus',
  'cr664_conditionssatisfied',
  'cr664_exceptionsjson',
  'cr664_authorizedby',
  'cr664_secondapprovedby',
  'cr664_requestedby',
  'cr664_requestedat',
  'cr664_authorizedat',
  'cr664_correlationid',
  'cr664_supportingdocumentidsjson',
  'cr664_auditeventidsjson',
  'cr664_supersedesrecordid',
] as const;

type FundingAuthorizationRow = Record<(typeof SELECT_FIELDS)[number], unknown>;

function mapRowToRecord(row: FundingAuthorizationRow): MapResult<FundingAuthorizationRecord> {
  const recordId = row.cr664_recordid;
  if (typeof recordId !== 'string' || recordId.length === 0) {
    return { ok: false, error: 'A funding authorization row is missing cr664_recordid.' };
  }
  const dealId = row.cr664_dealid;
  if (typeof dealId !== 'string' || dealId.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_dealid.` };
  }
  const authorizationStatus = row.cr664_authorizationstatus;
  if (typeof authorizationStatus !== 'string' || !VALID_AUTHORIZATION_STATUSES.has(authorizationStatus)) {
    return { ok: false, error: `Record ${recordId} has an unrecognized authorization status: ${String(authorizationStatus)}.` };
  }
  const requestedAmount = row.cr664_requestedamount;
  if (typeof requestedAmount !== 'number') {
    return { ok: false, error: `Record ${recordId} is missing a numeric cr664_requestedamount.` };
  }
  const destinationVerificationStatus = row.cr664_destinationverificationstatus;
  if (typeof destinationVerificationStatus !== 'string' || !VALID_DESTINATION_VERIFICATION_STATUSES.has(destinationVerificationStatus)) {
    return { ok: false, error: `Record ${recordId} has an unrecognized destination verification status.` };
  }
  const requestedBy = row.cr664_requestedby;
  if (typeof requestedBy !== 'string' || requestedBy.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_requestedby.` };
  }
  const requestedAt = row.cr664_requestedat;
  if (typeof requestedAt !== 'string' || requestedAt.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_requestedat.` };
  }
  const correlationId = row.cr664_correlationid;
  if (typeof correlationId !== 'string' || correlationId.length === 0) {
    return { ok: false, error: `Record ${recordId} is missing cr664_correlationid.` };
  }

  const exceptions = safeParseExceptions(row.cr664_exceptionsjson as string | undefined);
  if (!exceptions.ok) return { ok: false, error: `Record ${recordId}: ${exceptions.error}` };
  const supportingDocumentIds = safeParseStringArray(row.cr664_supportingdocumentidsjson as string | undefined, 'supportingDocumentIds');
  if (!supportingDocumentIds.ok) return { ok: false, error: `Record ${recordId}: ${supportingDocumentIds.error}` };
  const auditEventIds = safeParseStringArray(row.cr664_auditeventidsjson as string | undefined, 'auditEventIds');
  if (!auditEventIds.ok) return { ok: false, error: `Record ${recordId}: ${auditEventIds.error}` };

  return {
    ok: true,
    value: {
      dealId,
      authorizationStatus: authorizationStatus as FundingAuthorizationRecord['authorizationStatus'],
      requestedAmount,
      approvedAmount: typeof row.cr664_approvedamount === 'number' ? row.cr664_approvedamount : undefined,
      fundingDate: typeof row.cr664_fundingdate === 'string' ? row.cr664_fundingdate : undefined,
      fundingMethod: typeof row.cr664_fundingmethod === 'string' ? row.cr664_fundingmethod : undefined,
      destinationVerificationStatus: destinationVerificationStatus as FundingAuthorizationRecord['destinationVerificationStatus'],
      conditionsSatisfied: row.cr664_conditionssatisfied === true,
      exceptions: exceptions.value,
      authorizedBy: typeof row.cr664_authorizedby === 'string' ? row.cr664_authorizedby : undefined,
      secondApprovedBy: typeof row.cr664_secondapprovedby === 'string' ? row.cr664_secondapprovedby : undefined,
      requestedBy,
      requestedAt,
      authorizedAt: typeof row.cr664_authorizedat === 'string' ? row.cr664_authorizedat : undefined,
      correlationId,
      supportingDocumentIds: supportingDocumentIds.value,
      auditEventIds: auditEventIds.value,
      supersedesRecordId: typeof row.cr664_supersedesrecordid === 'string' ? row.cr664_supersedesrecordid : undefined,
      recordId,
    },
  };
}

function recordToRow(record: FundingAuthorizationRecord): Record<string, unknown> {
  return {
    cr664_recordid: record.recordId,
    cr664_dealid: record.dealId,
    cr664_authorizationstatus: record.authorizationStatus,
    cr664_requestedamount: record.requestedAmount,
    cr664_approvedamount: record.approvedAmount,
    cr664_fundingdate: record.fundingDate,
    cr664_fundingmethod: record.fundingMethod,
    cr664_destinationverificationstatus: record.destinationVerificationStatus,
    cr664_conditionssatisfied: record.conditionsSatisfied,
    cr664_exceptionsjson: JSON.stringify(record.exceptions),
    cr664_authorizedby: record.authorizedBy,
    cr664_secondapprovedby: record.secondApprovedBy,
    cr664_requestedby: record.requestedBy,
    cr664_requestedat: record.requestedAt,
    cr664_authorizedat: record.authorizedAt,
    cr664_correlationid: record.correlationId,
    cr664_supportingdocumentidsjson: JSON.stringify(record.supportingDocumentIds),
    cr664_auditeventidsjson: JSON.stringify(record.auditEventIds),
    cr664_supersedesrecordid: record.supersedesRecordId,
  };
}

/** "Current" = the latest-requested record for the deal that no other record supersedes as its own
 *  successor — identical selection rule to `createInMemoryFundingAuthorizationStore()`, so a
 *  caller sees the same result whichever storage backend is wired in. */
function selectCurrentRecord(records: readonly FundingAuthorizationRecord[]): FundingAuthorizationRecord | undefined {
  const supersededIds = new Set(records.map((r) => r.supersedesRecordId).filter((id): id is string => Boolean(id)));
  const current = records.filter((r) => !supersededIds.has(r.recordId));
  return current.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
}

export function createDataverseFundingAuthorizationStore(): FundingAuthorizationStorageDeps {
  return {
    createRecord: async (record) => {
      try {
        const { Cr664_fundingauthorizationsService } = await import('../generated/services/Cr664_fundingauthorizationsService');
        const payload = recordToRow(record);
        // ownerid / owneridtype / statecode are server-defaulted Dataverse system fields — never
        // supplied by callers (same convention as every other create() call site in this repo, e.g.
        // src/admin/alertActions.ts's Cr664_auditeventsService.create()).
        const result = await Cr664_fundingauthorizationsService.create(
          payload as unknown as Parameters<typeof Cr664_fundingauthorizationsService.create>[0],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Funding authorization create returned non-success.' };
        }
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    updateRecord: async (record) => {
      try {
        const { Cr664_fundingauthorizationsService } = await import('../generated/services/Cr664_fundingauthorizationsService');
        // Never cache the Dataverse row id across calls — always re-resolve it from the domain
        // record's own recordId, so this adapter needs no in-memory state to survive a remount.
        const lookup = await Cr664_fundingauthorizationsService.getAll({
          select: ['cr664_fundingauthorizationid'],
          filter: `cr664_recordid eq '${escapeOData(record.recordId)}'`,
        });
        if (!lookup.success || !Array.isArray(lookup.data)) {
          return { success: false, error: lookup.error?.message ?? 'Could not look up the existing funding authorization row.' };
        }
        if (lookup.data.length === 0) {
          return { success: false, error: `No existing funding authorization row found for record ${record.recordId}.` };
        }
        if (lookup.data.length > 1) {
          return { success: false, error: `Ambiguous funding authorization lookup: ${lookup.data.length} rows matched record ${record.recordId}.` };
        }
        const rowId = (lookup.data[0] as unknown as { cr664_fundingauthorizationid: string }).cr664_fundingauthorizationid;
        const changedFields = recordToRow(record);
        const result = await Cr664_fundingauthorizationsService.update(
          rowId,
          changedFields as unknown as Parameters<typeof Cr664_fundingauthorizationsService.update>[1],
        );
        if (!result.success) {
          return { success: false, error: result.error?.message ?? 'Funding authorization update returned non-success.' };
        }
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    getCurrentRecordForDeal: async (dealId) => {
      try {
        const { Cr664_fundingauthorizationsService } = await import('../generated/services/Cr664_fundingauthorizationsService');
        const result = await Cr664_fundingauthorizationsService.getAll({
          select: [...SELECT_FIELDS],
          filter: `cr664_dealid eq '${escapeOData(dealId)}'`,
        });
        if (!result.success || !Array.isArray(result.data)) {
          return { success: false, error: result.error?.message ?? 'Funding authorization read failed.' };
        }
        const records: FundingAuthorizationRecord[] = [];
        for (const row of result.data) {
          const mapped = mapRowToRecord(row as unknown as FundingAuthorizationRow);
          if (!mapped.ok) {
            // A single unreadable row could hide the true "current" record — fail the whole read
            // rather than silently reasoning from a partial history.
            return { success: false, error: mapped.error };
          }
          records.push(mapped.value);
        }
        return { success: true, record: selectCurrentRecord(records) };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

// Re-exported so tests/callers needing the pure row<->record mapping (without a live/mocked SDK
// call) don't have to reach into this module's private scope.
export const __internal = { mapRowToRecord, recordToRow, selectCurrentRecord };

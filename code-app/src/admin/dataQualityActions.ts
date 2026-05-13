import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';

/**
 * First write in the rebuild: resolve an open cr664_DataQualityFlag.
 *
 * Honest discriminated outcome — the UI MUST distinguish these:
 *   success          both flag update and audit event succeeded.
 *   audit-failed     flag updated, but audit event creation failed.
 *                    Partial state — must surface as critical so the
 *                    admin knows the resolution is not fully governed.
 *   flag-failed      flag update failed; audit never attempted; flag
 *                    is unchanged.
 *   unknown          unexpected exception path.
 *
 * Audit contract:
 *   - cr664_AuditEvent.entitytype enum has no DataQualityFlag value.
 *     Closest honest match is Configuration (788190005); we put the
 *     precise entity name in cr664_relatedentitytype (free text) so
 *     the audit row is forensically searchable for 'DataQualityFlag'.
 *   - cr664_AuditEvent.eventcategory = Exception (788190007) and
 *     eventtype = ExceptionResolved (788190006) — DQ flag resolution
 *     IS exception remediation in operational terms.
 *   - ChangedBy@odata.bind is required and references systemuser;
 *     ActorUser@odata.bind is populated with the same id. ownerid
 *     also set to current systemuserid.
 *   - correlationid is a fresh per-attempt UUID so an audit row can
 *     be tied back to a specific UI submission.
 */

export type ResolveOutcome =
  | { kind: 'success'; auditEventId: string | undefined }
  | { kind: 'audit-failed'; auditError: string }
  | { kind: 'flag-failed'; flagError: string }
  | { kind: 'unknown'; message: string };

export interface ResolveFlagInput {
  flagId: string;
  flagName: string;
  flagType: string | undefined;
  systemUserId: string;
  resolutionNote: string;
}

/** Cr664 enum values — defined here as constants so the action layer
 *  doesn't depend on the generated enum re-exports for runtime values. */
const RESOLUTION_STATUS_RESOLVED = 788190001;
const EVENT_CATEGORY_EXCEPTION = 788190007;
const EVENT_TYPE_EXCEPTION_RESOLVED = 788190006;
const ENTITY_TYPE_CONFIGURATION = 788190005;
const OUTCOME_SUCCEEDED = 788190000;
const OUTCOME_FAILED = 788190001;

function newCorrelationId(): string {
  // Crypto.randomUUID is supported in modern browsers and Edge runtimes.
  // Falls back to Math.random in the rare case it isn't.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function emitAuditEvent(opts: {
  input: ResolveFlagInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  // Cast through unknown — required fields on the generated Base
  // interface include lookups and an ownerid that the server can
  // default; passing only what we actually populate is acceptable at
  // runtime (Dataverse Web API accepts partial payloads on create).
  const payload = {
    cr664_auditeventname: 'DataQualityFlag Resolved',
    cr664_eventcategory: EVENT_CATEGORY_EXCEPTION,
    cr664_eventtype: EVENT_TYPE_EXCEPTION_RESOLVED,
    cr664_entitytype: ENTITY_TYPE_CONFIGURATION,
    cr664_entityid: opts.input.flagId,
    cr664_relatedentitytype: 'cr664_dataqualityflag',
    cr664_relatedentityid: opts.input.flagId,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_resolutionstatus',
    cr664_oldvalue: 'Open',
    cr664_newvalue: 'Resolved',
    cr664_beforestate: 'Open',
    cr664_afterstate: 'Resolved',
    cr664_notes: opts.input.resolutionNote,
    cr664_sourcescreensourceprocess: 'AdminWorkspace/DataQualityFlags',
    cr664_correlationid: opts.correlationId,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };

  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'AuditEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveDataQualityFlag(
  input: ResolveFlagInput,
): Promise<ResolveOutcome> {
  const note = input.resolutionNote.trim();
  if (note.length === 0) {
    // The UI enforces this, but defensively re-check at the action.
    return { kind: 'unknown', message: 'Resolution note must not be empty.' };
  }

  const correlationId = newCorrelationId();

  // Step 1: update the flag itself.
  let flagUpdateOk = false;
  try {
    const updateResult = await Cr664_dataqualityflagsService.update(input.flagId, {
      cr664_resolutionstatus: RESOLUTION_STATUS_RESOLVED,
      cr664_resolutionnotes: note,
    } as unknown as Parameters<typeof Cr664_dataqualityflagsService.update>[1]);
    if (!updateResult.success) {
      // Emit a Failed audit event so the attempt is recorded, then
      // return flag-failed. Audit failure here is best-effort — the
      // primary outcome is already the flag update failure.
      void emitAuditEvent({
        input,
        correlationId,
        outcome: OUTCOME_FAILED,
        failureReason: updateResult.error?.message ?? 'Unknown flag update error',
      });
      return {
        kind: 'flag-failed',
        flagError: updateResult.error?.message ?? 'Flag update failed',
      };
    }
    flagUpdateOk = true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      correlationId,
      outcome: OUTCOME_FAILED,
      failureReason: message,
    });
    return { kind: 'flag-failed', flagError: message };
  }

  // Step 2: emit a Succeeded audit event. Critical to surface failure
  // here separately — the flag IS updated server-side, but the audit
  // trail is incomplete.
  if (flagUpdateOk) {
    const audit = await emitAuditEvent({
      input,
      correlationId,
      outcome: OUTCOME_SUCCEEDED,
      failureReason: undefined,
    });
    if (audit.error) {
      return { kind: 'audit-failed', auditError: audit.error };
    }
    return { kind: 'success', auditEventId: audit.id };
  }

  return { kind: 'unknown', message: 'Unknown action path.' };
}

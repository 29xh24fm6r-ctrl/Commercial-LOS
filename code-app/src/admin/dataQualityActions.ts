import { Cr664_dataqualityflagsService } from '../generated/services/Cr664_dataqualityflagsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';

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
  /** Acting admin's email — resolved fail-closed to the audit's REQUIRED
   *  cr664_ChangedBy (a cr664_user lookup) via the platform-user bridge.
   *  A systemuser id is NEVER bound into cr664_ChangedBy (Phase 187H / G-5). */
  actorEmail: string;
  resolutionNote: string;
}

/** Cr664 enum values — defined here as constants so the action layer
 *  doesn't depend on the generated enum re-exports for runtime values. */
const RESOLUTION_STATUS_RESOLVED = 788190001;
const EVENT_CATEGORY_EXCEPTION = 788190007;
const EVENT_TYPE_EXCEPTION_RESOLVED = 788190006;
const ENTITY_TYPE_CONFIGURATION = 788190005;

async function emitAuditEvent(opts: {
  input: ResolveFlagInput;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Fail closed: never POST an audit row without a resolved cr664_user actor.
  // No systemuser id is ever bound into cr664_ChangedBy (it targets cr664_user).
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
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
    // The ONLY actor/user bind. REQUIRED, targets cr664_user; value resolved
    // fail-closed from the actor email via the platform-user bridge. No
    // cr664_ActorUser, no ownerid/owneridtype/statecode (server-defaulted).
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_resolutionstatus',
    cr664_oldvalue: 'Open',
    cr664_newvalue: 'Resolved',
    cr664_beforestate: 'Open',
    cr664_afterstate: 'Resolved',
    cr664_notes: opts.input.resolutionNote,
    cr664_sourcescreensourceprocess: 'AdminWorkspace/DataQualityFlags',
    cr664_correlationid: opts.correlationId,
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
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<ResolveOutcome> {
  const note = input.resolutionNote.trim();
  if (note.length === 0) {
    // The UI enforces this, but defensively re-check at the action.
    return { kind: 'unknown', message: 'Resolution note must not be empty.' };
  }

  const correlationId = newCorrelationId('dq');
  // Resolve the audit actor's cr664_user bind once, fail-closed.
  const actor = await resolveActorChangedBy(input.actorEmail);

  // Step 1: update the flag itself.
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
        actor,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: updateResult.error?.message ?? 'Unknown flag update error',
      });
      return {
        kind: 'flag-failed',
        flagError: updateResult.error?.message ?? 'Flag update failed',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
    });
    return { kind: 'flag-failed', flagError: message };
  }

  // Step 2: the flag IS updated server-side now. Emit a Succeeded audit
  // event, surfacing audit failure separately (the flag update stands but
  // the audit trail would be incomplete).
  const audit = await emitAuditEvent({
    input,
    actor,
    correlationId,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });
  if (audit.error) {
    return { kind: 'audit-failed', auditError: audit.error };
  }
  return { kind: 'success', auditEventId: audit.id };
}

/**
 * Phase 171-180 -- Deal origination audit coordination (pure builder).
 *
 * Builds the cr664_AuditEvent payload for an origination step using VERIFIED,
 * pinned option-set values (see src/generated/models/Cr664_auditeventsModel.ts
 * and the existing governed writes). No IO and no SDK import: the actual emit
 * is INJECTED, so this module never writes while disabled and never guesses an
 * enum. A created step with a failed audit is reported honestly upstream
 * (audit_failed_partial), never as success.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';

// Verified cr664_AuditEvent option-set values.
export const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
export const AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE = 788190002;
export const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

export { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED };

export interface OriginationAuditInput {
  readonly eventName: string;
  readonly dealId: string;
  /**
   * The resolved `cr664_ChangedBy@odata.bind` value -- ALWAYS
   * `/cr664_users(<cr664_userid>)`. cr664_ChangedBy is a REQUIRED lookup that
   * targets the custom cr664_user table (NOT systemuser), so a systemuser id can
   * never be bound here. The caller resolves this fail-closed via the
   * platform-user bridge (`newDealAuditActorResolver`) and never builds an audit
   * payload at all when it cannot.
   */
  readonly changedByBind: string;
  /**
   * The actor's Dataverse systemuserid -- recorded for correlation context only.
   * It is NOT bound anywhere: cr664_ChangedBy targets cr664_user, so this id must
   * never reach any @odata.bind.
   */
  readonly actorSystemUserId?: string;
  readonly correlationId: string;
  readonly outcome: number;
  readonly sourceProcess: string;
  readonly notes: string;
  readonly failureReason?: string;
  // Optional change-detail fields (governed New Deal create populates these).
  readonly fieldName?: string;
  readonly oldValue?: string;
  readonly newValue?: string;
  readonly beforeState?: string;
  readonly afterState?: string;
}

/**
 * The allow-listed audit payload keys -- the ONLY keys any New Deal audit
 * payload may contain. Critically:
 *   - `cr664_ChangedBy@odata.bind` is the ONLY user/actor bind. It is REQUIRED
 *     and targets the custom `cr664_user` table, so its value is ALWAYS
 *     `/cr664_users(<cr664_userid>)` -- resolved fail-closed from the actor's
 *     email via the platform-user bridge. A systemuser id is NEVER bound here
 *     (doing so failed the live audit POST: "Entity 'cr664_User' ... Does Not
 *     Exist").
 *   - `cr664_ActorUser@odata.bind` is NOT allow-listed (also targets cr664_user;
 *     redundant with ChangedBy, so it is omitted).
 *   - `ownerid` / `owneridtype` / `statecode` are NOT set on create (Dataverse
 *     defaults them).
 */
export const ORIGINATION_AUDIT_ALLOWED_FIELDS = Object.freeze([
  'cr664_auditeventname',
  'cr664_eventcategory',
  'cr664_eventtype',
  'cr664_entitytype',
  'cr664_entityid',
  'cr664_LoanDeal@odata.bind',
  'cr664_outcomestatus',
  'cr664_failurereason',
  'cr664_changeddate',
  'cr664_ChangedBy@odata.bind',
  'cr664_notes',
  'cr664_sourcescreensourceprocess',
  'cr664_correlationid',
  'cr664_fieldname',
  'cr664_oldvalue',
  'cr664_newvalue',
  'cr664_beforestate',
  'cr664_afterstate',
] as const);

/**
 * THE single canonical New Deal audit payload builder. Both the adapter's live
 * emit and any shared origination audit route through this. The ONLY user bind
 * is `cr664_ChangedBy@odata.bind`, set to the caller-resolved
 * `input.changedByBind` (always `/cr664_users(<cr664_userid>)`); no systemuser
 * bind, no ActorUser, no owner/state. `nowIso` is injected.
 */
export function buildNewDealAuditPayload(
  input: OriginationAuditInput,
  nowIso: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    cr664_auditeventname: input.eventName,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: input.dealId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    cr664_outcomestatus: input.outcome,
    cr664_failurereason: input.failureReason,
    cr664_changeddate: nowIso,
    // The ONLY actor/user bind. REQUIRED, targets cr664_user; the value is the
    // caller-resolved /cr664_users(<id>) bind (never a systemuser id).
    'cr664_ChangedBy@odata.bind': input.changedByBind,
    cr664_notes: input.notes,
    cr664_sourcescreensourceprocess: input.sourceProcess,
    cr664_correlationid: input.correlationId,
  };
  if (input.fieldName !== undefined) payload.cr664_fieldname = input.fieldName;
  if (input.oldValue !== undefined) payload.cr664_oldvalue = input.oldValue;
  if (input.newValue !== undefined) payload.cr664_newvalue = input.newValue;
  if (input.beforeState !== undefined) payload.cr664_beforestate = input.beforeState;
  if (input.afterState !== undefined) payload.cr664_afterstate = input.afterState;
  return payload;
}

/** Back-compat alias -- the canonical builder. */
export const buildOriginationAuditPayload = buildNewDealAuditPayload;

/**
 * Sanitized payload-shape summary for diagnostics: the payload key list plus,
 * for every `@odata.bind`, the TARGET entity set (the segment after `/`). It
 * exposes NO record ids, tokens, or secrets -- only key names and entity-set
 * names -- so it is safe to surface in the UI / logs. Lets a failed audit
 * conclusively show WHICH bind received which target (e.g. whether any user
 * bind other than cr664_ChangedBy is present, or whether ChangedBy itself is
 * being validated against cr664_user).
 */
export function summarizeAuditPayloadShape(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  const binds: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (k.endsWith('@odata.bind') && typeof v === 'string') {
      const m = /^\/([a-zA-Z0-9_]+)\(/.exec(v.trim());
      binds.push(`${k}->${m ? m[1] : 'unknown'}`);
    }
  }
  return `auditPayload keys=[${keys.join(',')}]; binds=[${binds.sort().join(',')}]`;
}

/** Injected emit; default deps in the orchestrator never enable a live emit. */
export type EmitOriginationAudit = (
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; id?: string; error?: string }>;

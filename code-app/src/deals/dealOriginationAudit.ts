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
  readonly actorSystemUserId: string;
  readonly correlationId: string;
  readonly outcome: number;
  readonly sourceProcess: string;
  readonly notes: string;
  readonly failureReason?: string;
}

/**
 * The allow-listed audit payload keys. `ownerid` / `owneridtype` / `statecode`
 * are intentionally NOT set on create -- Dataverse defaults the owner to the
 * calling user and state to Active, exactly like the governed loan-deal create.
 * Setting them on create is what made the first live banker proof's audit POST
 * fail (audit_failed_partial). The actor is recorded via cr664_ChangedBy.
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
  'cr664_ActorUser@odata.bind',
  'cr664_notes',
  'cr664_sourcescreensourceprocess',
  'cr664_correlationid',
] as const);

/**
 * Build the audit payload. `nowIso` is injected for determinism (no clock
 * dependency here). Binds cr664_ChangedBy to /systemusers(<actor>); never a
 * hardcoded GUID.
 */
export function buildOriginationAuditPayload(
  input: OriginationAuditInput,
  nowIso: string,
): Record<string, unknown> {
  return {
    cr664_auditeventname: input.eventName,
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_ASSIGNMENT_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: input.dealId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    cr664_outcomestatus: input.outcome,
    cr664_failurereason: input.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${input.actorSystemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${input.actorSystemUserId})`,
    cr664_notes: input.notes,
    cr664_sourcescreensourceprocess: input.sourceProcess,
    cr664_correlationid: input.correlationId,
    // ownerid / owneridtype / statecode intentionally omitted (Dataverse
    // defaults them on create; setting them rejected the live audit POST).
  };
}

/** Injected emit; default deps in the orchestrator never enable a live emit. */
export type EmitOriginationAudit = (
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; id?: string; error?: string }>;

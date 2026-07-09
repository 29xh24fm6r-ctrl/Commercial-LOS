/**
 * Phase 261 (B) — governed CRM write adapters.
 *
 * Lets a banker actually operate the CRM: add a company, add a contact (with
 * email/phone contact points), log an activity (call / email / meeting / note),
 * create a follow-up task, and add a relationship. Every write follows the same
 * governed discipline as the rest of the app:
 *
 *   fail-closed authorization → required-field validation → Dataverse identity
 *   → create → readback verification → CRM audit entry (actor + action +
 *   timestamp + correlation id + entity ref) → discriminated outcome.
 *
 * Pure over injected dependencies (SDK-free static graph); a live factory wires
 * the generated cr664_crm* services via dynamic import. No fabricated records:
 * a contact's email/phone contact points are best-effort and their failures are
 * surfaced, never hidden.
 */

import { newCorrelationId } from '../../shared/governance/correlationId';
import { isValidPartyType } from '../crmPartyTypes';
import { isNaicsCode6 } from '../naics/naicsSectorMap';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CrmActor {
  readonly actorEmail?: string;
  readonly actorSystemUserId?: string;
  readonly authorized: boolean;
}

export interface WriteResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

export interface ReadResult {
  readonly success: boolean;
  readonly data?: { readonly cr664_name?: string };
  readonly error?: { readonly message?: string };
}

export type CrmEntityKind = 'organization' | 'person' | 'relationship' | 'timeline';

export interface ChildWriteError {
  readonly kind: string;
  readonly label: string;
  readonly error: string;
}

export type CrmWriteOutcome =
  | { kind: 'success'; id: string; correlationId: string; auditId: string | undefined; childErrors: readonly ChildWriteError[] }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  // The record WAS created (readback runs after a successful create) but could not be verified.
  // Carries the id so the UI can point at it and NOT prompt a retry (which would duplicate).
  | { kind: 'readback-mismatch'; correlationId: string; id: string }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string; id: string };

export interface CrmWriteDeps {
  readonly createOrganization: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readOrganization: (id: string) => Promise<ReadResult>;
  readonly createPerson: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readPerson: (id: string) => Promise<ReadResult>;
  readonly createRelationship: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readRelationship: (id: string) => Promise<ReadResult>;
  readonly createTimelineEvent: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly readTimelineEvent: (id: string) => Promise<ReadResult>;
  readonly createContactPoint: (payload: Record<string, unknown>) => Promise<WriteResult>;
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

export function authGate(actor: CrmActor): { ok: true } | { ok: false; outcome: CrmWriteOutcome } {
  if (!actor.authorized) {
    return { ok: false, outcome: { kind: 'unauthorized', reason: 'You are not authorized to update the CRM.' } };
  }
  if (trimmed(actor.actorSystemUserId).length === 0 || trimmed(actor.actorEmail).length === 0) {
    return {
      ok: false,
      outcome: {
        kind: 'identity-unresolved',
        reason: 'No Dataverse identity is available for the signed-in user; nothing was saved.',
      },
    };
  }
  return { ok: true };
}

export function buildAuditPayload(opts: {
  entityKind: CrmEntityKind;
  entityId: string;
  action: string;
  name: string;
  actorEmail: string;
  correlationId: string;
  nowIso: string;
}): Record<string, unknown> {
  return {
    cr664_name: `${opts.action}: ${opts.name}`,
    cr664_actor: opts.actorEmail,
    cr664_action: opts.action,
    cr664_entitytype: opts.entityKind,
    cr664_entityid: opts.entityId,
    cr664_newvaluesummary: opts.name,
    cr664_timestamp: opts.nowIso,
    cr664_reason: `${opts.action} · correlation ${opts.correlationId}`,
  };
}

/**
 * Shared create → readback → audit pipeline. `create`/`read` are bound to the
 * right entity; `extraChildren` runs after readback (best-effort) for things
 * like a contact's email/phone contact points.
 */
async function governedCreate(opts: {
  actor: CrmActor;
  entityKind: CrmEntityKind;
  action: string;
  displayName: string;
  payload: Record<string, unknown>;
  create: (payload: Record<string, unknown>) => Promise<WriteResult>;
  read: (id: string) => Promise<ReadResult>;
  emitAudit: (payload: Record<string, unknown>) => Promise<WriteResult>;
  extraChildren?: (id: string) => Promise<ChildWriteError[]>;
}): Promise<CrmWriteOutcome> {
  const gate = authGate(opts.actor);
  if (!gate.ok) return gate.outcome;

  const correlationId = newCorrelationId('crm');
  const actorEmail = trimmed(opts.actor.actorEmail);

  let created: WriteResult;
  try {
    created = await opts.create(opts.payload);
  } catch (err: unknown) {
    return { kind: 'write-failed', error: err instanceof Error ? err.message : String(err), correlationId };
  }
  if (!created.success || !created.id) {
    return { kind: 'write-failed', error: created.error?.message ?? 'Create returned non-success.', correlationId };
  }
  const id = created.id;

  let readback: ReadResult;
  try {
    readback = await opts.read(id);
  } catch {
    return { kind: 'readback-mismatch', correlationId, id };
  }
  if (!readback.success || trimmed(readback.data?.cr664_name).length === 0) {
    return { kind: 'readback-mismatch', correlationId, id };
  }

  const childErrors = opts.extraChildren ? await opts.extraChildren(id) : [];

  const nowIso = new Date().toISOString();
  let audit: WriteResult;
  try {
    audit = await opts.emitAudit(
      buildAuditPayload({
        entityKind: opts.entityKind,
        entityId: id,
        action: opts.action,
        name: opts.displayName,
        actorEmail,
        correlationId,
        nowIso,
      }),
    );
  } catch (err: unknown) {
    return { kind: 'audit-failed', auditError: err instanceof Error ? err.message : String(err), correlationId, id };
  }
  if (!audit.success) {
    return { kind: 'audit-failed', auditError: audit.error?.message ?? 'Audit returned non-success.', correlationId, id };
  }

  return { kind: 'success', id, correlationId, auditId: audit.id, childErrors };
}

// ---------------------------------------------------------------------------
// Add Company (cr664_crmorganizations)
// ---------------------------------------------------------------------------

export interface AddCompanyInput extends CrmActor {
  readonly name: string;
  readonly legalName?: string;
  readonly dbaName?: string;
  /** Validated against CRM_PARTY_TYPES on write; off-list values are rejected. */
  readonly organizationType?: string;
  readonly industry?: string;
  /** 6-digit NAICS code (validated; sector derived at read). Persisted to cr664_naicscode. */
  readonly naicsCode?: string;
  readonly website?: string;
  readonly status?: string;
  readonly notes?: string;
}

export async function addCompany(input: AddCompanyInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const name = trimmed(input.name);
  if (name.length === 0) return { kind: 'invalid-input', reason: 'Company name is required.' };
  const organizationType = trimmed(input.organizationType);
  if (organizationType.length > 0 && !isValidPartyType(organizationType)) {
    return { kind: 'invalid-input', reason: `"${organizationType}" is not an allowed party Type.` };
  }
  const naicsCode = trimmed(input.naicsCode);
  if (naicsCode.length > 0 && !isNaicsCode6(naicsCode)) {
    return { kind: 'invalid-input', reason: 'NAICS code must be a 6-digit value.' };
  }
  const payload = compact({
    cr664_name: name,
    cr664_displayname: name,
    cr664_legalname: trimmed(input.legalName) || name,
    cr664_dbaname: trimmed(input.dbaName),
    cr664_organizationtype: organizationType,
    cr664_industry: trimmed(input.industry),
    cr664_naicscode: naicsCode,
    cr664_website: trimmed(input.website),
    cr664_status: trimmed(input.status) || 'Active',
    cr664_notes: trimmed(input.notes),
  });
  return governedCreate({
    actor: input,
    entityKind: 'organization',
    action: 'crm-add-company',
    displayName: name,
    payload,
    create: deps.createOrganization,
    read: deps.readOrganization,
    emitAudit: deps.emitAudit,
  });
}

// ---------------------------------------------------------------------------
// Add Contact (cr664_crmpersons) + optional email/phone contact points
// ---------------------------------------------------------------------------

export interface AddContactInput extends CrmActor {
  readonly firstName?: string;
  readonly lastName?: string;
  /** Optional explicit display name; otherwise derived from first/last. */
  readonly fullName?: string;
  readonly title?: string;
  readonly status?: string;
  readonly notes?: string;
  readonly employerOrganizationId?: string;
  readonly email?: string;
  readonly phone?: string;
}

function contactDisplayName(input: AddContactInput): string {
  const explicit = trimmed(input.fullName);
  if (explicit.length > 0) return explicit;
  return [trimmed(input.firstName), trimmed(input.lastName)].filter((p) => p.length > 0).join(' ').trim();
}

export async function addContact(input: AddContactInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const name = contactDisplayName(input);
  if (name.length === 0) return { kind: 'invalid-input', reason: 'A contact name (first/last or full name) is required.' };

  const payload = compact({
    cr664_name: name,
    cr664_displayname: name,
    cr664_firstname: trimmed(input.firstName),
    cr664_lastname: trimmed(input.lastName),
    cr664_title: trimmed(input.title),
    cr664_status: trimmed(input.status) || 'Active',
    cr664_notes: trimmed(input.notes),
    ...(trimmed(input.employerOrganizationId).length > 0
      ? { 'cr664_EmployerOrganization@odata.bind': `/cr664_crmorganizations(${trimmed(input.employerOrganizationId)})` }
      : {}),
  });

  return governedCreate({
    actor: input,
    entityKind: 'person',
    action: 'crm-add-contact',
    displayName: name,
    payload,
    create: deps.createPerson,
    read: deps.readPerson,
    emitAudit: deps.emitAudit,
    extraChildren: async (personId) => {
      const errors: ChildWriteError[] = [];
      const points: Array<{ type: 'email' | 'phone'; value: string }> = [];
      if (trimmed(input.email).length > 0) points.push({ type: 'email', value: trimmed(input.email) });
      if (trimmed(input.phone).length > 0) points.push({ type: 'phone', value: trimmed(input.phone) });
      for (const p of points) {
        try {
          const res = await deps.createContactPoint(
            compact({
              cr664_name: `${name} — ${p.type}`,
              cr664_value: p.value,
              cr664_contacttype: p.type,
              'cr664_Person@odata.bind': `/cr664_crmpersons(${personId})`,
            }),
          );
          if (!res.success) errors.push({ kind: `contact-point-${p.type}`, label: p.value, error: res.error?.message ?? 'non-success' });
        } catch (err: unknown) {
          errors.push({ kind: `contact-point-${p.type}`, label: p.value, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return errors;
    },
  });
}

// ---------------------------------------------------------------------------
// Log Activity (cr664_crmtimelineevents)
// ---------------------------------------------------------------------------

export type CrmActivityType = 'call' | 'email' | 'meeting' | 'note';

export interface LogActivityInput extends CrmActor {
  readonly activityType: CrmActivityType;
  readonly summary: string;
  readonly occurredAt?: string;
  readonly outcome?: string;
  readonly nextFollowUpDate?: string;
  readonly organizationId?: string;
  readonly personId?: string;
  readonly originatedDealId?: string;
}

const ACTIVITY_LABEL: Record<CrmActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
};

export async function logActivity(input: LogActivityInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const summary = trimmed(input.summary);
  if (summary.length === 0) return { kind: 'invalid-input', reason: 'An activity summary is required.' };
  const occurredAt = trimmed(input.occurredAt) || new Date().toISOString();
  const label = ACTIVITY_LABEL[input.activityType] ?? 'Activity';
  const followUp = trimmed(input.nextFollowUpDate);
  const outcome = trimmed(input.outcome);
  const notesParts = [outcome ? `Outcome: ${outcome}` : '', followUp ? `Next follow-up: ${followUp}` : ''].filter(Boolean);

  const payload = compact({
    cr664_name: `${label}: ${summary.slice(0, 80)}`,
    cr664_eventtype: input.activityType,
    cr664_summary: summary,
    cr664_actor: trimmed(input.actorEmail),
    cr664_occurredat: occurredAt,
    cr664_notes: notesParts.join(' · '),
    ...(trimmed(input.organizationId).length > 0
      ? { 'cr664_Organization@odata.bind': `/cr664_crmorganizations(${trimmed(input.organizationId)})` }
      : {}),
    ...(trimmed(input.personId).length > 0
      ? { 'cr664_Person@odata.bind': `/cr664_crmpersons(${trimmed(input.personId)})` }
      : {}),
    ...(trimmed(input.originatedDealId).length > 0
      ? { 'cr664_OriginatedLoanDeal@odata.bind': `/cr664_loandeals(${trimmed(input.originatedDealId)})` }
      : {}),
  });

  return governedCreate({
    actor: input,
    entityKind: 'timeline',
    action: 'crm-log-activity',
    displayName: `${label}: ${summary}`,
    payload,
    create: deps.createTimelineEvent,
    read: deps.readTimelineEvent,
    emitAudit: deps.emitAudit,
  });
}

// ---------------------------------------------------------------------------
// Create Follow-up Task (cr664_crmtimelineevents, eventtype = follow-up-task)
// ---------------------------------------------------------------------------

export interface FollowUpTaskInput extends CrmActor {
  readonly title: string;
  readonly dueDate?: string;
  readonly notes?: string;
  readonly organizationId?: string;
  readonly personId?: string;
}

export async function createFollowUpTask(input: FollowUpTaskInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const title = trimmed(input.title);
  if (title.length === 0) return { kind: 'invalid-input', reason: 'A task title is required.' };
  const due = trimmed(input.dueDate);

  const payload = compact({
    cr664_name: `Follow-up: ${title}`,
    cr664_eventtype: 'follow-up-task',
    cr664_summary: title,
    cr664_actor: trimmed(input.actorEmail),
    // The due date is stored as the event's occurredat so it sorts into the timeline.
    cr664_occurredat: due || new Date().toISOString(),
    cr664_notes: trimmed(input.notes),
    ...(trimmed(input.organizationId).length > 0
      ? { 'cr664_Organization@odata.bind': `/cr664_crmorganizations(${trimmed(input.organizationId)})` }
      : {}),
    ...(trimmed(input.personId).length > 0
      ? { 'cr664_Person@odata.bind': `/cr664_crmpersons(${trimmed(input.personId)})` }
      : {}),
  });

  return governedCreate({
    actor: input,
    entityKind: 'timeline',
    action: 'crm-create-followup-task',
    displayName: title,
    payload,
    create: deps.createTimelineEvent,
    read: deps.readTimelineEvent,
    emitAudit: deps.emitAudit,
  });
}

// ---------------------------------------------------------------------------
// Add Relationship (cr664_crmrelationships)
// ---------------------------------------------------------------------------

export interface AddRelationshipInput extends CrmActor {
  readonly name: string;
  readonly relationshipType?: string;
  readonly role?: string;
  readonly sourceOrganizationId?: string;
  readonly sourcePersonId?: string;
  readonly targetOrganizationId?: string;
  readonly targetPersonId?: string;
  readonly originatedDealId?: string;
  readonly boardedLoanId?: string;
  readonly notes?: string;
}

export async function addRelationship(input: AddRelationshipInput, deps: CrmWriteDeps): Promise<CrmWriteOutcome> {
  const name = trimmed(input.name);
  if (name.length === 0) return { kind: 'invalid-input', reason: 'A relationship name is required.' };

  const payload = compact({
    cr664_name: name,
    cr664_relationshiptype: trimmed(input.relationshipType),
    cr664_role: trimmed(input.role),
    cr664_active: true,
    cr664_notes: trimmed(input.notes),
    ...(trimmed(input.sourceOrganizationId).length > 0
      ? { 'cr664_SourceOrganization@odata.bind': `/cr664_crmorganizations(${trimmed(input.sourceOrganizationId)})` }
      : {}),
    ...(trimmed(input.sourcePersonId).length > 0
      ? { 'cr664_SourcePerson@odata.bind': `/cr664_crmpersons(${trimmed(input.sourcePersonId)})` }
      : {}),
    ...(trimmed(input.targetOrganizationId).length > 0
      ? { 'cr664_TargetOrganization@odata.bind': `/cr664_crmorganizations(${trimmed(input.targetOrganizationId)})` }
      : {}),
    ...(trimmed(input.targetPersonId).length > 0
      ? { 'cr664_TargetPerson@odata.bind': `/cr664_crmpersons(${trimmed(input.targetPersonId)})` }
      : {}),
    ...(trimmed(input.originatedDealId).length > 0
      ? { 'cr664_OriginatedLoanDeal@odata.bind': `/cr664_loandeals(${trimmed(input.originatedDealId)})` }
      : {}),
    ...(trimmed(input.boardedLoanId).length > 0
      ? { 'cr664_BoardedLoan@odata.bind': `/cr664_portfolioboardedloans(${trimmed(input.boardedLoanId)})` }
      : {}),
  });

  return governedCreate({
    actor: input,
    entityKind: 'relationship',
    action: 'crm-add-relationship',
    displayName: name,
    payload,
    create: deps.createRelationship,
    read: deps.readRelationship,
    emitAudit: deps.emitAudit,
  });
}

// ---------------------------------------------------------------------------
// Live dependencies (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveCrmWriteDeps(): CrmWriteDeps {
  return {
    createOrganization: async (payload) => {
      const { Cr664_crmorganizationsService: s } = await import('../../generated/services/Cr664_crmorganizationsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmorganizationid, error: r.error ?? undefined };
    },
    readOrganization: async (id) => {
      const { Cr664_crmorganizationsService: s } = await import('../../generated/services/Cr664_crmorganizationsService');
      const r = await s.get(id, { select: ['cr664_name'] });
      return { success: r.success, data: r.data ?? undefined, error: r.error ?? undefined };
    },
    createPerson: async (payload) => {
      const { Cr664_crmpersonsService: s } = await import('../../generated/services/Cr664_crmpersonsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmpersonid, error: r.error ?? undefined };
    },
    readPerson: async (id) => {
      const { Cr664_crmpersonsService: s } = await import('../../generated/services/Cr664_crmpersonsService');
      const r = await s.get(id, { select: ['cr664_name'] });
      return { success: r.success, data: r.data ?? undefined, error: r.error ?? undefined };
    },
    createRelationship: async (payload) => {
      const { Cr664_crmrelationshipsService: s } = await import('../../generated/services/Cr664_crmrelationshipsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmrelationshipid, error: r.error ?? undefined };
    },
    readRelationship: async (id) => {
      const { Cr664_crmrelationshipsService: s } = await import('../../generated/services/Cr664_crmrelationshipsService');
      const r = await s.get(id, { select: ['cr664_name'] });
      return { success: r.success, data: r.data ?? undefined, error: r.error ?? undefined };
    },
    createTimelineEvent: async (payload) => {
      const { Cr664_crmtimelineeventsService: s } = await import('../../generated/services/Cr664_crmtimelineeventsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmtimelineeventid, error: r.error ?? undefined };
    },
    readTimelineEvent: async (id) => {
      const { Cr664_crmtimelineeventsService: s } = await import('../../generated/services/Cr664_crmtimelineeventsService');
      const r = await s.get(id, { select: ['cr664_name'] });
      return { success: r.success, data: r.data ?? undefined, error: r.error ?? undefined };
    },
    createContactPoint: async (payload) => {
      const { Cr664_crmcontactpointsService: s } = await import('../../generated/services/Cr664_crmcontactpointsService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmcontactpointid, error: r.error ?? undefined };
    },
    emitAudit: async (payload) => {
      const { Cr664_crmauditentriesService: s } = await import('../../generated/services/Cr664_crmauditentriesService');
      const r = await s.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmauditentryid, error: r.error ?? undefined };
    },
  };
}

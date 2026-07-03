/**
 * Phase 258 — CRM Hub workspace data layer.
 *
 * Reads the 10 internal CRM tables live and projects each row to a generic
 * {@link CrmRecord} the workspace renders as cards, lists, a detail drawer, and
 * an activity timeline. Pure mappers (type-only model imports — SDK-free static
 * graph); the live loader dynamic-imports the generated services so the SDK is
 * pulled only when a real read runs. Fail-closed PER DOMAIN: one table read
 * failing leaves the other domains intact (honest per-domain unavailable state).
 * Read-only — no writes (CRM live-write transport is not wired today).
 */

import type { Cr664_crmorganizations } from '../../generated/models/Cr664_crmorganizationsModel';
import type { Cr664_crmpersons } from '../../generated/models/Cr664_crmpersonsModel';
import type { Cr664_crmrelationships } from '../../generated/models/Cr664_crmrelationshipsModel';
import type { Cr664_crmroleassignments } from '../../generated/models/Cr664_crmroleassignmentsModel';
import type { Cr664_crmcontactpoints } from '../../generated/models/Cr664_crmcontactpointsModel';
import type { Cr664_crmcommunicationpreferences } from '../../generated/models/Cr664_crmcommunicationpreferencesModel';
import type { Cr664_crmcontactauthorizations } from '../../generated/models/Cr664_crmcontactauthorizationsModel';
import type { Cr664_crmvendorprofiles } from '../../generated/models/Cr664_crmvendorprofilesModel';
import type { Cr664_crmtimelineevents } from '../../generated/models/Cr664_crmtimelineeventsModel';
import type { Cr664_crmauditentries } from '../../generated/models/Cr664_crmauditentriesModel';

const ROW_CAP = 200;

export type CrmDomainKey =
  | 'organizations'
  | 'people'
  | 'relationships'
  | 'roleAssignments'
  | 'contactPoints'
  | 'communicationPreferences'
  | 'contactAuthorizations'
  | 'vendorProfiles'
  | 'timelineEvents'
  | 'auditEntries';

export interface CrmDomainSpec {
  readonly key: CrmDomainKey;
  /** Bank-user label, singular noun for the "no records" empty state. */
  readonly label: string;
  readonly singular: string;
  /** True for the activity/timeline feed domains (chronological). */
  readonly timeline?: boolean;
}

export const CRM_DOMAINS: readonly CrmDomainSpec[] = Object.freeze([
  { key: 'organizations', label: 'Organizations', singular: 'organization' },
  { key: 'people', label: 'People', singular: 'person' },
  { key: 'relationships', label: 'Relationships', singular: 'relationship' },
  { key: 'roleAssignments', label: 'Role assignments', singular: 'role assignment' },
  { key: 'contactPoints', label: 'Contact points', singular: 'contact point' },
  { key: 'communicationPreferences', label: 'Communication preferences', singular: 'preference' },
  { key: 'contactAuthorizations', label: 'Contact authorizations', singular: 'authorization' },
  { key: 'vendorProfiles', label: 'Vendors', singular: 'vendor' },
  { key: 'timelineEvents', label: 'Activity', singular: 'activity event', timeline: true },
  { key: 'auditEntries', label: 'Audit', singular: 'audit entry', timeline: true },
]);

export interface CrmDetailRow {
  readonly label: string;
  readonly value: string;
}

export interface CrmRecord {
  readonly id: string;
  /** Primary display name. */
  readonly title: string;
  /** Secondary line (type / role / category). */
  readonly subtitle?: string;
  /** Short status chip. */
  readonly badge?: string;
  /** Detail-drawer rows. */
  readonly detail: readonly CrmDetailRow[];
  /** ISO timestamp for timeline ordering (timeline/audit domains). */
  readonly occurredAt?: string;
  /**
   * Related-organization id, threaded through from the raw record's lookup so the
   * detail drawer can filter the already-loaded workspace data by a selected
   * company — NO new reads. People carry their employer org; timeline events carry
   * their linked org.
   */
  readonly organizationId?: string;
  /** Related-person id (timeline events linked to a contact). */
  readonly personId?: string;
  /** Timeline event type: 'call' | 'email' | 'meeting' | 'note' are activities; 'follow-up-task' is a task. */
  readonly eventType?: string;
}

export interface CrmDomainResult {
  readonly status: 'ready' | 'failed';
  readonly records: readonly CrmRecord[];
  readonly error?: string;
}

export type CrmWorkspaceData = Record<CrmDomainKey, CrmDomainResult>;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function s(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function yn(v: unknown): string | undefined {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return undefined;
}

function pick(rows: Array<CrmDetailRow | undefined>): readonly CrmDetailRow[] {
  return rows.filter((r): r is CrmDetailRow => r !== undefined);
}

function row(label: string, value: string | undefined): CrmDetailRow | undefined {
  return value === undefined ? undefined : { label, value };
}

// ---------------------------------------------------------------------------
// Per-domain mappers (pure, exported for tests)
// ---------------------------------------------------------------------------

export function mapOrganization(o: Cr664_crmorganizations): CrmRecord {
  return {
    id: o.cr664_crmorganizationid,
    title: s(o.cr664_displayname) ?? s(o.cr664_name) ?? s(o.cr664_legalname) ?? 'Organization',
    subtitle: s(o.cr664_industry) ?? s(o.cr664_organizationtype),
    badge: s(o.cr664_status) ?? o.statecodename,
    detail: pick([
      row('Legal name', s(o.cr664_legalname)),
      row('DBA', s(o.cr664_dbaname)),
      row('Type', s(o.cr664_organizationtype)),
      row('Industry', s(o.cr664_industry)),
      row('State of formation', s(o.cr664_stateofformation)),
      row('Website', s(o.cr664_website)),
      row('Tax ID on file', yn(o.cr664_taxidpresent)),
      row('Status', s(o.cr664_status)),
    ]),
  };
}

export function mapPerson(p: Cr664_crmpersons): CrmRecord {
  const fullName = [s(p.cr664_firstname), s(p.cr664_lastname)].filter(Boolean).join(' ');
  return {
    id: p.cr664_crmpersonid,
    title: s(p.cr664_displayname) ?? s(p.cr664_name) ?? (fullName.length > 0 ? fullName : 'Person'),
    subtitle: s(p.cr664_title) ?? s(p.cr664_rolesummary),
    badge: s(p.cr664_status),
    organizationId: s(p._cr664_employerorganization_value),
    detail: pick([
      row('First name', s(p.cr664_firstname)),
      row('Last name', s(p.cr664_lastname)),
      row('Title', s(p.cr664_title)),
      row('Role summary', s(p.cr664_rolesummary)),
      row('Status', s(p.cr664_status)),
    ]),
  };
}

export function mapRelationship(r: Cr664_crmrelationships): CrmRecord {
  return {
    id: r.cr664_crmrelationshipid,
    title: s(r.cr664_name) ?? s(r.cr664_relationshiptype) ?? 'Relationship',
    subtitle: s(r.cr664_role) ?? s(r.cr664_relationshiptype),
    badge: r.cr664_active === false ? 'Inactive' : r.cr664_active === true ? 'Active' : undefined,
    detail: pick([
      row('Type', s(r.cr664_relationshiptype)),
      row('Role', s(r.cr664_role)),
      row('From', s(r.cr664_sourceentitytype)),
      row('To', s(r.cr664_targetentitytype)),
      row('Start', s(r.cr664_startdate)),
      row('End', s(r.cr664_enddate)),
    ]),
  };
}

export function mapRoleAssignment(r: Cr664_crmroleassignments): CrmRecord {
  return {
    id: r.cr664_crmroleassignmentid,
    title: s(r.cr664_roletype) ?? s(r.cr664_name) ?? 'Role assignment',
    subtitle: s(r.cr664_authoritylevel),
    badge: r.cr664_active === false ? 'Inactive' : r.cr664_active === true ? 'Active' : undefined,
    detail: pick([
      row('Role type', s(r.cr664_roletype)),
      row('Authority level', s(r.cr664_authoritylevel)),
      row('On entity', s(r.cr664_entitytype)),
      row('Assigned to', s(r.cr664_assignedtotype)),
      row('Start', s(r.cr664_startdate)),
      row('End', s(r.cr664_enddate)),
    ]),
  };
}

export function mapContactPoint(c: Cr664_crmcontactpoints): CrmRecord {
  return {
    id: c.cr664_crmcontactpointid,
    title: s(c.cr664_value) ?? s(c.cr664_name) ?? 'Contact point',
    subtitle: s(c.cr664_contacttype) ?? s(c.cr664_label),
    badge: c.cr664_preferred === true ? 'Preferred' : c.cr664_donotcontact === true ? 'Do not contact' : undefined,
    detail: pick([
      row('Type', s(c.cr664_contacttype)),
      row('Value', s(c.cr664_value)),
      row('Label', s(c.cr664_label)),
      row('Verified', yn(c.cr664_verified)),
      row('Preferred', yn(c.cr664_preferred)),
      row('Do not contact', yn(c.cr664_donotcontact)),
    ]),
  };
}

export function mapCommunicationPreference(p: Cr664_crmcommunicationpreferences): CrmRecord {
  return {
    id: p.cr664_crmcommunicationpreferenceid,
    title: s(p.cr664_preferredmethod) ?? s(p.cr664_name) ?? 'Communication preference',
    subtitle: s(p.cr664_consentstatus),
    badge: s(p.cr664_consentstatus),
    detail: pick([
      row('Preferred method', s(p.cr664_preferredmethod)),
      row('Consent status', s(p.cr664_consentstatus)),
      row('Owner type', s(p.cr664_ownertype)),
      row('Effective date', s(p.cr664_effectivedate)),
      row('Expires at', s(p.cr664_expiresat)),
    ]),
  };
}

export function mapContactAuthorization(a: Cr664_crmcontactauthorizations): CrmRecord {
  return {
    id: a.cr664_crmcontactauthorizationid,
    title: s(a.cr664_name) ?? 'Contact authorization',
    subtitle: s(a.cr664_ownertype),
    detail: pick([
      row('Financial requests', yn(a.cr664_authorizedforfinancialrequests)),
      row('Upload links', yn(a.cr664_authorizedforuploadlinks)),
      row('Loan notices', yn(a.cr664_authorizedforloannotices)),
      row('Servicing requests', yn(a.cr664_authorizedforservicingrequests)),
      row('Authorization date', s(a.cr664_authorizationdate)),
      row('Expires at', s(a.cr664_expiresat)),
    ]),
  };
}

export function mapVendorProfile(v: Cr664_crmvendorprofiles): CrmRecord {
  return {
    id: v.cr664_crmvendorprofileid,
    title: s(v.cr664_name) ?? 'Vendor',
    subtitle: s(v.cr664_vendortype),
    badge: v.cr664_approvedvendor === true ? 'Approved' : s(v.cr664_approvalstatus),
    detail: pick([
      row('Vendor type', s(v.cr664_vendortype)),
      row('Approval status', s(v.cr664_approvalstatus)),
      row('Approved vendor', yn(v.cr664_approvedvendor)),
      row('Insurance on file', yn(v.cr664_insuranceonfile)),
      row('Approval date', s(v.cr664_approvaldate)),
      row('Expiration date', s(v.cr664_expirationdate)),
    ]),
  };
}

export function mapTimelineEvent(t: Cr664_crmtimelineevents): CrmRecord {
  return {
    id: t.cr664_crmtimelineeventid,
    title: s(t.cr664_eventtype) ?? s(t.cr664_name) ?? 'Activity',
    subtitle: s(t.cr664_summary),
    badge: s(t.cr664_entitytype),
    occurredAt: s(t.cr664_occurredat),
    organizationId: s(t._cr664_organization_value),
    personId: s(t._cr664_person_value),
    eventType: s(t.cr664_eventtype),
    detail: pick([
      row('Event type', s(t.cr664_eventtype)),
      row('Summary', s(t.cr664_summary)),
      row('Actor', s(t.cr664_actor)),
      row('On entity', s(t.cr664_entitytype)),
      row('Occurred at', s(t.cr664_occurredat)),
    ]),
  };
}

export function mapAuditEntry(a: Cr664_crmauditentries): CrmRecord {
  return {
    id: a.cr664_crmauditentryid,
    title: s(a.cr664_action) ?? s(a.cr664_name) ?? 'Audit entry',
    subtitle: s(a.cr664_fieldkey) ?? s(a.cr664_entitytype),
    badge: a.cr664_redacted === true ? 'Redacted' : s(a.cr664_entitytype),
    occurredAt: s(a.cr664_timestamp),
    detail: pick([
      row('Action', s(a.cr664_action)),
      row('Actor', s(a.cr664_actor)),
      row('On entity', s(a.cr664_entitytype)),
      row('Field', s(a.cr664_fieldkey)),
      row('Reason', s(a.cr664_reason)),
      row('Timestamp', s(a.cr664_timestamp)),
    ]),
  };
}

// ---------------------------------------------------------------------------
// Live loader (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

function sortTimeline(records: CrmRecord[]): CrmRecord[] {
  return records.slice().sort((a, b) => {
    const at = a.occurredAt ? Date.parse(a.occurredAt) : 0;
    const bt = b.occurredAt ? Date.parse(b.occurredAt) : 0;
    return bt - at; // newest first
  });
}

/** Run one domain's read+map, fail-closed to a `failed` result. */
async function loadDomain(
  load: () => Promise<CrmRecord[]>,
  timeline: boolean,
): Promise<CrmDomainResult> {
  try {
    const records = await load();
    return { status: 'ready', records: timeline ? sortTimeline(records) : records };
  } catch (err: unknown) {
    return { status: 'failed', records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function loadCrmWorkspaceData(): Promise<CrmWorkspaceData> {
  const [
    organizations,
    people,
    relationships,
    roleAssignments,
    contactPoints,
    communicationPreferences,
    contactAuthorizations,
    vendorProfiles,
    timelineEvents,
    auditEntries,
  ] = await Promise.all([
    loadDomain(async () => {
      const { Cr664_crmorganizationsService } = await import('../../generated/services/Cr664_crmorganizationsService');
      const r = await Cr664_crmorganizationsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Organizations read failed');
      return (r.data ?? []).map(mapOrganization);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmpersonsService } = await import('../../generated/services/Cr664_crmpersonsService');
      const r = await Cr664_crmpersonsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'People read failed');
      return (r.data ?? []).map(mapPerson);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmrelationshipsService } = await import('../../generated/services/Cr664_crmrelationshipsService');
      const r = await Cr664_crmrelationshipsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Relationships read failed');
      return (r.data ?? []).map(mapRelationship);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmroleassignmentsService } = await import('../../generated/services/Cr664_crmroleassignmentsService');
      const r = await Cr664_crmroleassignmentsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Role assignments read failed');
      return (r.data ?? []).map(mapRoleAssignment);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmcontactpointsService } = await import('../../generated/services/Cr664_crmcontactpointsService');
      const r = await Cr664_crmcontactpointsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Contact points read failed');
      return (r.data ?? []).map(mapContactPoint);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmcommunicationpreferencesService } = await import('../../generated/services/Cr664_crmcommunicationpreferencesService');
      const r = await Cr664_crmcommunicationpreferencesService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Communication preferences read failed');
      return (r.data ?? []).map(mapCommunicationPreference);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmcontactauthorizationsService } = await import('../../generated/services/Cr664_crmcontactauthorizationsService');
      const r = await Cr664_crmcontactauthorizationsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Contact authorizations read failed');
      return (r.data ?? []).map(mapContactAuthorization);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmvendorprofilesService } = await import('../../generated/services/Cr664_crmvendorprofilesService');
      const r = await Cr664_crmvendorprofilesService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Vendors read failed');
      return (r.data ?? []).map(mapVendorProfile);
    }, false),
    loadDomain(async () => {
      const { Cr664_crmtimelineeventsService } = await import('../../generated/services/Cr664_crmtimelineeventsService');
      const r = await Cr664_crmtimelineeventsService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Activity read failed');
      return (r.data ?? []).map(mapTimelineEvent);
    }, true),
    loadDomain(async () => {
      const { Cr664_crmauditentriesService } = await import('../../generated/services/Cr664_crmauditentriesService');
      const r = await Cr664_crmauditentriesService.getAll({ top: ROW_CAP });
      if (!r.success) throw new Error(r.error?.message ?? 'Audit read failed');
      return (r.data ?? []).map(mapAuditEntry);
    }, true),
  ]);

  return {
    organizations,
    people,
    relationships,
    roleAssignments,
    contactPoints,
    communicationPreferences,
    contactAuthorizations,
    vendorProfiles,
    timelineEvents,
    auditEntries,
  };
}

/**
 * Phase 141L — CRM Dataverse mapper.
 *
 * Maps CRM domain records to Dataverse payloads (and back). PURE: no IO, no
 * fetch, no SDK import. It only ever names `cr664_crm*` entities, never invents
 * display names or contact values, preserves nulls and source markers, keeps tax
 * identity as a boolean presence flag (never a raw tax id), and redacts
 * sensitive values in audit summaries before they leave the domain layer.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Preserve nulls (undefined optional fields map to `null`, never omitted).
 *   - Preserve source-system / source-record / relationship / authorization /
 *     do-not-contact / restricted-use / redaction markers.
 *   - Never map a full tax id / SSN / TIN / EIN — those throw.
 *   - JSON fields serialize consistently.
 *   - Binds only ever target the hardcoded CRM / boarded-loan / loan-deal sets.
 */

import type {
  CrmOrganization,
  CrmPerson,
  CrmContactPoint,
  CrmRelationship,
  CrmRoleAssignment,
  CrmCommunicationPreference,
  CrmContactAuthorization,
  CrmVendorProfile,
  CrmTimelineEvent,
  CrmAuditEntry,
} from '../shared/crm/crmTypes';

// ---------------------------------------------------------------------------
// Entity names + binds
// ---------------------------------------------------------------------------

export const CRM_ENTITIES = Object.freeze({
  organization: 'cr664_crmorganization',
  person: 'cr664_crmperson',
  contactPoint: 'cr664_crmcontactpoint',
  relationship: 'cr664_crmrelationship',
  roleAssignment: 'cr664_crmroleassignment',
  communicationPreference: 'cr664_crmcommunicationpreference',
  contactAuthorization: 'cr664_crmcontactauthorization',
  vendorProfile: 'cr664_crmvendorprofile',
  timelineEvent: 'cr664_crmtimelineevent',
  auditEntry: 'cr664_crmauditentry',
} as const);

/** Entity-set (plural) names used only for @odata.bind reference targets. */
const ORG_SET = 'cr664_crmorganizations';
const PERSON_SET = 'cr664_crmpersons';
const BOARDED_LOAN_SET = 'cr664_portfolioboardedloans';

export interface CrmDataversePayload {
  entityName: string;
  fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sensitive-value safety
// ---------------------------------------------------------------------------

export class CrmSensitiveValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmSensitiveValueError';
  }
}

const FORBIDDEN_SENSITIVE_KEYS = /^(tax.?id|taxidentifier|ssn|tin|ein|fulltaxid)$/i;

/**
 * Throws when a raw tax id / SSN / TIN / EIN value is present. Tax identity is
 * persisted only as a boolean presence flag — never the value itself.
 */
function assertNoRawSensitiveIdentifiers(obj: object): void {
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_SENSITIVE_KEYS.test(key) && typeof value === 'string' && value.trim() !== '') {
      throw new CrmSensitiveValueError(
        `Raw sensitive identifier "${key}" must never be persisted; use a boolean presence flag instead.`,
      );
    }
  }
}

/** A do-not-leak redaction for free-text audit summaries. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g;

export function redactSensitive(text: string | undefined | null): string | null {
  if (text === undefined || text === null) return null;
  return text.replace(EMAIL_PATTERN, '[redacted]').replace(PHONE_PATTERN, '[redacted]');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Preserve nulls: undefined → null. */
function v<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function namedBind(property: string, set: string, id: string | undefined): Record<string, string> {
  if (id === undefined || id === null || id === '') return {};
  return { [`${property}@odata.bind`]: `/${set}(${id})` };
}

// ---------------------------------------------------------------------------
// Forward mappers (domain → Dataverse)
// ---------------------------------------------------------------------------

export function mapOrganizationToDataverse(org: CrmOrganization): CrmDataversePayload {
  assertNoRawSensitiveIdentifiers(org);
  const orgRecord = org as unknown as Record<string, unknown>;
  const taxIdPresent =
    typeof orgRecord.taxIdPresent === 'boolean' ? (orgRecord.taxIdPresent as boolean) : null;
  return {
    entityName: CRM_ENTITIES.organization,
    fields: {
      cr664_name: org.legalName ?? org.dba ?? org.orgId,
      cr664_organizationidtext: org.orgId,
      cr664_legalname: v(org.legalName),
      cr664_dbaname: v(org.dba),
      cr664_organizationtype: v(org.orgType),
      cr664_taxidpresent: taxIdPresent,
      cr664_naicscode: v(org.naicsIndustry),
      cr664_primaryaddressjson: v(org.addressSummary),
      cr664_status: v(org.status),
      cr664_sourcesystem: v(org.source),
    },
  };
}

export function mapPersonToDataverse(person: CrmPerson): CrmDataversePayload {
  assertNoRawSensitiveIdentifiers(person);
  return {
    entityName: CRM_ENTITIES.person,
    fields: {
      cr664_name: person.fullName ?? person.personId,
      cr664_personidtext: person.personId,
      cr664_displayname: v(person.fullName),
      cr664_title: v(person.title),
      cr664_status: v(person.status),
      cr664_sourcesystem: v(person.source),
      ...namedBind('cr664_EmployerOrganization', ORG_SET, person.orgId),
    },
  };
}

export function mapContactPointToDataverse(cp: CrmContactPoint): CrmDataversePayload {
  return {
    entityName: CRM_ENTITIES.contactPoint,
    fields: {
      cr664_name: cp.label ?? cp.contactPointId,
      cr664_contactpointidtext: cp.contactPointId,
      cr664_ownertype: v(cp.ownerType),
      cr664_owneridtext: v(cp.ownerId),
      cr664_contacttype: v(cp.channel),
      // The raw contact value is persisted exactly as provided — never invented.
      cr664_value: v(cp.value),
      cr664_label: v(cp.label),
      cr664_preferred: v(cp.isPrimary),
      cr664_verified: v(cp.verified),
      cr664_donotcontact: v(cp.doNotUse),
      cr664_restricteduse: v(
        (cp as unknown as Record<string, unknown>).restrictedUse as boolean | undefined,
      ),
    },
  };
}

export function mapRelationshipToDataverse(rel: CrmRelationship): CrmDataversePayload {
  const sourceBind =
    rel.fromEntityType === 'organization'
      ? namedBind('cr664_SourceOrganization', ORG_SET, rel.fromEntityId)
      : namedBind('cr664_SourcePerson', PERSON_SET, rel.fromEntityId);
  const targetBind =
    rel.toEntityType === 'organization'
      ? namedBind('cr664_TargetOrganization', ORG_SET, rel.toEntityId)
      : namedBind('cr664_TargetPerson', PERSON_SET, rel.toEntityId);
  return {
    entityName: CRM_ENTITIES.relationship,
    fields: {
      cr664_name: rel.relationshipId,
      cr664_relationshipidtext: rel.relationshipId,
      cr664_sourceentitytype: v(rel.fromEntityType),
      cr664_sourceentityid: v(rel.fromEntityId),
      cr664_targetentitytype: v(rel.toEntityType),
      cr664_targetentityid: v(rel.toEntityId),
      cr664_relationshiptype: v(rel.relationshipType),
      cr664_startdate: v(rel.startDate),
      cr664_enddate: v(rel.endDate),
      cr664_active: v(rel.active),
      ...sourceBind,
      ...targetBind,
      ...namedBind('cr664_BoardedLoan', BOARDED_LOAN_SET, rel.loanId),
    },
  };
}

export function mapRoleAssignmentToDataverse(role: CrmRoleAssignment): CrmDataversePayload {
  return {
    entityName: CRM_ENTITIES.roleAssignment,
    fields: {
      cr664_name: role.roleId,
      cr664_roleassignmentidtext: role.roleId,
      cr664_roletype: v(role.role),
      cr664_active: v(role.active),
      cr664_authoritylevel: v(role.scope),
      ...namedBind('cr664_Person', PERSON_SET, role.personId),
      ...namedBind('cr664_Organization', ORG_SET, role.orgId),
    },
  };
}

export function mapCommunicationPreferenceToDataverse(
  pref: CrmCommunicationPreference,
): CrmDataversePayload {
  const prohibited: string[] = [];
  if (pref.doNotEmail === true) prohibited.push('email');
  if (pref.doNotCall === true) prohibited.push('phone');
  const allowed = pref.preferredChannel ? [pref.preferredChannel] : [];
  return {
    entityName: CRM_ENTITIES.communicationPreference,
    fields: {
      cr664_name: pref.prefId,
      cr664_preferenceidtext: pref.prefId,
      cr664_ownertype: v(pref.ownerType),
      cr664_ownerid: v(pref.ownerId),
      cr664_preferredmethod: v(pref.preferredChannel),
      cr664_allowedmethodsjson: jsonOrNull(allowed),
      cr664_prohibitedmethodsjson: jsonOrNull(prohibited),
      cr664_consentstatus: pref.doNotContact === true ? 'do_not_contact' : v(undefined),
    },
  };
}

export function mapContactAuthorizationToDataverse(
  auth: CrmContactAuthorization,
): CrmDataversePayload {
  const granted = auth.revoked !== true;
  return {
    entityName: CRM_ENTITIES.contactAuthorization,
    fields: {
      cr664_name: auth.authId,
      cr664_authorizationidtext: auth.authId,
      cr664_authorizedforfinancialrequests:
        auth.authType === 'financial_disclosure' ? granted : null,
      cr664_authorizedforuploadlinks:
        auth.authType === 'document_upload' ? granted : null,
      cr664_authorizedforservicingrequests:
        auth.authType === 'account_servicing' ? granted : null,
      cr664_authorizationdate: v(auth.grantedDate),
      cr664_expiresat: v(auth.expirationDate),
      ...namedBind('cr664_Person', PERSON_SET, auth.personId),
      ...namedBind('cr664_Organization', ORG_SET, auth.orgId),
    },
  };
}

export function mapVendorProfileToDataverse(vendor: CrmVendorProfile): CrmDataversePayload {
  return {
    entityName: CRM_ENTITIES.vendorProfile,
    fields: {
      cr664_name: vendor.vendorId,
      cr664_vendoridtext: vendor.vendorId,
      cr664_vendortype: v(vendor.vendorType),
      cr664_approvedvendor: v(vendor.approvedVendor),
      cr664_approvalstatus: v(vendor.approvalStatus),
      cr664_approvaldate: v(vendor.approvalDate),
      cr664_expirationdate: v(vendor.expirationDate),
      cr664_insuranceonfile: v(vendor.insuranceOnFile),
      cr664_lastuseddate: v(vendor.lastUsedDate),
      cr664_servicecategoriesjson: jsonOrNull(vendor.serviceCategories ?? null),
      cr664_relateddocumenttypesjson: jsonOrNull(vendor.relatedDocumentTypes ?? null),
      cr664_notes: v(vendor.notes),
      ...namedBind('cr664_Organization', ORG_SET, vendor.orgId),
    },
  };
}

export function mapTimelineEventToDataverse(event: CrmTimelineEvent): CrmDataversePayload {
  return {
    entityName: CRM_ENTITIES.timelineEvent,
    fields: {
      cr664_name: event.eventId,
      cr664_eventidtext: event.eventId,
      cr664_entitytype: v(event.entityType),
      cr664_entityid: v(event.entityId),
      cr664_eventtype: v(event.eventType),
      cr664_occurredat: v(event.occurredAt),
      cr664_actor: v(event.actor),
      cr664_summary: v(event.summary),
    },
  };
}

export function mapAuditEntryToDataverse(entry: CrmAuditEntry): CrmDataversePayload {
  const redacted = entry.redacted === true;
  const scrub = (text: string | undefined): string | null =>
    redacted ? (text === undefined ? null : '[redacted]') : redactSensitive(text);
  return {
    entityName: CRM_ENTITIES.auditEntry,
    fields: {
      cr664_name: entry.action,
      cr664_actor: v(entry.actor),
      cr664_action: entry.action,
      cr664_timestamp: entry.timestamp,
      cr664_entitytype: v(entry.entityType),
      cr664_entityid: v(entry.entityId),
      cr664_fieldkey: v(entry.fieldKey),
      cr664_previousvaluesummary: scrub(entry.previousValueSummary),
      cr664_newvaluesummary: scrub(entry.newValueSummary),
      cr664_reason: v(entry.reason),
      cr664_redacted: redacted,
    },
  };
}

// ---------------------------------------------------------------------------
// Reverse mappers (Dataverse → domain) — used by reads/searches
// ---------------------------------------------------------------------------

function s(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}
function b(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function mapDataverseToOrganization(fields: Record<string, unknown>): CrmOrganization {
  return {
    orgId: s(fields.cr664_organizationidtext) ?? '',
    legalName: s(fields.cr664_legalname),
    dba: s(fields.cr664_dbaname),
    orgType: (s(fields.cr664_organizationtype) ?? 'other') as CrmOrganization['orgType'],
    naicsIndustry: s(fields.cr664_naicscode),
    addressSummary: s(fields.cr664_primaryaddressjson),
    status: (s(fields.cr664_status) ?? 'active') as CrmOrganization['status'],
    source: s(fields.cr664_sourcesystem),
  };
}

export function mapDataverseToPerson(fields: Record<string, unknown>): CrmPerson {
  return {
    personId: s(fields.cr664_personidtext) ?? '',
    fullName: s(fields.cr664_displayname),
    title: s(fields.cr664_title),
    orgId: s(fields._cr664_employerorganization_value),
    personType: 'other',
    status: (s(fields.cr664_status) ?? 'active') as CrmPerson['status'],
    source: s(fields.cr664_sourcesystem),
  };
}

export function mapDataverseToContactPoint(fields: Record<string, unknown>): CrmContactPoint {
  return {
    contactPointId: s(fields.cr664_contactpointidtext) ?? '',
    ownerType: (s(fields.cr664_ownertype) ?? 'person') as CrmContactPoint['ownerType'],
    ownerId: s(fields.cr664_owneridtext) ?? '',
    channel: (s(fields.cr664_contacttype) ?? 'email') as CrmContactPoint['channel'],
    value: s(fields.cr664_value),
    isPrimary: b(fields.cr664_preferred),
    verified: b(fields.cr664_verified),
    doNotUse: b(fields.cr664_donotcontact),
    label: s(fields.cr664_label),
  };
}

export function mapDataverseToRelationship(fields: Record<string, unknown>): CrmRelationship {
  return {
    relationshipId: s(fields.cr664_relationshipidtext) ?? '',
    fromEntityType: (s(fields.cr664_sourceentitytype) ?? 'organization') as CrmRelationship['fromEntityType'],
    fromEntityId: s(fields.cr664_sourceentityid) ?? '',
    toEntityType: (s(fields.cr664_targetentitytype) ?? 'organization') as CrmRelationship['toEntityType'],
    toEntityId: s(fields.cr664_targetentityid) ?? '',
    relationshipType: (s(fields.cr664_relationshiptype) ?? 'related_entity') as CrmRelationship['relationshipType'],
    startDate: s(fields.cr664_startdate),
    endDate: s(fields.cr664_enddate),
    active: b(fields.cr664_active),
  };
}

export function mapDataverseToRoleAssignment(fields: Record<string, unknown>): CrmRoleAssignment {
  return {
    roleId: s(fields.cr664_roleassignmentidtext) ?? '',
    personId: s(fields._cr664_person_value) ?? '',
    orgId: s(fields._cr664_organization_value),
    role: (s(fields.cr664_roletype) ?? 'borrower_contact') as CrmRoleAssignment['role'],
    scope: s(fields.cr664_authoritylevel),
    active: b(fields.cr664_active),
  };
}

export function mapDataverseToVendorProfile(fields: Record<string, unknown>): CrmVendorProfile {
  return {
    vendorId: s(fields.cr664_vendoridtext) ?? '',
    vendorType: s(fields.cr664_vendortype),
    approvedVendor: b(fields.cr664_approvedvendor),
    approvalStatus: s(fields.cr664_approvalstatus),
    approvalDate: s(fields.cr664_approvaldate),
    expirationDate: s(fields.cr664_expirationdate),
    insuranceOnFile: b(fields.cr664_insuranceonfile),
    lastUsedDate: s(fields.cr664_lastuseddate),
    notes: s(fields.cr664_notes),
  };
}

export function mapDataverseToTimelineEvent(fields: Record<string, unknown>): CrmTimelineEvent {
  return {
    eventId: s(fields.cr664_eventidtext) ?? '',
    entityType: (s(fields.cr664_entitytype) ?? 'organization') as CrmTimelineEvent['entityType'],
    entityId: s(fields.cr664_entityid) ?? '',
    eventType: s(fields.cr664_eventtype) ?? '',
    occurredAt: s(fields.cr664_occurredat),
    summary: s(fields.cr664_summary),
    actor: s(fields.cr664_actor),
  };
}

/**
 * Phase 141J-K — CRM Dataverse schema PLAN constants.
 *
 * The canonical, declarative target schema for persisting the Phase 141B-H CRM
 * Relationship Master into Dataverse. This file is CONSTANTS ONLY — it makes no
 * live calls, performs no writes, and creates nothing. It is the plan the
 * read-only inspect/plan script modes compare the live environment against, and
 * the contract the guarded seed mode implements.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO, no fetch, no Dataverse calls. Pure data.
 *   - No fake customer / vendor / contact data, no sample emails or phone
 *     numbers, no placeholder company names.
 *   - All logical names use the project publisher prefix `cr664_`.
 *   - Nothing here creates schema. This file inspects and plans only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmDataverseDataType =
  | 'String'
  | 'Memo'
  | 'Integer'
  | 'Decimal'
  | 'Money'
  | 'Boolean'
  | 'DateTime'
  | 'Lookup'
  | 'Picklist';

export type CrmDataverseRequiredLevel =
  | 'None'
  | 'Recommended'
  | 'ApplicationRequired';

export type CrmDataverseOwnershipType = 'UserOwned' | 'OrganizationOwned';

export interface CrmTargetTablePlan {
  logicalName: string;
  schemaName: string;
  displayName: string;
  pluralDisplayName: string;
  primaryNameColumn: string;
  ownershipType: CrmDataverseOwnershipType;
  description: string;
  requiredForPhase: string;
  seedOrder: number;
  sourceModelType: string;
  safetyNotes: string;
}

export interface CrmTargetColumnPlan {
  tableLogicalName: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  dataType: CrmDataverseDataType;
  requiredLevel: CrmDataverseRequiredLevel;
  maxLength?: number;
  precision?: number;
  targets?: readonly string[];
  optionSetKey?: string;
  description: string;
  sourceModelPath: string;
  requiredForCreate: boolean;
  sensitive: boolean;
  safetyNotes: string;
}

export interface CrmTargetRelationshipPlan {
  relationshipSchemaName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  cardinality: 'ManyToOne';
  required: boolean;
  optional: boolean;
  cascadeBehavior: 'Parental' | 'Referential';
  description: string;
}

export interface CrmTargetOptionSetPlan {
  key: string;
  displayName: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Version + logical names
// ---------------------------------------------------------------------------

export const CRM_SCHEMA_VERSION = '141J-K.1';

export const CRM_PUBLISHER_PREFIX = 'cr664';

const T = Object.freeze({
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
});

/** Existing project tables CRM records may reuse / link to. */
export const CRM_REUSE_CANDIDATE_TABLES: readonly string[] = Object.freeze([
  'cr664_clientrelationship',
  'cr664_banker',
  'cr664_platformuser',
  'cr664_team',
  'cr664_loandeal',
  'cr664_portfolioboardedloan',
  'systemuser',
]);

/**
 * External (non-CRM) lookup targets whose absence must NOT block a core CRM
 * seed — the optional relationships that point at them are skipped instead.
 */
export const CRM_OPTIONAL_EXTERNAL_TARGETS: readonly string[] = Object.freeze([
  'cr664_portfolioboardedloan',
  'cr664_loandeal',
  'cr664_team',
  'cr664_platformuser',
  'systemuser',
]);

// ---------------------------------------------------------------------------
// Tables (10)
// ---------------------------------------------------------------------------

function table(
  logicalName: string,
  displayName: string,
  pluralDisplayName: string,
  seedOrder: number,
  sourceModelType: string,
  description: string,
): CrmTargetTablePlan {
  const short = logicalName.replace(/^cr664_/, '');
  return {
    logicalName,
    schemaName: `cr664_${short.charAt(0).toUpperCase()}${short.slice(1)}`,
    displayName,
    pluralDisplayName,
    primaryNameColumn: 'cr664_name',
    ownershipType: 'UserOwned',
    description,
    requiredForPhase: '141J-K',
    seedOrder,
    sourceModelType,
    safetyNotes:
      'Inspect live metadata before any seed. Never create if an ambiguous or legacy artifact already exists under this name. No record data is ever seeded.',
  };
}

export const CRM_TARGET_TABLES: readonly CrmTargetTablePlan[] = Object.freeze([
  table(
    T.organization,
    'CRM Organization',
    'CRM Organizations',
    1,
    'CrmOrganization',
    'Companies, customers, borrowers, vendors, firms, agencies, and internal bank units.',
  ),
  table(
    T.person,
    'CRM Person',
    'CRM People',
    2,
    'CrmPerson',
    'Individuals and contacts.',
  ),
  table(
    T.contactPoint,
    'CRM Contact Point',
    'CRM Contact Points',
    3,
    'CrmContactPoint',
    'Emails, phones, mobile numbers, mailing addresses, portals, and other contact methods.',
  ),
  table(
    T.relationship,
    'CRM Relationship',
    'CRM Relationships',
    4,
    'CrmRelationship',
    'Generic relationship graph edges between organizations, people, loans, and other entities.',
  ),
  table(
    T.roleAssignment,
    'CRM Role Assignment',
    'CRM Role Assignments',
    5,
    'CrmRoleAssignment',
    'Role assignments (borrower contact, financial request contact, servicing owner, portfolio manager, etc.).',
  ),
  table(
    T.communicationPreference,
    'CRM Communication Preference',
    'CRM Communication Preferences',
    6,
    'CrmCommunicationPreference',
    'Communication preferences and restrictions.',
  ),
  table(
    T.contactAuthorization,
    'CRM Contact Authorization',
    'CRM Contact Authorizations',
    7,
    'CrmContactAuthorization',
    'Authorizations for financial requests, upload links, loan notices, and other correspondence.',
  ),
  table(
    T.vendorProfile,
    'CRM Vendor Profile',
    'CRM Vendor Profiles',
    8,
    'CrmVendorProfile',
    'Vendor / advisor profile (CPA, attorney, title, appraiser, environmental, insurance, etc.).',
  ),
  table(
    T.timelineEvent,
    'CRM Timeline Event',
    'CRM Timeline Events',
    9,
    'CrmTimelineEvent',
    'CRM timeline event table.',
  ),
  table(
    T.auditEntry,
    'CRM Audit Entry',
    'CRM Audit Entries',
    10,
    'CrmAuditEntry',
    'CRM audit entry table.',
  ),
]);

// ---------------------------------------------------------------------------
// Column builder
// ---------------------------------------------------------------------------

function col(
  tableLogicalName: string,
  shortName: string,
  displayName: string,
  dataType: CrmDataverseDataType,
  extra: Partial<CrmTargetColumnPlan> = {},
): CrmTargetColumnPlan {
  return {
    tableLogicalName,
    logicalName: `cr664_${shortName}`,
    schemaName: `cr664_${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`,
    displayName,
    dataType,
    requiredLevel: 'None',
    description: displayName,
    sourceModelPath: '',
    requiredForCreate: false,
    sensitive: false,
    safetyNotes: '',
    ...extra,
  };
}

/** The primary name column every table carries. */
function primaryName(tableLogicalName: string): CrmTargetColumnPlan {
  return col(tableLogicalName, 'name', 'Name', 'String', {
    requiredLevel: 'ApplicationRequired',
    requiredForCreate: true,
    maxLength: 200,
    description: 'Primary name (operator-supplied label for the record).',
  });
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const ORGANIZATION_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.organization),
  col(T.organization, 'organizationidtext', 'Organization id (text)', 'String', { sourceModelPath: 'organization.orgId' }),
  col(T.organization, 'legalname', 'Legal name', 'String', { sourceModelPath: 'organization.legalName' }),
  col(T.organization, 'dbaname', 'DBA name', 'String', { sourceModelPath: 'organization.dba' }),
  col(T.organization, 'displayname', 'Display name', 'String'),
  col(T.organization, 'organizationtype', 'Organization type', 'Picklist', { optionSetKey: 'organizationType', sourceModelPath: 'organization.orgType' }),
  col(T.organization, 'taxidpresent', 'Tax id present', 'Boolean', { description: 'Whether a tax identifier is on file. The identifier value itself is never stored here.' }),
  col(T.organization, 'industry', 'Industry', 'String'),
  col(T.organization, 'naicscode', 'NAICS code', 'String', { sourceModelPath: 'organization.naicsIndustry' }),
  col(T.organization, 'stateofformation', 'State of formation', 'String'),
  col(T.organization, 'primaryaddressjson', 'Primary address JSON', 'Memo'),
  col(T.organization, 'mailingaddressjson', 'Mailing address JSON', 'Memo'),
  col(T.organization, 'website', 'Website', 'String'),
  col(T.organization, 'status', 'Status', 'Picklist', { optionSetKey: 'crmRecordStatus', sourceModelPath: 'organization.status' }),
  col(T.organization, 'relationshipstartdate', 'Relationship start date', 'DateTime'),
  col(T.organization, 'relationshipenddate', 'Relationship end date', 'DateTime'),
  col(T.organization, 'sourcesystem', 'Source system', 'String', { sourceModelPath: 'organization.source' }),
  col(T.organization, 'sourcerecordid', 'Source record id', 'String'),
  col(T.organization, 'notes', 'Notes', 'Memo'),
  col(T.organization, 'createdbytext', 'Created by (text)', 'String'),
  col(T.organization, 'createdat', 'Created at', 'DateTime'),
  col(T.organization, 'updatedbytext', 'Updated by (text)', 'String'),
  col(T.organization, 'updatedat', 'Updated at', 'DateTime'),
];

const PERSON_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.person),
  col(T.person, 'personidtext', 'Person id (text)', 'String', { sourceModelPath: 'person.personId' }),
  col(T.person, 'firstname', 'First name', 'String'),
  col(T.person, 'lastname', 'Last name', 'String'),
  col(T.person, 'displayname', 'Display name', 'String', { sourceModelPath: 'person.fullName' }),
  col(T.person, 'title', 'Title', 'String', { sourceModelPath: 'person.title' }),
  col(T.person, 'rolesummary', 'Role summary', 'String'),
  col(T.person, 'status', 'Status', 'Picklist', { optionSetKey: 'crmRecordStatus', sourceModelPath: 'person.status' }),
  col(T.person, 'sourcesystem', 'Source system', 'String', { sourceModelPath: 'person.source' }),
  col(T.person, 'sourcerecordid', 'Source record id', 'String'),
  col(T.person, 'notes', 'Notes', 'Memo'),
  col(T.person, 'createdbytext', 'Created by (text)', 'String'),
  col(T.person, 'createdat', 'Created at', 'DateTime'),
  col(T.person, 'updatedbytext', 'Updated by (text)', 'String'),
  col(T.person, 'updatedat', 'Updated at', 'DateTime'),
];

const CONTACT_POINT_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.contactPoint),
  col(T.contactPoint, 'contactpointidtext', 'Contact point id (text)', 'String', { sourceModelPath: 'contactPoint.contactPointId' }),
  col(T.contactPoint, 'ownertype', 'Owner type', 'String', { sourceModelPath: 'contactPoint.ownerType' }),
  col(T.contactPoint, 'owneridtext', 'Owner id (text)', 'String', { sourceModelPath: 'contactPoint.ownerId' }),
  col(T.contactPoint, 'contacttype', 'Contact type', 'Picklist', { optionSetKey: 'contactType', sourceModelPath: 'contactPoint.channel' }),
  col(T.contactPoint, 'value', 'Value', 'String', {
    sensitive: true,
    description: 'The email / phone / address value. NEVER seeded with a sample value; holds operator-entered contact data only.',
    safetyNotes: 'Sensitive. The seed mode never writes a value here; only the schema column is created.',
    sourceModelPath: 'contactPoint.value',
  }),
  col(T.contactPoint, 'label', 'Label', 'String', { sourceModelPath: 'contactPoint.label' }),
  col(T.contactPoint, 'preferred', 'Preferred', 'Boolean', { sourceModelPath: 'contactPoint.isPrimary' }),
  col(T.contactPoint, 'verified', 'Verified', 'Boolean', { sourceModelPath: 'contactPoint.verified' }),
  col(T.contactPoint, 'donotcontact', 'Do not contact', 'Boolean', {
    description: 'Channel-level do-not-contact suppression. Honored by the readiness engines; never silently overridden.',
    sourceModelPath: 'contactPoint.doNotUse',
  }),
  col(T.contactPoint, 'restricteduse', 'Restricted use', 'Boolean'),
  col(T.contactPoint, 'authorizationstatus', 'Authorization status', 'Picklist', { optionSetKey: 'authorizationStatus' }),
  col(T.contactPoint, 'lastverifieddate', 'Last verified date', 'DateTime'),
  col(T.contactPoint, 'staleafterdays', 'Stale after days', 'Integer'),
  col(T.contactPoint, 'notes', 'Notes', 'Memo'),
];

const RELATIONSHIP_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.relationship),
  col(T.relationship, 'relationshipidtext', 'Relationship id (text)', 'String', { sourceModelPath: 'relationship.relationshipId' }),
  col(T.relationship, 'sourceentitytype', 'Source entity type', 'String', { sourceModelPath: 'relationship.fromEntityType' }),
  col(T.relationship, 'sourceentityid', 'Source entity id', 'String', { sourceModelPath: 'relationship.fromEntityId' }),
  col(T.relationship, 'targetentitytype', 'Target entity type', 'String', { sourceModelPath: 'relationship.toEntityType' }),
  col(T.relationship, 'targetentityid', 'Target entity id', 'String', { sourceModelPath: 'relationship.toEntityId' }),
  col(T.relationship, 'relationshiptype', 'Relationship type', 'Picklist', { optionSetKey: 'relationshipType', sourceModelPath: 'relationship.relationshipType' }),
  col(T.relationship, 'role', 'Role', 'String'),
  col(T.relationship, 'startdate', 'Start date', 'DateTime', { sourceModelPath: 'relationship.startDate' }),
  col(T.relationship, 'enddate', 'End date', 'DateTime', { sourceModelPath: 'relationship.endDate' }),
  col(T.relationship, 'active', 'Active', 'Boolean', { sourceModelPath: 'relationship.active' }),
  col(T.relationship, 'evidencedocumentid', 'Evidence document id', 'String'),
  col(T.relationship, 'notes', 'Notes', 'Memo'),
];

const ROLE_ASSIGNMENT_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.roleAssignment),
  col(T.roleAssignment, 'roleassignmentidtext', 'Role assignment id (text)', 'String', { sourceModelPath: 'roleAssignment.roleId' }),
  col(T.roleAssignment, 'entitytype', 'Entity type', 'String'),
  col(T.roleAssignment, 'entityid', 'Entity id', 'String'),
  col(T.roleAssignment, 'roletype', 'Role type', 'Picklist', { optionSetKey: 'roleType', sourceModelPath: 'roleAssignment.role' }),
  col(T.roleAssignment, 'assignedtotype', 'Assigned to type', 'String'),
  col(T.roleAssignment, 'assignedtoid', 'Assigned to id', 'String'),
  col(T.roleAssignment, 'loanid', 'Loan id', 'String'),
  col(T.roleAssignment, 'boardedloanid', 'Boarded loan id', 'String'),
  col(T.roleAssignment, 'annualreviewpackageid', 'Annual review package id', 'String'),
  col(T.roleAssignment, 'startdate', 'Start date', 'DateTime'),
  col(T.roleAssignment, 'enddate', 'End date', 'DateTime'),
  col(T.roleAssignment, 'active', 'Active', 'Boolean', { sourceModelPath: 'roleAssignment.active' }),
  col(T.roleAssignment, 'authoritylevel', 'Authority level', 'String'),
  col(T.roleAssignment, 'notes', 'Notes', 'Memo'),
];

const COMMUNICATION_PREFERENCE_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.communicationPreference),
  col(T.communicationPreference, 'preferenceidtext', 'Preference id (text)', 'String', { sourceModelPath: 'communicationPreference.prefId' }),
  col(T.communicationPreference, 'ownertype', 'Owner type', 'String', { sourceModelPath: 'communicationPreference.ownerType' }),
  col(T.communicationPreference, 'ownerid', 'Owner id', 'String', { sourceModelPath: 'communicationPreference.ownerId' }),
  col(T.communicationPreference, 'preferredmethod', 'Preferred method', 'Picklist', { optionSetKey: 'communicationMethod', sourceModelPath: 'communicationPreference.preferredChannel' }),
  col(T.communicationPreference, 'allowedmethodsjson', 'Allowed methods JSON', 'Memo'),
  col(T.communicationPreference, 'prohibitedmethodsjson', 'Prohibited methods JSON', 'Memo'),
  col(T.communicationPreference, 'consentstatus', 'Consent status', 'Picklist', { optionSetKey: 'consentStatus' }),
  col(T.communicationPreference, 'statementdeliverypreference', 'Statement delivery preference', 'String'),
  col(T.communicationPreference, 'annualreviewrequestpreference', 'Annual review request preference', 'String'),
  col(T.communicationPreference, 'covenantnoticepreference', 'Covenant notice preference', 'String'),
  col(T.communicationPreference, 'insurancenoticepreference', 'Insurance notice preference', 'String'),
  col(T.communicationPreference, 'escalationpreference', 'Escalation preference', 'String'),
  col(T.communicationPreference, 'uploadlinkpreference', 'Upload link preference', 'String'),
  col(T.communicationPreference, 'effectivedate', 'Effective date', 'DateTime'),
  col(T.communicationPreference, 'expiresat', 'Expires at', 'DateTime'),
  col(T.communicationPreference, 'evidencedocumentid', 'Evidence document id', 'String'),
  col(T.communicationPreference, 'notes', 'Notes', 'Memo'),
];

const CONTACT_AUTHORIZATION_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.contactAuthorization),
  col(T.contactAuthorization, 'authorizationidtext', 'Authorization id (text)', 'String', { sourceModelPath: 'contactAuthorization.authId' }),
  col(T.contactAuthorization, 'ownertype', 'Owner type', 'String'),
  col(T.contactAuthorization, 'ownerid', 'Owner id', 'String'),
  col(T.contactAuthorization, 'authorizedforfinancialrequests', 'Authorized for financial requests', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforuploadlinks', 'Authorized for upload links', 'Boolean', {
    description: 'Whether this owner has authorized document-upload links. Missing / expired blocks upload-link readiness.',
  }),
  col(T.contactAuthorization, 'authorizedforloannotices', 'Authorized for loan notices', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforinsurancerequests', 'Authorized for insurance requests', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforcovenantrequests', 'Authorized for covenant requests', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforpayoffrequests', 'Authorized for payoff requests', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforboardpackagecorrespondence', 'Authorized for board package correspondence', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforexaminerpackagecorrespondence', 'Authorized for examiner package correspondence', 'Boolean'),
  col(T.contactAuthorization, 'authorizedforservicingrequests', 'Authorized for servicing requests', 'Boolean'),
  col(T.contactAuthorization, 'authorizedby', 'Authorized by', 'String'),
  col(T.contactAuthorization, 'authorizationdate', 'Authorization date', 'DateTime', { sourceModelPath: 'contactAuthorization.grantedDate' }),
  col(T.contactAuthorization, 'expiresat', 'Expires at', 'DateTime', { sourceModelPath: 'contactAuthorization.expirationDate' }),
  col(T.contactAuthorization, 'evidencedocumentid', 'Evidence document id', 'String'),
  col(T.contactAuthorization, 'notes', 'Notes', 'Memo'),
];

const VENDOR_PROFILE_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.vendorProfile),
  col(T.vendorProfile, 'vendoridtext', 'Vendor id (text)', 'String'),
  col(T.vendorProfile, 'vendortype', 'Vendor type', 'Picklist', { optionSetKey: 'vendorType' }),
  col(T.vendorProfile, 'approvedvendor', 'Approved vendor', 'Boolean'),
  col(T.vendorProfile, 'approvalstatus', 'Approval status', 'String'),
  col(T.vendorProfile, 'approvaldate', 'Approval date', 'DateTime'),
  col(T.vendorProfile, 'expirationdate', 'Expiration date', 'DateTime'),
  col(T.vendorProfile, 'insuranceonfile', 'Insurance on file', 'Boolean'),
  col(T.vendorProfile, 'lastuseddate', 'Last used date', 'DateTime'),
  col(T.vendorProfile, 'servicecategoriesjson', 'Service categories JSON', 'Memo'),
  col(T.vendorProfile, 'relateddocumenttypesjson', 'Related document types JSON', 'Memo'),
  col(T.vendorProfile, 'notes', 'Notes', 'Memo'),
];

const TIMELINE_EVENT_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.timelineEvent),
  col(T.timelineEvent, 'eventidtext', 'Event id (text)', 'String', { sourceModelPath: 'timelineEvent.eventId' }),
  col(T.timelineEvent, 'entitytype', 'Entity type', 'String', { sourceModelPath: 'timelineEvent.entityType' }),
  col(T.timelineEvent, 'entityid', 'Entity id', 'String', { sourceModelPath: 'timelineEvent.entityId' }),
  col(T.timelineEvent, 'eventtype', 'Event type', 'Picklist', { optionSetKey: 'timelineEventType', sourceModelPath: 'timelineEvent.eventType' }),
  col(T.timelineEvent, 'occurredat', 'Occurred at', 'DateTime', { sourceModelPath: 'timelineEvent.occurredAt' }),
  col(T.timelineEvent, 'actor', 'Actor', 'String', { sourceModelPath: 'timelineEvent.actor' }),
  col(T.timelineEvent, 'summary', 'Summary', 'Memo', { sourceModelPath: 'timelineEvent.summary' }),
  col(T.timelineEvent, 'relatedloanid', 'Related loan id', 'String'),
  col(T.timelineEvent, 'relatedboardedloanid', 'Related boarded loan id', 'String'),
  col(T.timelineEvent, 'relatedannualreviewpackageid', 'Related annual review package id', 'String'),
  col(T.timelineEvent, 'relateddocumentid', 'Related document id', 'String'),
  col(T.timelineEvent, 'relatedevidenceid', 'Related evidence id', 'String'),
  col(T.timelineEvent, 'notes', 'Notes', 'Memo'),
];

const AUDIT_ENTRY_COLUMNS: readonly CrmTargetColumnPlan[] = [
  primaryName(T.auditEntry),
  col(T.auditEntry, 'auditidtext', 'Audit id (text)', 'String'),
  col(T.auditEntry, 'actor', 'Actor', 'String', { sourceModelPath: 'audit.actor' }),
  col(T.auditEntry, 'action', 'Action', 'String', { sourceModelPath: 'audit.action' }),
  col(T.auditEntry, 'timestamp', 'Timestamp', 'DateTime', { sourceModelPath: 'audit.timestamp' }),
  col(T.auditEntry, 'entitytype', 'Entity type', 'String', { sourceModelPath: 'audit.entityType' }),
  col(T.auditEntry, 'entityid', 'Entity id', 'String', { sourceModelPath: 'audit.entityId' }),
  col(T.auditEntry, 'fieldkey', 'Field key', 'String', { sourceModelPath: 'audit.fieldKey' }),
  col(T.auditEntry, 'previousvaluesummary', 'Previous value summary', 'Memo', { sourceModelPath: 'audit.previousValueSummary' }),
  col(T.auditEntry, 'newvaluesummary', 'New value summary', 'Memo', { sourceModelPath: 'audit.newValueSummary' }),
  col(T.auditEntry, 'reason', 'Reason', 'Memo', { sourceModelPath: 'audit.reason' }),
  col(T.auditEntry, 'evidencedocumentid', 'Evidence document id', 'String'),
  col(T.auditEntry, 'redacted', 'Redacted', 'Boolean'),
  col(T.auditEntry, 'notes', 'Notes', 'Memo'),
];

export const CRM_TARGET_COLUMNS: readonly CrmTargetColumnPlan[] = Object.freeze([
  ...ORGANIZATION_COLUMNS,
  ...PERSON_COLUMNS,
  ...CONTACT_POINT_COLUMNS,
  ...RELATIONSHIP_COLUMNS,
  ...ROLE_ASSIGNMENT_COLUMNS,
  ...COMMUNICATION_PREFERENCE_COLUMNS,
  ...CONTACT_AUTHORIZATION_COLUMNS,
  ...VENDOR_PROFILE_COLUMNS,
  ...TIMELINE_EVENT_COLUMNS,
  ...AUDIT_ENTRY_COLUMNS,
]);

// ---------------------------------------------------------------------------
// Relationships (lookups) — all optional in this phase
// ---------------------------------------------------------------------------

function rel(
  relationshipSchemaName: string,
  fromTable: string,
  fromColumn: string,
  toTable: string,
  description: string,
  required = false,
): CrmTargetRelationshipPlan {
  return {
    relationshipSchemaName,
    fromTable,
    fromColumn,
    toTable,
    cardinality: 'ManyToOne',
    required,
    optional: !required,
    cascadeBehavior: 'Referential',
    description,
  };
}

export const CRM_TARGET_RELATIONSHIPS: readonly CrmTargetRelationshipPlan[] =
  Object.freeze([
    // Person → employer organization.
    rel('cr664_crmperson_employerorganization', T.person, 'cr664_EmployerOrganization', T.organization, 'A person may belong to an employer organization.'),
    // Contact point owners.
    rel('cr664_crmcontactpoint_organization', T.contactPoint, 'cr664_Organization', T.organization, 'A contact point owned by an organization.'),
    rel('cr664_crmcontactpoint_person', T.contactPoint, 'cr664_Person', T.person, 'A contact point owned by a person.'),
    // Relationship endpoints.
    rel('cr664_crmrelationship_sourceorganization', T.relationship, 'cr664_SourceOrganization', T.organization, 'Source organization of a relationship edge.'),
    rel('cr664_crmrelationship_targetorganization', T.relationship, 'cr664_TargetOrganization', T.organization, 'Target organization of a relationship edge.'),
    rel('cr664_crmrelationship_sourceperson', T.relationship, 'cr664_SourcePerson', T.person, 'Source person of a relationship edge.'),
    rel('cr664_crmrelationship_targetperson', T.relationship, 'cr664_TargetPerson', T.person, 'Target person of a relationship edge.'),
    rel('cr664_crmrelationship_boardedloan', T.relationship, 'cr664_BoardedLoan', 'cr664_portfolioboardedloan', 'Optional link from a relationship to a portfolio boarded loan.'),
    rel('cr664_crmrelationship_originatedloandeal', T.relationship, 'cr664_OriginatedLoanDeal', 'cr664_loandeal', 'Optional link from a relationship to an originated loan deal.'),
    // Role assignment links.
    rel('cr664_crmroleassignment_organization', T.roleAssignment, 'cr664_Organization', T.organization, 'Role assignment may reference an organization.'),
    rel('cr664_crmroleassignment_person', T.roleAssignment, 'cr664_Person', T.person, 'Role assignment may reference a person.'),
    rel('cr664_crmroleassignment_boardedloan', T.roleAssignment, 'cr664_BoardedLoan', 'cr664_portfolioboardedloan', 'Optional link from a role assignment to a boarded loan.'),
    rel('cr664_crmroleassignment_originatedloandeal', T.roleAssignment, 'cr664_OriginatedLoanDeal', 'cr664_loandeal', 'Optional link from a role assignment to an originated loan deal.'),
    rel('cr664_crmroleassignment_team', T.roleAssignment, 'cr664_Team', 'cr664_team', 'Optional link from a role assignment to a team.'),
    rel('cr664_crmroleassignment_platformuser', T.roleAssignment, 'cr664_PlatformUser', 'cr664_platformuser', 'Optional link from a role assignment to a platform user.'),
    // Communication preference owners.
    rel('cr664_crmcommunicationpreference_organization', T.communicationPreference, 'cr664_Organization', T.organization, 'A communication preference owned by an organization.'),
    rel('cr664_crmcommunicationpreference_person', T.communicationPreference, 'cr664_Person', T.person, 'A communication preference owned by a person.'),
    // Contact authorization owners.
    rel('cr664_crmcontactauthorization_organization', T.contactAuthorization, 'cr664_Organization', T.organization, 'A contact authorization owned by an organization.'),
    rel('cr664_crmcontactauthorization_person', T.contactAuthorization, 'cr664_Person', T.person, 'A contact authorization owned by a person.'),
    // Vendor profile → organization.
    rel('cr664_crmvendorprofile_organization', T.vendorProfile, 'cr664_Organization', T.organization, 'A vendor profile is owned by an organization.'),
    // Timeline event links.
    rel('cr664_crmtimelineevent_organization', T.timelineEvent, 'cr664_Organization', T.organization, 'A timeline event may reference an organization.'),
    rel('cr664_crmtimelineevent_person', T.timelineEvent, 'cr664_Person', T.person, 'A timeline event may reference a person.'),
    rel('cr664_crmtimelineevent_boardedloan', T.timelineEvent, 'cr664_BoardedLoan', 'cr664_portfolioboardedloan', 'Optional link from a timeline event to a boarded loan.'),
    rel('cr664_crmtimelineevent_originatedloandeal', T.timelineEvent, 'cr664_OriginatedLoanDeal', 'cr664_loandeal', 'Optional link from a timeline event to an originated loan deal.'),
    // Audit entry links.
    rel('cr664_crmauditentry_organization', T.auditEntry, 'cr664_Organization', T.organization, 'An audit entry may reference an organization.'),
    rel('cr664_crmauditentry_person', T.auditEntry, 'cr664_Person', T.person, 'An audit entry may reference a person.'),
    rel('cr664_crmauditentry_boardedloan', T.auditEntry, 'cr664_BoardedLoan', 'cr664_portfolioboardedloan', 'Optional link from an audit entry to a boarded loan.'),
    rel('cr664_crmauditentry_originatedloandeal', T.auditEntry, 'cr664_OriginatedLoanDeal', 'cr664_loandeal', 'Optional link from an audit entry to an originated loan deal.'),
  ]);

// ---------------------------------------------------------------------------
// Option sets (metadata plan only — NOT created in this phase)
// ---------------------------------------------------------------------------

export const CRM_TARGET_OPTION_SETS: readonly CrmTargetOptionSetPlan[] =
  Object.freeze([
    { key: 'organizationType', displayName: 'Organization type', description: 'Customer / vendor / guarantor entity / advisor firm / internal / other.' },
    { key: 'crmRecordStatus', displayName: 'CRM record status', description: 'Active / inactive / archived.' },
    { key: 'contactType', displayName: 'Contact type', description: 'Email / phone / mobile / mail / portal.' },
    { key: 'authorizationStatus', displayName: 'Authorization status', description: 'Authorized / pending / expired / revoked.' },
    { key: 'relationshipType', displayName: 'Relationship type', description: 'Borrower / guarantor / owner / officer / advisor / vendor / affiliate.' },
    { key: 'roleType', displayName: 'Role type', description: 'Portfolio manager / servicing owner / relationship manager / borrower contact / etc.' },
    { key: 'vendorType', displayName: 'Vendor type', description: 'CPA / attorney / title / appraiser / environmental / insurance / etc.' },
    { key: 'consentStatus', displayName: 'Consent status', description: 'Granted / withheld / withdrawn / unknown.' },
    { key: 'communicationMethod', displayName: 'Communication method', description: 'Email / phone / mail / portal.' },
    { key: 'timelineEventType', displayName: 'Timeline event type', description: 'Relationship timeline event categories.' },
  ]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const ALL_CRM_TARGET_TABLE_LOGICAL_NAMES: readonly string[] =
  Object.freeze(CRM_TARGET_TABLES.map((t) => t.logicalName));

export function getCrmTargetTable(
  logicalName: string,
): CrmTargetTablePlan | undefined {
  return CRM_TARGET_TABLES.find((t) => t.logicalName === logicalName);
}

export function crmTargetColumnsForTable(
  logicalName: string,
): readonly CrmTargetColumnPlan[] {
  return CRM_TARGET_COLUMNS.filter((c) => c.tableLogicalName === logicalName);
}

/** Seed order: target tables ordered by their declared seedOrder. */
export const CRM_SEED_ORDER: readonly string[] = Object.freeze(
  [...CRM_TARGET_TABLES]
    .sort((a, b) => a.seedOrder - b.seedOrder)
    .map((t) => t.logicalName),
);

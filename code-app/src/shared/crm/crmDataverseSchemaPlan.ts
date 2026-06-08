/**
 * Phase 141B-H — CRM Dataverse schema PLAN (constants only).
 *
 * The declarative target schema for persisting the CRM relationship master. No
 * schema is created in this phase; this is the plan a future guarded seed phase
 * would implement, and the contract the disabled adapter maps toward.
 *
 * Discipline: pure data. No IO, no fake records, all logical names use the
 * project publisher prefix `cr664_`. Nothing here creates schema.
 */

export const CRM_SCHEMA_VERSION = '141B-H.1';
export const CRM_PUBLISHER_PREFIX = 'cr664';

export interface CrmTargetTablePlan {
  logicalName: string;
  displayName: string;
  primaryNameColumn: string;
  sourceModelType: string;
  description: string;
}

export const CRM_TARGET_TABLES: readonly CrmTargetTablePlan[] = Object.freeze([
  { logicalName: 'cr664_crmorganization', displayName: 'CRM Organization', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmOrganization', description: 'Customers, vendors, guarantor entities, advisor firms, internal orgs.' },
  { logicalName: 'cr664_crmperson', displayName: 'CRM Person', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmPerson', description: 'People: customer contacts, guarantors, advisors, internal contacts.' },
  { logicalName: 'cr664_crmcontactpoint', displayName: 'CRM Contact Point', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmContactPoint', description: 'Email / phone / mail / portal contact points for an org or person.' },
  { logicalName: 'cr664_crmrelationship', displayName: 'CRM Relationship', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmRelationship', description: 'Typed relationships between organizations and people.' },
  { logicalName: 'cr664_crmroleassignment', displayName: 'CRM Role Assignment', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmRoleAssignment', description: 'Role assignments (portfolio manager, relationship manager, etc.).' },
  { logicalName: 'cr664_crmcommunicationpreference', displayName: 'CRM Communication Preference', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmCommunicationPreference', description: 'Channel / do-not-contact preferences per entity.' },
  { logicalName: 'cr664_crmcontactauthorization', displayName: 'CRM Contact Authorization', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmContactAuthorization', description: 'Document-upload / financial-disclosure / servicing authorizations.' },
  { logicalName: 'cr664_crmtimelineevent', displayName: 'CRM Timeline Event', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmTimelineEvent', description: 'Relationship timeline events.' },
  { logicalName: 'cr664_crmauditentry', displayName: 'CRM Audit Entry', primaryNameColumn: 'cr664_name', sourceModelType: 'CrmAuditEntry', description: 'CRM change audit trail.' },
]);

export interface CrmTargetRelationshipPlan {
  relationshipSchemaName: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  required: boolean;
  description: string;
}

export const CRM_TARGET_RELATIONSHIPS: readonly CrmTargetRelationshipPlan[] = Object.freeze([
  { relationshipSchemaName: 'cr664_crmperson_organization', fromTable: 'cr664_crmperson', fromColumn: 'cr664_Organization', toTable: 'cr664_crmorganization', required: false, description: 'A person may belong to an organization.' },
  { relationshipSchemaName: 'cr664_crmcontactpoint_organization', fromTable: 'cr664_crmcontactpoint', fromColumn: 'cr664_OwnerOrganization', toTable: 'cr664_crmorganization', required: false, description: 'A contact point owned by an organization.' },
  { relationshipSchemaName: 'cr664_crmcontactpoint_person', fromTable: 'cr664_crmcontactpoint', fromColumn: 'cr664_OwnerPerson', toTable: 'cr664_crmperson', required: false, description: 'A contact point owned by a person.' },
  { relationshipSchemaName: 'cr664_crmroleassignment_person', fromTable: 'cr664_crmroleassignment', fromColumn: 'cr664_Person', toTable: 'cr664_crmperson', required: true, description: 'A role assignment belongs to a person.' },
  { relationshipSchemaName: 'cr664_crmcontactauthorization_person', fromTable: 'cr664_crmcontactauthorization', fromColumn: 'cr664_Person', toTable: 'cr664_crmperson', required: true, description: 'An authorization belongs to a person.' },
  // Optional link from a CRM relationship to a portfolio boarded loan.
  { relationshipSchemaName: 'cr664_crmrelationship_boardedloan', fromTable: 'cr664_crmrelationship', fromColumn: 'cr664_BoardedLoan', toTable: 'cr664_portfolioboardedloan', required: false, description: 'Optional link from a CRM relationship to a boarded loan.' },
]);

export const CRM_TARGET_OPTION_SETS: readonly { key: string; displayName: string }[] = Object.freeze([
  { key: 'organizationType', displayName: 'Organization type' },
  { key: 'personType', displayName: 'Person type' },
  { key: 'contactChannel', displayName: 'Contact channel' },
  { key: 'relationshipType', displayName: 'Relationship type' },
  { key: 'role', displayName: 'Role' },
  { key: 'authorizationType', displayName: 'Authorization type' },
]);

export const ALL_CRM_TARGET_TABLE_LOGICAL_NAMES: readonly string[] = Object.freeze(
  CRM_TARGET_TABLES.map((t) => t.logicalName),
);

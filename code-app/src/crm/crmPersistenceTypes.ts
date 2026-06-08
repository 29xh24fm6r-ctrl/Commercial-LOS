/**
 * Phase 141B-H — CRM persistence types (adapter seam).
 *
 * Declares the operations a future CRM persistence adapter would support. No
 * schema is created and no live writes happen in 141B-H. There is NO delete.
 */

import type {
  CrmMaster,
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

export interface CrmPersistenceResult {
  ok: boolean;
  operation: string;
  recordId?: string;
  errorCode?: string;
  message?: string;
}

export interface CrmReadResult<T> {
  ok: boolean;
  data?: T;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Phase 141L — live persistence contract
// ---------------------------------------------------------------------------

/** The stable structured error codes the live CRM adapter returns. */
export const CRM_PERSISTENCE_ERROR_CODES = Object.freeze({
  notConfigured: 'crm_persistence_not_configured',
  livePersistenceDisabled: 'crm_live_persistence_disabled',
  schemaNotReady: 'crm_schema_not_ready',
  permissionDenied: 'crm_permission_denied',
  validationFailed: 'crm_validation_failed',
  unsupportedOperation: 'crm_unsupported_operation',
  transportFailed: 'crm_transport_failed',
  disallowedTable: 'crm_disallowed_table',
  disallowedDelete: 'crm_disallowed_delete',
  sensitiveValueBlocked: 'crm_sensitive_value_blocked',
} as const);

export type CrmPersistenceErrorCode =
  (typeof CRM_PERSISTENCE_ERROR_CODES)[keyof typeof CRM_PERSISTENCE_ERROR_CODES];

export interface CrmValidationError {
  field: string;
  message: string;
}

/** The structured result every live CRM persistence operation returns. */
export interface CrmLiveResult<T = unknown> {
  ok: boolean;
  operation: string;
  recordId?: string;
  records?: readonly T[];
  data?: T;
  errorCode?: CrmPersistenceErrorCode;
  message?: string;
  validationErrors?: readonly CrmValidationError[];
}

/**
 * The richer live CRM persistence adapter contract (Phase 141L). Read/search +
 * non-destructive writes only — there is NO delete operation anywhere.
 */
export interface CrmLivePersistenceAdapter {
  readonly enabled: boolean;

  // Read / search
  searchOrganizations(query?: string): Promise<CrmLiveResult<CrmOrganization>>;
  readOrganization(recordId: string): Promise<CrmLiveResult<CrmOrganization>>;
  searchPeople(query?: string): Promise<CrmLiveResult<CrmPerson>>;
  readPerson(recordId: string): Promise<CrmLiveResult<CrmPerson>>;
  searchContactPoints(query?: string): Promise<CrmLiveResult<CrmContactPoint>>;
  searchRelationships(query?: string): Promise<CrmLiveResult<CrmRelationship>>;
  searchRoleAssignments(query?: string): Promise<CrmLiveResult<CrmRoleAssignment>>;
  searchVendorProfiles(query?: string): Promise<CrmLiveResult<CrmVendorProfile>>;
  searchTimelineEvents(query?: string): Promise<CrmLiveResult<CrmTimelineEvent>>;

  // Write (non-destructive; no delete)
  saveOrganization(org: CrmOrganization): Promise<CrmLiveResult>;
  savePerson(person: CrmPerson): Promise<CrmLiveResult>;
  saveContactPoint(contactPoint: CrmContactPoint): Promise<CrmLiveResult>;
  saveRelationship(relationship: CrmRelationship): Promise<CrmLiveResult>;
  saveRoleAssignment(role: CrmRoleAssignment): Promise<CrmLiveResult>;
  saveCommunicationPreference(
    pref: CrmCommunicationPreference,
  ): Promise<CrmLiveResult>;
  saveContactAuthorization(
    auth: CrmContactAuthorization,
  ): Promise<CrmLiveResult>;
  saveVendorProfile(vendor: CrmVendorProfile): Promise<CrmLiveResult>;
  addTimelineEvent(event: CrmTimelineEvent): Promise<CrmLiveResult>;
  addAuditEntry(entry: CrmAuditEntry): Promise<CrmLiveResult>;
}

export interface CrmPersistenceAdapter {
  readonly enabled: boolean;
  readCrmMaster(): Promise<CrmReadResult<CrmMaster>>;
  searchOrganizations(query?: string): Promise<CrmReadResult<readonly CrmOrganization[]>>;
  searchPeople(query?: string): Promise<CrmReadResult<readonly CrmPerson[]>>;
  saveOrganization(org: CrmOrganization): Promise<CrmPersistenceResult>;
  savePerson(person: CrmPerson): Promise<CrmPersistenceResult>;
  saveContactPoint(contactPoint: CrmContactPoint): Promise<CrmPersistenceResult>;
  saveRelationship(relationship: CrmRelationship): Promise<CrmPersistenceResult>;
  addRoleAssignment(role: CrmRoleAssignment): Promise<CrmPersistenceResult>;
  addAuthorization(auth: CrmContactAuthorization): Promise<CrmPersistenceResult>;
  addTimelineEvent(event: CrmTimelineEvent): Promise<CrmPersistenceResult>;
  addAuditEntry(entry: CrmAuditEntry): Promise<CrmPersistenceResult>;
}

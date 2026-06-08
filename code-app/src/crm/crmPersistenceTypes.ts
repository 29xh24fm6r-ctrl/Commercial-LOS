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
  CrmContactAuthorization,
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

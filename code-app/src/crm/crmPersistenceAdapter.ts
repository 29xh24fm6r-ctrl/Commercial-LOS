/**
 * Phase 141B-H — CRM persistence adapter.
 *
 * Disabled by default. Every operation fails closed with `not_configured`.
 * 141B-H ships NO live CRM writes; a live adapter arrives only once a guarded
 * CRM schema/persistence phase is approved.
 */

import type {
  CrmPersistenceAdapter,
  CrmPersistenceResult,
  CrmReadResult,
} from './crmPersistenceTypes';

function notConfigured(operation: string): Promise<CrmPersistenceResult> {
  return Promise.resolve({
    ok: false,
    operation,
    errorCode: 'not_configured',
    message: 'CRM persistence is not enabled.',
  });
}

function notConfiguredRead<T>(): Promise<CrmReadResult<T>> {
  return Promise.resolve({ ok: false, errorCode: 'not_configured' });
}

export function createDisabledCrmPersistenceAdapter(): CrmPersistenceAdapter {
  return {
    enabled: false,
    readCrmMaster: () => notConfiguredRead(),
    searchOrganizations: () => notConfiguredRead(),
    searchPeople: () => notConfiguredRead(),
    saveOrganization: () => notConfigured('saveOrganization'),
    savePerson: () => notConfigured('savePerson'),
    saveContactPoint: () => notConfigured('saveContactPoint'),
    saveRelationship: () => notConfigured('saveRelationship'),
    addRoleAssignment: () => notConfigured('addRoleAssignment'),
    addAuthorization: () => notConfigured('addAuthorization'),
    addTimelineEvent: () => notConfigured('addTimelineEvent'),
    addAuditEntry: () => notConfigured('addAuditEntry'),
  };
}

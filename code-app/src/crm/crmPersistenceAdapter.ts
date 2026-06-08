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

// ---------------------------------------------------------------------------
// Phase 141L — the richer live persistence adapter contract.
//
// The disabled live adapter (default) and the live adapter factory live in
// `crmLiveDataverseAdapter.ts`; they are re-exported here so the persistence
// contract has one entry point. The live adapter is never wired by default —
// `resolveCrmPersistenceAdapter` returns the disabled one unless every gate
// passes and a transport is injected.
// ---------------------------------------------------------------------------

export {
  createCrmLiveDataverseAdapter,
  createDisabledCrmLiveDataverseAdapter,
} from './crmLiveDataverseAdapter';
export type {
  CrmLivePersistenceAdapter,
  CrmLiveResult,
  CrmPersistenceErrorCode,
} from './crmPersistenceTypes';
export { CRM_PERSISTENCE_ERROR_CODES } from './crmPersistenceTypes';

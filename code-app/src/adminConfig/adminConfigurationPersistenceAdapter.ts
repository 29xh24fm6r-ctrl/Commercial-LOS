/**
 * Phase 142J — Admin configuration persistence adapter CONTRACT + shared helpers.
 *
 * Re-exports the adapter seam and provides the shared result / readiness builders
 * used by the disabled and (write-disabled) Dataverse adapters. The contract
 * models READ + future SAVE of proposal / decision / audit records ONLY. There is
 * NO applyProposal, deployProposal, publishProposal, activateProposal,
 * mutateSchema, createField, registerRoute, enableIntegration, widenPermission,
 * executeWorkflow, approveCredit, waiveCovenant, or delete method. Save methods
 * are blocked by default; nothing writes to Dataverse in this phase.
 */

import type {
  AdminConfigurationPersistenceAdapter,
  AdminConfigurationPersistenceAuditSummary,
  AdminConfigurationPersistenceErrorCode,
  AdminConfigurationPersistenceListResult,
  AdminConfigurationPersistenceMode,
  AdminConfigurationPersistenceReadiness,
  AdminConfigurationPersistenceResult,
  AdminConfigurationPersistenceStatus,
} from './adminConfigurationPersistenceTypes';

export type { AdminConfigurationPersistenceAdapter } from './adminConfigurationPersistenceTypes';

export function persistenceAuditSummary(operation: string): AdminConfigurationPersistenceAuditSummary {
  return { operation, wroteToDataverse: false, appliedConfig: false, containsSensitiveValue: false, readOnly: true };
}

export function blockedResult<T = unknown>(
  operation: string,
  errorCode: AdminConfigurationPersistenceErrorCode,
  message: string,
): AdminConfigurationPersistenceResult<T> {
  return {
    ok: false,
    operation,
    errorCode,
    message,
    blockers: [{ code: errorCode, message }],
    warnings: [],
    auditSummary: persistenceAuditSummary(operation),
  };
}

export function emptyListResult<T>(
  operation: string,
  errorCode?: AdminConfigurationPersistenceErrorCode,
  message?: string,
): AdminConfigurationPersistenceListResult<T> {
  return { ok: errorCode === undefined, operation, data: [], errorCode, message };
}

export function disabledReadiness(
  mode: AdminConfigurationPersistenceMode,
  status: AdminConfigurationPersistenceStatus,
  message: string,
): AdminConfigurationPersistenceReadiness {
  return {
    mode,
    status,
    schemaReady: false,
    readEnabled: false,
    writeEnabled: false,
    applyEnabled: false,
    blockers: status === 'disabled_not_configured'
      ? [{ code: 'admin_config_persistence_disabled', message }]
      : [{ code: 'admin_config_persistence_not_configured', message }],
    warnings: [],
    nextBestAction: { code: 'review_persistence_plan', label: 'Review the persistence plan and schema readiness (no write, no apply).' },
  };
}

/** Re-typed identity helper so consumers can annotate an adapter without importing the type path twice. */
export function asPersistenceAdapter(adapter: AdminConfigurationPersistenceAdapter): AdminConfigurationPersistenceAdapter {
  return adapter;
}

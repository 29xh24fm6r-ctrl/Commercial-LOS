/**
 * Phase 142J — Admin configuration Dataverse persistence adapter SEAM (write disabled).
 *
 * A gated seam toward future persistence. It performs NO global fetch, holds NO
 * raw Dataverse client in React, writes NOTHING by default, deletes NOTHING, and
 * applies NOTHING. Even when every gate opens, writes stay disabled
 * (`live_write_disabled`) in this phase. Reads are modeled but only the three
 * admin-config entity sets are ever addressable — an arbitrary entity set is
 * rejected.
 */

import type {
  AdminConfigurationPersistenceAdapter,
  AdminConfigurationPersistenceListResult,
  AdminConfigurationPersistenceMode,
  AdminConfigurationPersistenceReadiness,
  AdminConfigurationPersistenceResult,
  AdminConfigurationPersistenceSchemaState,
  AdminConfigurationPersistenceStatus,
  AdminConfigurationProposalRecord,
} from './adminConfigurationPersistenceTypes';
import { blockedResult, emptyListResult } from './adminConfigurationPersistenceAdapter';
import type { AdminConfigPersistenceFeatureFlags } from './adminConfigurationPersistenceFeatureFlags';
import { ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST } from './adminConfigurationDataverseSchemaPlan';

/** A future read-only transport abstraction. This module never constructs one. */
export interface AdminConfigPersistenceTransport {
  readonly kind: 'admin_config_persistence_transport';
}

export interface CreateAdminConfigDataverseAdapterInput {
  transport?: AdminConfigPersistenceTransport;
  flags: AdminConfigPersistenceFeatureFlags;
  schemaReadiness: AdminConfigurationPersistenceSchemaState;
  permissionContext?: { grantedPermissions?: readonly string[] };
  policyContext?: { persistenceAllowed?: boolean };
  clock?: string;
}

const REQUIRED_PERMISSION = 'admin.config.persistence.use';

/** The allowlist guard — only the three admin-config entity sets are addressable. */
export function assertAllowedAdminConfigEntitySet(entitySet: string): boolean {
  return ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST.includes(entitySet);
}

interface Gate {
  mode: AdminConfigurationPersistenceMode;
  status: AdminConfigurationPersistenceStatus;
  gatesOpen: boolean;
  readEnabled: boolean;
}

function evaluateGate(input: CreateAdminConfigDataverseAdapterInput): Gate {
  const { flags } = input;
  if (!flags.ADMIN_CONFIG_PERSISTENCE_ENABLED) {
    return { mode: 'disabled', status: 'disabled_not_configured', gatesOpen: false, readEnabled: false };
  }
  if (!input.schemaReadiness.schemaReady) {
    return { mode: 'disabled', status: 'schema_not_ready', gatesOpen: false, readEnabled: false };
  }
  if (!input.transport) {
    return { mode: 'disabled', status: 'blocked_by_missing_transport', gatesOpen: false, readEnabled: false };
  }
  const granted = new Set(input.permissionContext?.grantedPermissions ?? []);
  if (!granted.has(REQUIRED_PERMISSION)) {
    return { mode: 'disabled', status: 'blocked_by_permission', gatesOpen: false, readEnabled: false };
  }
  if (input.policyContext?.persistenceAllowed !== true) {
    return { mode: 'disabled', status: 'blocked_by_policy', gatesOpen: false, readEnabled: false };
  }
  // Every gate open — but writes remain disabled in this phase.
  return {
    mode: 'live_write_disabled',
    status: 'ready_for_future_persistence',
    gatesOpen: true,
    readEnabled: flags.ADMIN_CONFIG_PERSISTENCE_READ_ENABLED === true,
  };
}

export function createAdminConfigurationDataversePersistenceAdapter(
  input: CreateAdminConfigDataverseAdapterInput,
): AdminConfigurationPersistenceAdapter {
  const gate = evaluateGate(input);

  const saveBlocked = (operation: string): AdminConfigurationPersistenceResult =>
    gate.status === 'disabled_not_configured'
      ? blockedResult(operation, 'admin_config_persistence_disabled', 'Admin configuration persistence is disabled.')
      : blockedResult(operation, 'admin_config_write_forbidden', 'Live writes are disabled in this phase.');

  function readList<T>(operation: string, entitySet: string): AdminConfigurationPersistenceListResult<T> {
    if (!assertAllowedAdminConfigEntitySet(entitySet)) {
      return emptyListResult<T>(operation, 'admin_config_unsupported_operation', `Entity set ${entitySet} is not in the admin-config allowlist.`);
    }
    if (!gate.gatesOpen || !gate.readEnabled) {
      return emptyListResult<T>(operation, gate.status === 'disabled_not_configured' ? 'admin_config_persistence_disabled' : 'admin_config_persistence_not_configured', 'Read is not enabled.');
    }
    // Reads are modeled only — no transport call is made in this phase.
    return { ok: true, operation, data: [] };
  }

  const readiness: AdminConfigurationPersistenceReadiness = {
    mode: gate.mode,
    status: gate.status,
    schemaReady: input.schemaReadiness.schemaReady,
    readEnabled: gate.readEnabled,
    writeEnabled: false,
    applyEnabled: false,
    blockers: gate.gatesOpen ? [] : [{ code: 'admin_config_persistence_not_configured', message: `Persistence not active: ${gate.status}.` }],
    warnings: gate.gatesOpen ? [{ code: 'write_disabled', message: 'Writes remain disabled in this phase.' }] : [],
    nextBestAction: { code: 'await_future_activation', label: 'Await future activation (policy approval, transport, permission); writes stay disabled.' },
  };

  return {
    mode: gate.mode,
    getStatus: () => gate.status,
    getReadiness: () => readiness,
    listProposals: () => readList('listProposals', ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST[0]),
    readProposal: (proposalId) => ({ ...saveBlockedRead<AdminConfigurationProposalRecord>('readProposal', gate), recordId: proposalId }),
    saveProposal: () => saveBlocked('saveProposal'),
    listReviewDecisions: () => readList('listReviewDecisions', ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST[1]),
    saveReviewDecision: () => saveBlocked('saveReviewDecision'),
    listAuditEntries: () => readList('listAuditEntries', ADMIN_CONFIG_PERSISTENCE_ENTITY_SET_ALLOWLIST[2]),
    saveAuditEntry: () => saveBlocked('saveAuditEntry'),
  };
}

function saveBlockedRead<T>(operation: string, gate: Gate): AdminConfigurationPersistenceResult<T> {
  return gate.status === 'disabled_not_configured'
    ? blockedResult<T>(operation, 'admin_config_persistence_disabled', 'Admin configuration persistence is disabled.')
    : blockedResult<T>(operation, 'admin_config_persistence_not_configured', 'Read is not enabled.');
}

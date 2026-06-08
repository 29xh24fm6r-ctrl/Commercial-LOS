/**
 * Phase 141L — CRM runtime schema gate.
 *
 * The fail-closed gate that decides whether the live CRM write path may turn on.
 * It compares an INJECTED verified-schema state against the plan's expected
 * counts and combines it with the feature flags, adapter mode, and operator
 * authorization. No capability is granted unless every input proves it.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. The verified-schema state is injected by a loader/config —
 *     this module never probes Dataverse and never fakes readiness.
 *   - Fail-closed: `schemaReady` requires the verified table + column counts to
 *     MEET the plan with zero conflicts. Missing OPTIONAL relationships are a
 *     warning only (the CRM plan's relationships are all optional links).
 *   - Create/update require schemaReady + live persistence + a live adapter + an
 *     authorized operator. Read-only never grants write authority.
 */

import {
  CRM_TARGET_TABLES,
  CRM_TARGET_COLUMNS,
  CRM_TARGET_RELATIONSHIPS,
} from './crmDataverseSchemaPlan';

/**
 * Plan-derived expectations (no hardcoded magic numbers). Columns exclude the
 * per-table primary `cr664_name` (created with the table), matching the Phase
 * 141J-K seed verification count.
 */
export const EXPECTED_CRM_SCHEMA = Object.freeze({
  tables: CRM_TARGET_TABLES.length,
  columns: CRM_TARGET_COLUMNS.filter((c) => c.logicalName !== 'cr664_name').length,
  relationships: CRM_TARGET_RELATIONSHIPS.length,
});

export interface VerifiedCrmSchemaState {
  tablesFound: number;
  columnsFound: number;
  relationshipsFound: number;
  conflicts: number;
}

export interface CrmRuntimeSchemaGateInput {
  /** Verified live schema state, injected by loader/config (not probed here). */
  verified: VerifiedCrmSchemaState;
  flags: {
    readonly CRM_LIVE_PERSISTENCE_ENABLED: boolean;
  };
  /** The resolved adapter's own enabled state. */
  adapterEnabled: boolean;
  /** From the existing identity/entitlement chain. */
  isAuthorizedOperator: boolean;
  /** Whether the adapter supports reads (default true). */
  adapterSupportsRead?: boolean;
}

export interface CrmRuntimeSchemaGateResult {
  schemaReady: boolean;
  livePersistenceEnabled: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canRead: boolean;
  canSearch: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

export function deriveCrmRuntimeSchemaGate(
  input: CrmRuntimeSchemaGateInput,
): CrmRuntimeSchemaGateResult {
  const v = input.verified;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (v.conflicts > 0) {
    blockers.push(`${v.conflicts} schema conflict(s) block runtime CRM persistence.`);
  }
  if (v.tablesFound < EXPECTED_CRM_SCHEMA.tables) {
    blockers.push(`Only ${v.tablesFound}/${EXPECTED_CRM_SCHEMA.tables} required CRM tables verified.`);
  }
  if (v.columnsFound < EXPECTED_CRM_SCHEMA.columns) {
    blockers.push(`Only ${v.columnsFound}/${EXPECTED_CRM_SCHEMA.columns} required CRM columns verified.`);
  }
  if (v.relationshipsFound < EXPECTED_CRM_SCHEMA.relationships) {
    warnings.push(
      `Only ${v.relationshipsFound}/${EXPECTED_CRM_SCHEMA.relationships} optional CRM relationships present (warning, not a blocker).`,
    );
  }

  const schemaReady = blockers.length === 0;
  const livePersistenceEnabled = input.flags.CRM_LIVE_PERSISTENCE_ENABLED === true;
  const supportsRead = input.adapterSupportsRead !== false;

  const writeAllowed =
    schemaReady &&
    livePersistenceEnabled &&
    input.adapterEnabled &&
    input.isAuthorizedOperator;

  const readAllowed =
    schemaReady &&
    input.adapterEnabled &&
    input.isAuthorizedOperator &&
    supportsRead;

  return {
    schemaReady,
    livePersistenceEnabled,
    canCreate: writeAllowed,
    canUpdate: writeAllowed,
    canRead: readAllowed,
    canSearch: readAllowed,
    blockers,
    warnings,
  };
}

export class CrmSchemaNotReadyError extends Error {
  readonly blockers: readonly string[];
  constructor(blockers: readonly string[]) {
    super(`CRM schema is not ready for runtime persistence: ${blockers.join('; ')}`);
    this.name = 'CrmSchemaNotReadyError';
    this.blockers = blockers;
  }
}

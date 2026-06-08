/**
 * Phase 140Q — Portfolio Boarding runtime schema gate.
 *
 * The final fail-closed gate that decides whether the live write path may turn
 * on. It compares an INJECTED verified-schema state against the plan's expected
 * counts and combines it with the feature flags, adapter mode, and operator
 * authorization. No capability is granted unless every input proves it.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. The verified-schema state is injected by a loader/config —
 *     this module never probes Dataverse and never fakes readiness.
 *   - Fail-closed: `schemaReady` requires the verified required-table /
 *     required-column / required-relationship counts to MEET the plan, with
 *     zero conflicts. Missing OPTIONAL relationships are a warning only.
 *   - Create/update require schemaReady + live persistence + route + a live
 *     adapter + an authorized operator. Read-only never grants write authority.
 */

import {
  ALL_TARGET_TABLE_LOGICAL_NAMES,
  PORTFOLIO_BOARDING_TARGET_COLUMNS,
  PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS,
  childTableRelationships,
} from './portfolioLoanBoardingDataverseSchemaPlan';

/** Plan-derived expectations (no hardcoded magic numbers). */
export const EXPECTED_BOARDING_SCHEMA = Object.freeze({
  tables: ALL_TARGET_TABLE_LOGICAL_NAMES.length,
  columns: PORTFOLIO_BOARDING_TARGET_COLUMNS.length,
  requiredRelationships: childTableRelationships().length,
  optionalRelationships: PORTFOLIO_BOARDING_TARGET_RELATIONSHIPS.filter(
    (r) => !r.required,
  ).length,
});

export interface VerifiedBoardingSchemaState {
  tablesFound: number;
  columnsFound: number;
  requiredRelationshipsFound: number;
  optionalRelationshipsFound: number;
  conflicts: number;
}

export interface RuntimeSchemaGateInput {
  /** Verified live schema state, injected by loader/config (not probed here). */
  verified: VerifiedBoardingSchemaState;
  flags: {
    readonly PORTFOLIO_BOARDING_ROUTE_ENABLED: boolean;
    readonly PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: boolean;
  };
  /** The resolved adapter's own enabled state. */
  adapterEnabled: boolean;
  /** From the existing identity/entitlement chain. */
  isAuthorizedOperator: boolean;
  /** Whether the adapter supports reads (default true). */
  adapterSupportsRead?: boolean;
}

export interface PortfolioBoardingRuntimeSchemaGateResult {
  schemaReady: boolean;
  livePersistenceEnabled: boolean;
  routeEnabled: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canRead: boolean;
  canSearch: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

export function derivePortfolioBoardingRuntimeSchemaGate(
  input: RuntimeSchemaGateInput,
): PortfolioBoardingRuntimeSchemaGateResult {
  const v = input.verified;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (v.conflicts > 0) {
    blockers.push(`${v.conflicts} schema conflict(s) block runtime persistence.`);
  }
  if (v.tablesFound < EXPECTED_BOARDING_SCHEMA.tables) {
    blockers.push(
      `Only ${v.tablesFound}/${EXPECTED_BOARDING_SCHEMA.tables} required tables verified.`,
    );
  }
  if (v.columnsFound < EXPECTED_BOARDING_SCHEMA.columns) {
    blockers.push(
      `Only ${v.columnsFound}/${EXPECTED_BOARDING_SCHEMA.columns} required columns verified.`,
    );
  }
  if (v.requiredRelationshipsFound < EXPECTED_BOARDING_SCHEMA.requiredRelationships) {
    blockers.push(
      `Only ${v.requiredRelationshipsFound}/${EXPECTED_BOARDING_SCHEMA.requiredRelationships} required child→root lookups verified.`,
    );
  }
  if (v.optionalRelationshipsFound < EXPECTED_BOARDING_SCHEMA.optionalRelationships) {
    warnings.push(
      `Only ${v.optionalRelationshipsFound}/${EXPECTED_BOARDING_SCHEMA.optionalRelationships} optional relationships present (warning, not a blocker).`,
    );
  }

  const schemaReady = blockers.length === 0;
  const livePersistenceEnabled =
    input.flags.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED === true;
  const routeEnabled = input.flags.PORTFOLIO_BOARDING_ROUTE_ENABLED === true;
  const supportsRead = input.adapterSupportsRead !== false;

  const writeAllowed =
    schemaReady &&
    livePersistenceEnabled &&
    routeEnabled &&
    input.adapterEnabled &&
    input.isAuthorizedOperator;

  const readAllowed =
    input.adapterEnabled && input.isAuthorizedOperator && supportsRead;

  return {
    schemaReady,
    livePersistenceEnabled,
    routeEnabled,
    canCreate: writeAllowed,
    canUpdate: writeAllowed,
    canRead: readAllowed,
    canSearch: readAllowed,
    blockers,
    warnings,
  };
}

export class PortfolioBoardingSchemaNotReadyError extends Error {
  readonly blockers: readonly string[];
  constructor(blockers: readonly string[]) {
    super(`Portfolio boarding schema is not ready for runtime: ${blockers.join('; ')}`);
    this.name = 'PortfolioBoardingSchemaNotReadyError';
    this.blockers = blockers;
  }
}

/**
 * Throws a structured error when the schema is not verified ready. Used at the
 * boundary where a caller is about to enable live writes.
 */
export function assertPortfolioBoardingSchemaReadyForRuntime(
  input: RuntimeSchemaGateInput,
): PortfolioBoardingRuntimeSchemaGateResult {
  const result = derivePortfolioBoardingRuntimeSchemaGate(input);
  if (!result.schemaReady) {
    throw new PortfolioBoardingSchemaNotReadyError(result.blockers);
  }
  return result;
}

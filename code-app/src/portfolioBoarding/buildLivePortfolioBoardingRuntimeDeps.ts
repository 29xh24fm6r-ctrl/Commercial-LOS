/**
 * Live runtime wiring for portfolio boarding persistence — the glue between
 * an authenticated banker/manager session and
 * `resolvePortfolioLoanBoardingRuntimeAdapter` (`resolvePortfolioLoanBoardingPersistenceAdapter.ts`).
 *
 * Resolves the three inputs that adapter needs beyond the feature flags:
 *   - `verified`: hydrated from the already-committed, token-backed
 *     `CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE` (13/13 tables, 219 columns,
 *     12 required relationships — measured live, per
 *     `runtimeVerifiedSchemaBridge.ts`). No new verification is performed
 *     here; this only reads the evidence already recorded.
 *   - `isAuthorizedOperator`: the same "does this actor have a resolved
 *     Dataverse identity" baseline `crmWriteAdapter.ts`'s `authGate` uses —
 *     there is no dedicated boarding-specific role today, so authorization
 *     here means "a write-capable banker/manager session," matching the
 *     CRM domain's convention.
 *   - `client`: the live `DataverseWriteClient`
 *     (`portfolioLoanBoardingDataverseWriteClient.ts`).
 *
 * With `PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED` /
 * `PORTFOLIO_BOARDING_ROUTE_ENABLED` both still false (the safe defaults),
 * the resolver always returns the disabled adapter here regardless of what
 * this module wires — flipping those flags is a separate, governed step.
 */

import {
  resolvePortfolioLoanBoardingRuntimeAdapter,
  type RuntimeAdapterResolution,
} from './resolvePortfolioLoanBoardingPersistenceAdapter';
import { resolvePortfolioBoardingFeatureFlags } from './portfolioLoanBoardingFeatureFlags';
import { buildLivePortfolioBoardingDataverseWriteClient } from './portfolioLoanBoardingDataverseWriteClient';
import {
  hydrateVerifiedBoardingSchemaState,
  CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE,
} from '../admin/runtimeVerifiedSchemaBridge';
import type { VerifiedBoardingSchemaState } from './portfolioBoardingRuntimeSchemaGate';

const UNVERIFIED_STATE: VerifiedBoardingSchemaState = Object.freeze({
  tablesFound: 0,
  columnsFound: 0,
  requiredRelationshipsFound: 0,
  optionalRelationshipsFound: 0,
  conflicts: 0,
});

/** Resolve the hydrated schema state from committed evidence — never fabricated, fails to the zeroed state if hydration itself reports blockers. */
function resolveVerifiedBoardingSchemaState(): VerifiedBoardingSchemaState {
  const result = hydrateVerifiedBoardingSchemaState(CURRENT_PORTFOLIO_VERIFICATION_EVIDENCE);
  return result.hydrated && result.verified ? result.verified : UNVERIFIED_STATE;
}

export function buildLivePortfolioBoardingRuntimeAdapter(input: {
  /** Whether the acting session has a resolved Dataverse write identity. */
  isAuthorizedOperator: boolean;
}): RuntimeAdapterResolution {
  return resolvePortfolioLoanBoardingRuntimeAdapter({
    flags: resolvePortfolioBoardingFeatureFlags(),
    verified: resolveVerifiedBoardingSchemaState(),
    isAuthorizedOperator: input.isAuthorizedOperator,
    client: buildLivePortfolioBoardingDataverseWriteClient(),
  });
}

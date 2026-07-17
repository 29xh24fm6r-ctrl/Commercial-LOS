/**
 * Phase 140Q — Portfolio Boarding RUNTIME persistence resolver.
 *
 * The single decision point that combines feature flags, the verified-schema
 * gate, operator authorization, and an injected Dataverse client into either
 * the live persistence adapter or the disabled one. It FAILS CLOSED: the live
 * adapter is returned ONLY when every gate passes AND a client is injected.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. No default client is ever constructed here.
 *   - Disabled by default. Live persistence requires: a client, the live +
 *     route flags, an authorized operator, and a schema-ready verification.
 */

import type { PortfolioBoardingFeatureFlags } from './portfolioLoanBoardingFeatureFlags';
import type {
  PortfolioBoardingLivePersistenceAdapter,
} from './portfolioLoanBoardingLivePersistence';
import {
  createDisabledPortfolioBoardingLivePersistenceAdapter,
  createPortfolioBoardingLivePersistenceAdapter,
} from './portfolioLoanBoardingLivePersistence';
import {
  createLivePortfolioBoardingTransport,
  type DataverseWriteClient,
} from './portfolioLoanBoardingLiveDataverseTransport';
import {
  derivePortfolioBoardingRuntimeSchemaGate,
  type VerifiedBoardingSchemaState,
  type PortfolioBoardingRuntimeSchemaGateResult,
} from './portfolioBoardingRuntimeSchemaGate';
import {
  capabilityAvailable,
  capabilityUnavailable,
  type CapabilityAvailability,
  type CapabilityBlockingReason,
} from '../shared/governance/capabilityAvailability';

export interface RuntimeAdapterResolveInput {
  flags: PortfolioBoardingFeatureFlags;
  verified: VerifiedBoardingSchemaState;
  isAuthorizedOperator: boolean;
  /** The injected Dataverse client. Absent → disabled adapter. */
  client?: DataverseWriteClient;
}

export interface RuntimeAdapterResolution {
  gate: PortfolioBoardingRuntimeSchemaGateResult;
  adapter: PortfolioBoardingLivePersistenceAdapter;
  /** True when the live adapter was constructed. */
  live: boolean;
}

export function resolvePortfolioLoanBoardingRuntimeAdapter(
  input: RuntimeAdapterResolveInput,
): RuntimeAdapterResolution {
  const wantLive =
    input.client !== undefined &&
    input.flags.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED === true &&
    input.flags.PORTFOLIO_BOARDING_ROUTE_ENABLED === true &&
    input.isAuthorizedOperator === true;

  const gate = derivePortfolioBoardingRuntimeSchemaGate({
    verified: input.verified,
    flags: input.flags,
    adapterEnabled: wantLive,
    isAuthorizedOperator: input.isAuthorizedOperator,
  });

  if (wantLive && gate.schemaReady && input.client) {
    return {
      gate,
      live: true,
      adapter: createPortfolioBoardingLivePersistenceAdapter({
        transport: createLivePortfolioBoardingTransport({ client: input.client }),
      }),
    };
  }

  return {
    gate,
    live: false,
    adapter: createDisabledPortfolioBoardingLivePersistenceAdapter(),
  };
}

/**
 * Factory Arc Phase 6 — the "portfolio-boarding" CapabilityAvailability,
 * composed from the same facts `resolvePortfolioLoanBoardingRuntimeAdapter`
 * already evaluates: operator authorization (audit-identity), the two
 * deployment-level feature flags (permission), and the schema-verification
 * gate's own blockers (connection — a live backend dependency, the verified
 * boarding schema, isn't ready). No duplicated logic: `gate` is the SAME
 * `PortfolioBoardingRuntimeSchemaGateResult` the adapter resolver produces.
 */
export function derivePortfolioBoardingAvailability(
  isAuthorizedOperator: boolean,
  gate: PortfolioBoardingRuntimeSchemaGateResult,
  checkedAt: string,
): CapabilityAvailability {
  const reasons: CapabilityBlockingReason[] = [];
  if (!isAuthorizedOperator) {
    reasons.push({
      kind: 'audit-identity',
      detail: 'No resolved actor identity is available for this banker/manager session.',
    });
  }
  if (!gate.livePersistenceEnabled || !gate.routeEnabled) {
    reasons.push({
      kind: 'permission',
      detail: 'Live boarding persistence is not enabled in this environment.',
    });
  }
  for (const blocker of gate.blockers) {
    reasons.push({ kind: 'connection', detail: blocker });
  }
  if (reasons.length === 0) return capabilityAvailable('portfolio-boarding', checkedAt);
  return capabilityUnavailable('portfolio-boarding', reasons, checkedAt);
}

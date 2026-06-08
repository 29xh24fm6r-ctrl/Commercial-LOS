/**
 * Phase 140L — Portfolio Loan Boarding persistence adapter RESOLVER.
 *
 * The single decision point for whether the app gets the live persistence
 * adapter or the disabled one. It FAILS CLOSED: the live adapter is returned
 * only when the feature flag is enabled AND a transport is injected. With no
 * arguments, the flag off, or no transport, the disabled adapter is returned.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO. No default transport is ever constructed here.
 *   - Disabled by default. There is no path that enables live persistence
 *     without both the flag and an injected transport.
 */

import {
  resolvePortfolioBoardingFeatureFlags,
} from './portfolioLoanBoardingFeatureFlags';

/** Only the live-persistence flag is consulted by the resolver. */
type LivePersistenceFlag = {
  readonly PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: boolean;
};
import type {
  PortfolioBoardingLivePersistenceAdapter,
  PortfolioBoardingTransport,
} from './portfolioLoanBoardingLivePersistence';
import {
  createDisabledPortfolioBoardingLivePersistenceAdapter,
  createPortfolioBoardingLivePersistenceAdapter,
} from './portfolioLoanBoardingLivePersistence';

export interface ResolveAdapterInput {
  /** Resolved feature flags. Defaults to all-off when omitted. */
  flags?: LivePersistenceFlag;
  /** The injected Dataverse transport. Absent → disabled adapter. */
  transport?: PortfolioBoardingTransport;
}

export function resolvePortfolioBoardingPersistenceAdapter(
  input: ResolveAdapterInput = {},
): PortfolioBoardingLivePersistenceAdapter {
  const flags = input.flags ?? resolvePortfolioBoardingFeatureFlags();
  const enabled =
    flags.PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED === true &&
    input.transport !== undefined;

  if (enabled && input.transport) {
    return createPortfolioBoardingLivePersistenceAdapter({
      transport: input.transport,
    });
  }
  return createDisabledPortfolioBoardingLivePersistenceAdapter();
}

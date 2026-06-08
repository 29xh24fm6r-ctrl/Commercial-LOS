/**
 * Phase 140L — Portfolio Loan Boarding feature flags.
 *
 * Gates the first real app-runtime write capability for portfolio boarding.
 * Flags are resolved from an injected config object only — never from an
 * environment secret in client code — and they FAIL CLOSED: a flag is enabled
 * only when its config value is exactly `true`.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no secrets, no env reads.
 *   - Default is DISABLED. An absent / undefined / non-`true` config value
 *     leaves the flag off.
 */

export interface PortfolioBoardingFeatureFlagConfig {
  /** Enables the live Dataverse persistence adapter. Default: disabled. */
  livePersistenceEnabled?: boolean;
}

export interface PortfolioBoardingFeatureFlags {
  readonly PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: boolean;
}

/** The safe defaults: every portfolio boarding runtime capability is off. */
export const PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS: PortfolioBoardingFeatureFlags =
  Object.freeze({
    PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED: false,
  });

/**
 * Resolve the portfolio boarding feature flags from an optional config. With
 * no config (or any non-`true` value) every flag stays disabled.
 */
export function resolvePortfolioBoardingFeatureFlags(
  config?: PortfolioBoardingFeatureFlagConfig,
): PortfolioBoardingFeatureFlags {
  return {
    PORTFOLIO_BOARDING_LIVE_PERSISTENCE_ENABLED:
      config?.livePersistenceEnabled === true,
  };
}

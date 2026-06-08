/**
 * Phase 140Q — Portfolio Boarding feature flags (stable re-export).
 *
 * The canonical flag definitions live in `portfolioLoanBoardingFeatureFlags`
 * (Phase 140L/M-P). This module re-exports them under the shorter name the
 * runtime layer references, so there is exactly ONE source of truth for the
 * flags and their safe-off defaults.
 */

export type {
  PortfolioBoardingFeatureFlagConfig,
  PortfolioBoardingFeatureFlags,
} from './portfolioLoanBoardingFeatureFlags';
export {
  PORTFOLIO_BOARDING_FEATURE_FLAG_DEFAULTS,
  resolvePortfolioBoardingFeatureFlags,
} from './portfolioLoanBoardingFeatureFlags';

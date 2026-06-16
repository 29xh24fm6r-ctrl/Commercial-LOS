/**
 * Phase 177A -- Portfolio side-effects adapter (DISABLED / SKIPPED_NOT_NEEDED).
 *
 * Portfolio dashboards derive from the Loan Deal via existing loaders, so the
 * default and recommended outcome is `skipped_not_needed` (no write). An
 * explicit portfolio write happens only when an approved mapping exists AND the
 * gate is enabled. Disabled by default; no portfolio service imported (IO
 * injected); no fabricated portfolio metrics.
 */

import type { PortfolioSideEffectsOutcome } from './dealOriginationOutcomes';
import {
  isPortfolioSideEffectsEnabled,
  type DealOriginationFeatureFlagConfig,
} from './dealOriginationFeatureFlags';

const MODULE = 'portfolio-side-effects';

/** Allow-listed portfolio write payload keys (only if an explicit mapping exists). */
export const PORTFOLIO_SIDE_EFFECTS_ALLOWED_FIELDS = Object.freeze([
  'cr664_Deal@odata.bind',
  'cr664_correlationid',
] as const);

export interface PortfolioSideEffectsInput {
  readonly dealId: string | undefined;
  readonly actorSystemUserId: string | undefined;
  readonly authorized: boolean;
  readonly correlationId: string;
  readonly config?: DealOriginationFeatureFlagConfig;
  /**
   * Whether portfolio views derive from the Loan Deal (the normal case). When
   * true, no explicit write is needed -> skipped_not_needed.
   */
  readonly portfolioDerivesFromDeal?: boolean;
  /** Whether an approved explicit portfolio mapping/table exists. */
  readonly explicitMappingApproved?: boolean;
  /** Test-only gate override. Production never sets it (uses config). */
  readonly enabledOverride?: boolean;
}

export type RunPortfolioWrite = (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

export async function runNewDealPortfolioSideEffects(
  input: PortfolioSideEffectsInput,
  runPortfolioWrite?: RunPortfolioWrite,
): Promise<PortfolioSideEffectsOutcome> {
  const enabled = input.enabledOverride ?? isPortfolioSideEffectsEnabled(input.config);
  if (!enabled) {
    return { module: MODULE, kind: 'disabled', detail: 'Portfolio side-effects gate is off.' };
  }
  if (!input.dealId) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No created deal id.' };
  }
  if (!input.authorized || !input.actorSystemUserId) {
    return { module: MODULE, kind: 'unauthorized', detail: 'Actor not authorized.' };
  }
  // Default: portfolio reflects the deal via existing loaders -> no write.
  if (input.portfolioDerivesFromDeal !== false) {
    return {
      module: MODULE,
      kind: 'skipped_not_needed',
      detail: 'Portfolio dashboards derive from the Loan Deal; no explicit write needed.',
    };
  }
  if (!input.explicitMappingApproved) {
    return {
      module: MODULE,
      kind: 'skipped_no_portfolio_mapping',
      detail: 'No approved explicit portfolio mapping/table.',
    };
  }
  if (!runPortfolioWrite) {
    return { module: MODULE, kind: 'dependency_not_ready', detail: 'No portfolio transport injected.' };
  }
  const payload = {
    'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    cr664_correlationid: input.correlationId,
  };
  const stray = Object.keys(payload).filter(
    (k) => !(PORTFOLIO_SIDE_EFFECTS_ALLOWED_FIELDS as readonly string[]).includes(k),
  );
  if (stray.length > 0) {
    return { module: MODULE, kind: 'failed', detail: `Disallowed portfolio field(s): ${stray.join(', ')}.` };
  }
  try {
    const res = await runPortfolioWrite(payload);
    if (!res.ok) return { module: MODULE, kind: 'failed', detail: res.error ?? 'Portfolio write failed.' };
    return { module: MODULE, kind: 'success', correlationId: input.correlationId };
  } catch (err) {
    return { module: MODULE, kind: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

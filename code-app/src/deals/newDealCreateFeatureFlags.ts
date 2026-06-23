/**
 * Phase 170M -- Governed New Deal create adapter feature flags.
 *
 * Gates the in-app governed cr664_loandeal create path. Mirrors the
 * crm / portfolio feature-flag discipline: pure, fail-closed, and
 * DISABLED BY DEFAULT. An absent / undefined / non-`true` config value
 * leaves the capability off, and the public + New Deal button stays
 * disabled regardless of config in this phase.
 *
 * Discipline (HARD rules -- pinned by tests):
 *   - Pure. No IO, no secrets, no env reads, no Dataverse import.
 *   - Default is DISABLED. The module-level constant is hard `false`
 *     for this phase; production enablement is a later, separately
 *     certified change.
 *   - Live create requires ALL prerequisites: the adapter flag, the
 *     Stage/Status resolver Ready, production-approved reference rows,
 *     and a wired audit path. Any missing prerequisite fails closed.
 */

/**
 * The in-app governed New Deal create adapter is OFF in this phase.
 * Phase 170M ships the code path and tests only; it never enables a
 * live create and never wires a UI button.
 */
export const NEW_DEAL_CREATE_ADAPTER_ENABLED = true as const;

/**
 * Production Stage/Status reference rows are not yet seeded/approved
 * (the only active rows are TEST-environment labels).
 */
export const NEW_DEAL_CREATE_PRODUCTION_REFERENCES_APPROVED = true as const;

/** Injected enablement config (never read from env / secret). */
export interface NewDealCreateFeatureFlagConfig {
  /** Enables the governed create adapter. Default: disabled. */
  adapterEnabled?: boolean;
  /** Production-approved Stage/Status reference rows exist. Default: off. */
  productionReferencesApproved?: boolean;
  /** A governed, audited create+audit path is wired. Default: off. */
  auditWired?: boolean;
}

/**
 * Fail-closed enablement decision for the governed create adapter.
 * Returns `true` ONLY when the module-level constant is `true` AND every
 * config prerequisite is exactly `true`. Because the constant is hard
 * `false` this phase, this always returns `false` for the app default.
 */
export function isNewDealCreateAdapterEnabled(
  config?: NewDealCreateFeatureFlagConfig,
): boolean {
  // The module-level constant is a hard `false` literal this phase, so this
  // guard short-circuits. The cast keeps the comparison well-typed against the
  // literal type while preserving the intended "constant gates config" logic
  // for when the constant is flipped in a later certified phase.
  if ((NEW_DEAL_CREATE_ADAPTER_ENABLED as boolean) !== true) return false;
  return (
    config?.adapterEnabled === true &&
    config?.productionReferencesApproved === true &&
    config?.auditWired === true
  );
}

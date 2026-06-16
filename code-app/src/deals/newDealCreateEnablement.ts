/**
 * Phase 170O -- Controlled, fail-closed New Deal create enablement reader.
 *
 * Decides whether the governed create adapter may run, based ONLY on injected
 * config + environment + authorization + resolver readiness. Pure: no IO, no
 * env/secret reads, no Dataverse import, no persistence. It NEVER changes the
 * hard `NEW_DEAL_CREATE_ADAPTER_ENABLED = false` default; an explicit, approved
 * config is the only way to reach an enabled state, and only for an allowed
 * non-production (pilot/test) environment held by an authorized admin/dev with
 * a Ready resolver.
 *
 * Fail-closed by construction: a missing / malformed config, an unknown
 * environment, a non-admin user, a not-ready resolver, or production without an
 * explicit (and test-pinned) production rollout approval all resolve to a
 * disabled / blocked state. The default (no inputs) is `disabled`.
 */

import type { NewDealCreateFeatureFlagConfig } from './newDealCreateFeatureFlags';

export type NewDealCreateEnablementState =
  | 'disabled'
  | 'enabled_nonprod_only'
  | 'unauthorized'
  | 'config_invalid'
  | 'environment_not_allowed'
  | 'resolver_not_ready';

export interface NewDealCreateEnvironment {
  /** Stable environment name, e.g. 'pilot' / 'test' / 'production'. */
  readonly name?: string;
  /** True when the target is the production environment. */
  readonly isProduction?: boolean;
}

export interface NewDealCreateAuthorization {
  /** True only for admin/dev operators permitted to use the controlled path. */
  readonly isAdminOrDev?: boolean;
  /** Resolved Dataverse systemuser of the actor (the write identity). */
  readonly actorSystemUserId?: string | null;
}

export interface NewDealCreateEnablementConfig extends NewDealCreateFeatureFlagConfig {
  /** Approved non-production environment names (lower-cased compare). */
  readonly allowedNonProdEnvironments?: readonly string[];
  /** Explicit production rollout approval -- a separate, higher bar. */
  readonly productionRolloutApproved?: boolean;
}

export interface NewDealCreateEnablementInput {
  readonly config?: NewDealCreateEnablementConfig;
  readonly environment?: NewDealCreateEnvironment;
  readonly authorization?: NewDealCreateAuthorization;
  /** Whether the Stage/Status resolver returned approved (Ready) binds. */
  readonly resolverReady?: boolean;
  /** Whether the resolved references are production-approved (not TEST-only). */
  readonly referencesProductionApproved?: boolean;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A present-but-wrong-shape config is malformed and fails closed. */
function isMalformedConfig(config: unknown): boolean {
  if (config === undefined) return false; // absent is not malformed (-> disabled)
  if (!isPlainRecord(config)) return true;
  const boolFields = [
    'adapterEnabled',
    'productionReferencesApproved',
    'auditWired',
    'productionRolloutApproved',
  ];
  for (const f of boolFields) {
    if (f in config && typeof config[f] !== 'boolean') return true;
  }
  if (
    'allowedNonProdEnvironments' in config &&
    !Array.isArray(config.allowedNonProdEnvironments)
  ) {
    return true;
  }
  return false;
}

/**
 * Evaluate the controlled enablement state. Fail-closed: the most specific
 * blocking state is returned, and `enabled_nonprod_only` requires EVERY gate
 * to pass. The default (no inputs) is `disabled`.
 */
export function evaluateNewDealCreateEnablement(
  input: NewDealCreateEnablementInput = {},
): NewDealCreateEnablementState {
  const { config, environment, authorization, resolverReady, referencesProductionApproved } =
    input;

  // 1. Malformed config (present but wrong shape) fails closed.
  if (isMalformedConfig(config)) return 'config_invalid';

  // 2. Not explicitly approved by config -> disabled (the safe default). An
  //    absent / empty / non-`true` config can never enable.
  const approvedByConfig = config?.adapterEnabled === true && config?.auditWired === true;
  if (!approvedByConfig) return 'disabled';

  // 3. Authorization: admin/dev + a resolved actor systemuser.
  if (authorization?.isAdminOrDev !== true) return 'unauthorized';
  if (!authorization?.actorSystemUserId) return 'unauthorized';

  // 4. Environment must be known.
  const envName = (environment?.name ?? '').trim();
  if (envName.length === 0) return 'environment_not_allowed';

  // 5. Production is a separate, higher bar. Disabled unless an explicit
  //    (test-pinned) production rollout approval AND production-approved
  //    references are present. TEST references can NEVER enable production.
  if (environment?.isProduction === true) {
    if (config?.productionRolloutApproved !== true) return 'environment_not_allowed';
    if (config?.productionReferencesApproved !== true) return 'environment_not_allowed';
    if (referencesProductionApproved !== true) return 'environment_not_allowed';
  } else {
    // 6. Non-production: must be an explicitly allowed environment.
    const allowed = (config?.allowedNonProdEnvironments ?? []).map((e) =>
      e.trim().toLowerCase(),
    );
    if (!allowed.includes(envName.toLowerCase())) return 'environment_not_allowed';
  }

  // 7. Resolver must be Ready (approved binds) before any enable.
  if (resolverReady !== true) return 'resolver_not_ready';

  // 8. Every gate passed -> controlled enablement (pilot / approved rollout).
  return 'enabled_nonprod_only';
}

/** True only when the controlled path may construct live deps and submit. */
export function isNewDealCreateControlledEnabled(
  input: NewDealCreateEnablementInput = {},
): boolean {
  return evaluateNewDealCreateEnablement(input) === 'enabled_nonprod_only';
}

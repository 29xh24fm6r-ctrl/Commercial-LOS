/**
 * Phase 142J — Admin configuration persistence feature flags.
 *
 * Gates the FUTURE persistence path. Flags resolve from an injected config object
 * only — never from an environment secret in client code — and FAIL CLOSED. In
 * this phase WRITE and APPLY are HARD-PINNED false regardless of config: no
 * client value can enable a live write or an apply. Persistence and read default
 * off; dry-run-only defaults true.
 */

export interface AdminConfigPersistenceFeatureFlagConfig {
  persistenceEnabled?: boolean;
  readEnabled?: boolean;
  /** Ignored in this phase — write stays pinned false. */
  writeEnabled?: boolean;
  dryRunOnly?: boolean;
  /** Ignored in this phase — apply stays pinned false. */
  applyEnabled?: boolean;
}

export interface AdminConfigPersistenceFeatureFlags {
  readonly ADMIN_CONFIG_PERSISTENCE_ENABLED: boolean;
  readonly ADMIN_CONFIG_PERSISTENCE_READ_ENABLED: boolean;
  readonly ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED: boolean;
  readonly ADMIN_CONFIG_PERSISTENCE_DRY_RUN_ONLY: boolean;
  readonly ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED: boolean;
}

/** Safe defaults — persistence off, read off, write off, dry-run only, apply off. */
export const ADMIN_CONFIG_PERSISTENCE_FEATURE_FLAG_DEFAULTS: AdminConfigPersistenceFeatureFlags = Object.freeze({
  ADMIN_CONFIG_PERSISTENCE_ENABLED: false,
  ADMIN_CONFIG_PERSISTENCE_READ_ENABLED: false,
  ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED: false,
  ADMIN_CONFIG_PERSISTENCE_DRY_RUN_ONLY: true,
  ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED: false,
});

export function resolveAdminConfigPersistenceFeatureFlags(
  config?: AdminConfigPersistenceFeatureFlagConfig,
): AdminConfigPersistenceFeatureFlags {
  return {
    ADMIN_CONFIG_PERSISTENCE_ENABLED: config?.persistenceEnabled === true,
    ADMIN_CONFIG_PERSISTENCE_READ_ENABLED: config?.readEnabled === true,
    // Write + apply are forbidden in this phase — never enabled by config.
    ADMIN_CONFIG_PERSISTENCE_WRITE_ENABLED: false,
    ADMIN_CONFIG_PERSISTENCE_DRY_RUN_ONLY: config?.dryRunOnly !== false,
    ADMIN_CONFIG_PERSISTENCE_APPLY_ENABLED: false,
  };
}

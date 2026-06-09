/**
 * Phase 142K — Admin configuration apply feature flags.
 *
 * Gates the controlled-apply WORKFLOW (preview modeling only). Flags resolve from
 * an injected config object — never an environment secret — and FAIL CLOSED. In
 * this phase EXECUTION and every dangerous flag (schema mutation, integration
 * enable, permission widening, route registration) are HARD-PINNED false. Preview
 * and workflow default on; dry-run-only defaults true.
 */

export interface AdminConfigApplyFeatureFlagConfig {
  applyWorkflowEnabled?: boolean;
  applyPreviewEnabled?: boolean;
  /** Ignored in this phase — execution stays pinned false. */
  applyExecutionEnabled?: boolean;
  dryRunOnly?: boolean;
  /** Ignored in this phase — pinned false. */
  schemaMutationAllowed?: boolean;
  integrationEnableAllowed?: boolean;
  permissionWideningAllowed?: boolean;
  routeRegistrationAllowed?: boolean;
}

export interface AdminConfigApplyFeatureFlags {
  readonly ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED: boolean;
  readonly ADMIN_CONFIG_APPLY_PREVIEW_ENABLED: boolean;
  readonly ADMIN_CONFIG_APPLY_EXECUTION_ENABLED: boolean;
  readonly ADMIN_CONFIG_APPLY_DRY_RUN_ONLY: boolean;
  readonly ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED: boolean;
  readonly ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED: boolean;
  readonly ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED: boolean;
  readonly ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED: boolean;
}

/** Safe defaults — preview modeling on, execution + dangerous flags off, dry-run only. */
export const ADMIN_CONFIG_APPLY_FEATURE_FLAG_DEFAULTS: AdminConfigApplyFeatureFlags = Object.freeze({
  ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED: true,
  ADMIN_CONFIG_APPLY_PREVIEW_ENABLED: true,
  ADMIN_CONFIG_APPLY_EXECUTION_ENABLED: false,
  ADMIN_CONFIG_APPLY_DRY_RUN_ONLY: true,
  ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED: false,
  ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED: false,
  ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED: false,
  ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED: false,
});

/** Fully-disabled flags — used as the safe default when no flags are supplied. */
export const ADMIN_CONFIG_APPLY_FEATURE_FLAGS_DISABLED: AdminConfigApplyFeatureFlags = Object.freeze({
  ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED: false,
  ADMIN_CONFIG_APPLY_PREVIEW_ENABLED: false,
  ADMIN_CONFIG_APPLY_EXECUTION_ENABLED: false,
  ADMIN_CONFIG_APPLY_DRY_RUN_ONLY: true,
  ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED: false,
  ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED: false,
  ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED: false,
  ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED: false,
});

export function resolveAdminConfigApplyFeatureFlags(
  config?: AdminConfigApplyFeatureFlagConfig,
): AdminConfigApplyFeatureFlags {
  return {
    ADMIN_CONFIG_APPLY_WORKFLOW_ENABLED: config?.applyWorkflowEnabled !== false,
    ADMIN_CONFIG_APPLY_PREVIEW_ENABLED: config?.applyPreviewEnabled !== false,
    // Execution + dangerous flags are forbidden in this phase — never enabled by config.
    ADMIN_CONFIG_APPLY_EXECUTION_ENABLED: false,
    ADMIN_CONFIG_APPLY_DRY_RUN_ONLY: config?.dryRunOnly !== false,
    ADMIN_CONFIG_SCHEMA_MUTATION_ALLOWED: false,
    ADMIN_CONFIG_INTEGRATION_ENABLE_ALLOWED: false,
    ADMIN_CONFIG_PERMISSION_WIDENING_ALLOWED: false,
    ADMIN_CONFIG_ROUTE_REGISTRATION_ALLOWED: false,
  };
}

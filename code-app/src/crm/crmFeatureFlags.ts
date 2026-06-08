/**
 * Phase 141L — CRM feature flags.
 *
 * Gates the first real app-runtime write capability for the CRM Relationship
 * Master. Flags are resolved from an injected config object only — never from an
 * environment secret in client code — and they FAIL CLOSED: a capability is
 * enabled only when its config value is exactly `true` AND its prerequisites
 * are met.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no secrets, no env reads.
 *   - Default is DISABLED. An absent / undefined / non-`true` config value
 *     leaves the flag off.
 *   - Live persistence requires CRM_LIVE_PERSISTENCE_ENABLED. Editing requires
 *     persistence. The route stays disabled in this phase regardless of config.
 */

// ---------------------------------------------------------------------------
// Default constants (every CRM runtime capability is off in this phase)
// ---------------------------------------------------------------------------

export const CRM_ROUTE_ENABLED = false;
export const CRM_LIVE_PERSISTENCE_ENABLED = false;
export const CRM_CONTACT_EDITING_ENABLED = false;
export const CRM_VENDOR_EDITING_ENABLED = false;
export const CRM_TIMELINE_ENABLED = false;
export const CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED = false;

export interface CrmFeatureFlagConfig {
  /** Enables the live Dataverse persistence adapter. Default: disabled. */
  livePersistenceEnabled?: boolean;
  /** Would expose the CRM operator route. Forced OFF in this phase. */
  routeEnabled?: boolean;
  /** Enables contact-point editing. Requires live persistence. Default: off. */
  contactEditingEnabled?: boolean;
  /** Enables vendor-profile editing. Requires live persistence. Default: off. */
  vendorEditingEnabled?: boolean;
  /** Enables timeline writes. Requires live persistence. Default: off. */
  timelineEnabled?: boolean;
  /** Enables annual-review CRM integration (read-only seam). Default: off. */
  annualReviewIntegrationEnabled?: boolean;
}

export interface CrmFeatureFlagState {
  readonly CRM_ROUTE_ENABLED: boolean;
  readonly CRM_LIVE_PERSISTENCE_ENABLED: boolean;
  readonly CRM_CONTACT_EDITING_ENABLED: boolean;
  readonly CRM_VENDOR_EDITING_ENABLED: boolean;
  readonly CRM_TIMELINE_ENABLED: boolean;
  readonly CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED: boolean;
}

/** The safe defaults: every CRM runtime capability is off. */
export const CRM_FEATURE_FLAG_DEFAULTS: CrmFeatureFlagState = Object.freeze({
  CRM_ROUTE_ENABLED: false,
  CRM_LIVE_PERSISTENCE_ENABLED: false,
  CRM_CONTACT_EDITING_ENABLED: false,
  CRM_VENDOR_EDITING_ENABLED: false,
  CRM_TIMELINE_ENABLED: false,
  CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED: false,
});

/**
 * Resolve the CRM feature-flag state from an optional config. With no config
 * (or any non-`true` value) every flag stays disabled (fail-closed).
 *
 * Dependency rules:
 *   - The route stays OFF in this phase even if the config asks for it.
 *   - Editing / timeline capabilities require live persistence to be enabled;
 *     they are forced off otherwise.
 */
export function deriveCrmFeatureFlagState(
  config?: CrmFeatureFlagConfig,
): CrmFeatureFlagState {
  const livePersistence = config?.livePersistenceEnabled === true;
  return {
    // Route registration is intentionally not enabled in Phase 141L.
    CRM_ROUTE_ENABLED: false,
    CRM_LIVE_PERSISTENCE_ENABLED: livePersistence,
    CRM_CONTACT_EDITING_ENABLED:
      livePersistence && config?.contactEditingEnabled === true,
    CRM_VENDOR_EDITING_ENABLED:
      livePersistence && config?.vendorEditingEnabled === true,
    CRM_TIMELINE_ENABLED: livePersistence && config?.timelineEnabled === true,
    CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED:
      config?.annualReviewIntegrationEnabled === true,
  };
}

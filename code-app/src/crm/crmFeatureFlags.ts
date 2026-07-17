/**
 * Phase 141L ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â CRM feature flags.
 *
 * Gates the first real app-runtime write capability for the CRM Relationship
 * Master. Flags are resolved from an injected config object only ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never from an
 * environment secret in client code ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â and they FAIL CLOSED: a capability is
 * enabled only when its config value is exactly `true` AND its prerequisites
 * are met.
 *
 * Discipline (HARD rules ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pinned by tests):
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
// Completion Phase A — reset to the SAFE DEFAULT (off). Armed deliberately only once the live
// CRM schema is verified (VerifiedCrmSchemaState injected) and authentic writeback evidence is
// captured. The runtime schema gate remains the second safety layer.
export const CRM_LIVE_PERSISTENCE_ENABLED = false;
export const CRM_CONTACT_EDITING_ENABLED = false;
export const CRM_VENDOR_EDITING_ENABLED = false;
export const CRM_TIMELINE_ENABLED = false;
export const CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED = false;
// CRM-ELITE-1 Phase 2 — read-only relationship-health card + team rollup inside
// the already-live, already-authorized CRM Hub. No new Dataverse read, no write.
export const CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED = false as const;
// CRM-ELITE-1 Phase 3 — live manager/executive CRM rollups, replacing the
// hardcoded crmWorkspacePreviewInputs.ts strip. Read-only.
export const CRM_LIVE_ROLLUPS_ENABLED = false as const;
// CRM-ELITE-1 Phase 4 — banker daily action queue populated from real signals
// only (missing-contact / activity-gap categories). Read-only.
export const CRM_DAILY_ACTION_QUEUE_ENABLED = false as const;

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
  /** Enables the relationship-health card + team rollup inside the CRM Hub. Default: off. */
  relationshipHealthDisplayEnabled?: boolean;
  /** Enables live manager/executive CRM rollups (replaces the hardcoded preview strip). Default: off. */
  liveRollupsEnabled?: boolean;
  /** Enables the banker daily action queue (real signals only). Default: off. */
  dailyActionQueueEnabled?: boolean;
}

export interface CrmFeatureFlagState {
  readonly CRM_ROUTE_ENABLED: boolean;
  readonly CRM_LIVE_PERSISTENCE_ENABLED: boolean;
  readonly CRM_CONTACT_EDITING_ENABLED: boolean;
  readonly CRM_VENDOR_EDITING_ENABLED: boolean;
  readonly CRM_TIMELINE_ENABLED: boolean;
  readonly CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED: boolean;
  readonly CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED: boolean;
  readonly CRM_LIVE_ROLLUPS_ENABLED: boolean;
  readonly CRM_DAILY_ACTION_QUEUE_ENABLED: boolean;
}

/** The safe defaults: every CRM runtime capability is off. */
export const CRM_FEATURE_FLAG_DEFAULTS: CrmFeatureFlagState = Object.freeze({
  CRM_ROUTE_ENABLED: false,
  CRM_LIVE_PERSISTENCE_ENABLED: false,
  CRM_CONTACT_EDITING_ENABLED: false,
  CRM_VENDOR_EDITING_ENABLED: false,
  CRM_TIMELINE_ENABLED: false,
  CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED: false,
  CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED: false,
  CRM_LIVE_ROLLUPS_ENABLED: false,
  CRM_DAILY_ACTION_QUEUE_ENABLED: false,
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
    CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED:
      config?.relationshipHealthDisplayEnabled === true,
    CRM_LIVE_ROLLUPS_ENABLED: config?.liveRollupsEnabled === true,
    CRM_DAILY_ACTION_QUEUE_ENABLED: config?.dailyActionQueueEnabled === true,
  };
}

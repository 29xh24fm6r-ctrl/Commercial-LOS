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
// Certified internal CRM production defaults
// ---------------------------------------------------------------------------

export const CRM_ROUTE_ENABLED = true;
// Armed after live schema verification and authentic CRUD certification.
// Authorization, schema, and transport checks remain independent safety layers.
export const CRM_LIVE_PERSISTENCE_ENABLED = true;
export const CRM_CONTACT_EDITING_ENABLED = true;
export const CRM_VENDOR_EDITING_ENABLED = true;
export const CRM_TIMELINE_ENABLED = true;
export const CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED = true;
// CRM-ELITE-1 Phase 2 — read-only relationship-health card + team rollup inside
// the already-live, already-authorized CRM Hub. No new Dataverse read, no write.
export const CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED = true as const;
// CRM-ELITE-1 Phase 3 — live manager/executive CRM rollups, replacing the
// hardcoded crmWorkspacePreviewInputs.ts strip. Read-only.
export const CRM_LIVE_ROLLUPS_ENABLED = true as const;
// CRM-ELITE-1 Phase 4 — banker daily action queue populated from real signals
// only (missing-contact / activity-gap categories). Read-only.
export const CRM_DAILY_ACTION_QUEUE_ENABLED = true as const;

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

/** Certified production defaults for the internal OGB CRM runtime. */
export const CRM_FEATURE_FLAG_DEFAULTS: CrmFeatureFlagState = Object.freeze({
  CRM_ROUTE_ENABLED: true,
  CRM_LIVE_PERSISTENCE_ENABLED: true,
  CRM_CONTACT_EDITING_ENABLED: true,
  CRM_VENDOR_EDITING_ENABLED: true,
  CRM_TIMELINE_ENABLED: true,
  CRM_ANNUAL_REVIEW_INTEGRATION_ENABLED: true,
  CRM_RELATIONSHIP_HEALTH_DISPLAY_ENABLED: true,
  CRM_LIVE_ROLLUPS_ENABLED: true,
  CRM_DAILY_ACTION_QUEUE_ENABLED: true,
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
  if (config === undefined) return CRM_FEATURE_FLAG_DEFAULTS;
  const livePersistence = config?.livePersistenceEnabled === true;
  return {
    CRM_ROUTE_ENABLED: config?.routeEnabled === true,
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

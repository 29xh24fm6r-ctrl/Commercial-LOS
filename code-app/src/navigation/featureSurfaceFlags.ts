/**
 * Phase 3 — Feature-surface route flags.
 *
 * One default-OFF flag per previously-unrouted subsystem surface. When a flag is
 * false the surface route renders an honest "not yet enabled" state (never a blank
 * screen and never a live write). Flipping a flag true only reveals a READ-ONLY
 * preview surface — no write path is enabled by these flags.
 *
 * Every flag here defaults to `false`. These are routing/visibility flags only; they
 * are independent of the live-write governance flags in the per-domain flag modules.
 */

export interface FeatureSurfaceFlags {
  readonly PLATFORM_CATALOG_ROUTE_ENABLED: boolean;
  readonly ADMIN_CONFIG_ROUTE_ENABLED: boolean;
  readonly INTEGRATIONS_ROUTE_ENABLED: boolean;
  readonly SERVICING_ROUTE_ENABLED: boolean;
  readonly ANNUAL_REVIEW_ROUTE_ENABLED: boolean;
  readonly PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: boolean;
  readonly COMMITTEE_ROUTE_ENABLED: boolean;
  readonly CRM_COMMAND_CENTER_ROUTE_ENABLED: boolean;
  readonly PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED: boolean;
}

export type FeatureSurfaceFlagName = keyof FeatureSurfaceFlags;

/** Frozen defaults — every feature-surface route is OFF by default. */
export const FEATURE_SURFACE_FLAG_DEFAULTS: FeatureSurfaceFlags = Object.freeze({
  PLATFORM_CATALOG_ROUTE_ENABLED: false,
  ADMIN_CONFIG_ROUTE_ENABLED: false,
  INTEGRATIONS_ROUTE_ENABLED: false,
  SERVICING_ROUTE_ENABLED: false,
  ANNUAL_REVIEW_ROUTE_ENABLED: false,
  PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: false,
  COMMITTEE_ROUTE_ENABLED: false,
  CRM_COMMAND_CENTER_ROUTE_ENABLED: false,
  PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED: false,
});

/** True only when the named feature-surface route flag is explicitly enabled. */
export function isFeatureSurfaceFlagEnabled(flag: FeatureSurfaceFlagName): boolean {
  return FEATURE_SURFACE_FLAG_DEFAULTS[flag] === true;
}

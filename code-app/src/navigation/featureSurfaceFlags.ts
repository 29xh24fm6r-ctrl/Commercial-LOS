/**
 * Phase 3 — Feature-surface route flags.
 *
 * One default-OFF flag per previously-unrouted subsystem surface. When a flag is
 * false the surface route renders an honest "not yet enabled" state (never a blank
 * screen and never a live write). Flipping a flag true only reveals a READ-ONLY
 * preview surface — no write path is enabled by these flags.
 *
 * These are routing/visibility (read-only) flags, independent of the live-write
 * governance flags in the per-domain flag modules. Every flag defaults to `false`
 * EXCEPT `PORTFOLIO_BOOK_DATA_ENABLED`, which is intentionally activated after
 * portfolio-book smoke evidence (the boarded-book Portfolio Command Center feed
 * is live). No flag here enables a write path.
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
  readonly CRM_INTELLIGENCE_ROUTE_ENABLED: boolean;
  readonly PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED: boolean;
  readonly PORTFOLIO_BOOK_DATA_ENABLED: boolean;
}

export type FeatureSurfaceFlagName = keyof FeatureSurfaceFlags;

/**
 * Frozen defaults — every feature-surface route is OFF by default, except the
 * intentionally-activated PORTFOLIO_BOOK_DATA_ENABLED (see below).
 */
export const FEATURE_SURFACE_FLAG_DEFAULTS: FeatureSurfaceFlags = Object.freeze({
  PLATFORM_CATALOG_ROUTE_ENABLED: false,
  ADMIN_CONFIG_ROUTE_ENABLED: false,
  INTEGRATIONS_ROUTE_ENABLED: false,
  SERVICING_ROUTE_ENABLED: false,
  ANNUAL_REVIEW_ROUTE_ENABLED: false,
  PORTFOLIO_ANNUAL_REVIEW_ROUTE_ENABLED: false,
  COMMITTEE_ROUTE_ENABLED: false,
  // CRM-C — intentionally activated. Routes the standalone CRM Command Center
  // destination (unified readiness + read-only CRM intelligence) so CRM no longer
  // lives only as the hidden crm-hub BankerShell tab. READ-ONLY: reveals status +
  // intelligence only; live create/edit stay in the identity-gated CRM Hub, and no
  // write path is enabled by this flag.
  CRM_COMMAND_CENTER_ROUTE_ENABLED: true,
  CRM_INTELLIGENCE_ROUTE_ENABLED: false,
  PORTFOLIO_BOARDING_SURFACE_ROUTE_ENABLED: false,
  // Intentionally ON — activated after portfolio-book smoke evidence. Routes the
  // Portfolio Command Center to the live boarded-book feed. Read-only; no write.
  PORTFOLIO_BOOK_DATA_ENABLED: true,
});

/** True only when the named feature-surface route flag is explicitly enabled. */
export function isFeatureSurfaceFlagEnabled(flag: FeatureSurfaceFlagName): boolean {
  return FEATURE_SURFACE_FLAG_DEFAULTS[flag] === true;
}

/** PE-WIRE-1: default-off switch for the boarded-book Portfolio Command Center feed. */
export const PORTFOLIO_BOOK_DATA_ENABLED =
  FEATURE_SURFACE_FLAG_DEFAULTS.PORTFOLIO_BOOK_DATA_ENABLED;

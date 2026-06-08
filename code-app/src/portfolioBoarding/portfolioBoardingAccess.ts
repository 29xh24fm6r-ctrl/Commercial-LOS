/**
 * Phase 140M — Portfolio Boarding access logic (pure).
 *
 * Fail-closed gating for the operator boarding surface. This module decides
 * whether the route is reachable, whether the create/edit affordance shows,
 * and which read-only/disabled banner to render — all from explicit inputs, so
 * it is fully testable and never widens the existing permission model.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no context, no router.
 *   - Fail-closed: every capability defaults to off unless explicitly granted.
 *   - Authorization is supplied by the caller (the existing WorkspaceGate /
 *     bootstrap identity chain); this module never invents authority.
 */

export interface BoardingAccessInput {
  /** From the existing identity/entitlement chain (e.g. admin/operator). */
  isAuthorizedOperator: boolean;
  /** Resolved route feature flag. */
  routeEnabled: boolean;
  /** Resolved live-persistence feature flag. */
  livePersistenceEnabled: boolean;
  /** The resolved adapter's own enabled state. */
  adapterEnabled: boolean;
}

export type BoardingSurfaceMode =
  | 'unauthorized'
  | 'not_configured'
  | 'read_only'
  | 'live';

export interface BoardingAccessResult {
  /** Whether the boarding surface may render at all. */
  canViewSurface: boolean;
  /** Whether the create/edit/save affordance may show. */
  canCreate: boolean;
  mode: BoardingSurfaceMode;
  /** Honest banner text for the resolved mode. */
  bannerMessage: string;
}

export function resolveBoardingAccess(
  input: BoardingAccessInput,
): BoardingAccessResult {
  // Unauthorized users never see the surface.
  if (!input.isAuthorizedOperator) {
    return {
      canViewSurface: false,
      canCreate: false,
      mode: 'unauthorized',
      bannerMessage:
        'Portfolio Loan Boarding is not available for your workspace.',
    };
  }

  // Authorized but the route flag is off → surface is hidden / not configured.
  if (!input.routeEnabled) {
    return {
      canViewSurface: false,
      canCreate: false,
      mode: 'not_configured',
      bannerMessage:
        'Portfolio Loan Boarding is not configured (route disabled).',
    };
  }

  // Route on but live persistence not enabled → read-only surface, no create.
  const live = input.livePersistenceEnabled && input.adapterEnabled;
  if (!live) {
    return {
      canViewSurface: true,
      canCreate: false,
      mode: 'read_only',
      bannerMessage:
        'Read-only: live persistence is not enabled. Boarded loans cannot be created or edited.',
    };
  }

  // Fully live and authorized.
  return {
    canViewSurface: true,
    canCreate: true,
    mode: 'live',
    bannerMessage: 'Live: boarded loans can be created and edited.',
  };
}

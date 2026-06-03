import { useEffect, useState } from 'react';
import { useBootstrap } from './BootstrapContext';
import { WORKSPACE_ROUTES } from './workspaceRoutes';
import { loadManagerIdentity } from '../manager/managerQueries';

/**
 * Phase 124C — Workspace entitlements (foundation).
 *
 * The codebase ships a strict single-workspace-per-user bootstrap
 * (Phase 115: `cr664_platformuser._cr664_primaryworkspace_value` →
 * one workspace route). It does NOT carry a per-user
 * "entitled workspaces" array. Phase 124C derives **additional**
 * entitlements honestly from existing per-role identity predicates
 * so a banker who is ALSO a manager can switch into the manager
 * workspace without us inventing a new schema field.
 *
 * Current rule (only manager is wired):
 *   - Manager entitlement = `loadManagerIdentity(upn)` returns
 *     `kind: 'ready'`. That probe already enforces the same hard
 *     contract `ManagerProvider` uses inside the workspace
 *     (banker row + team FK populated). If the user is not a
 *     manager, the probe returns `not-banker` or `no-team`, and
 *     the workspace switcher honestly omits the manager link.
 *
 * Discipline:
 *   - No new Dataverse schema, no new loader, no permission
 *     widening. The probe only confirms an entitlement the
 *     ManagerProvider would already enforce a few hundred ms later.
 *   - The probe is cached at module level by UPN so opening any
 *     route, any tab, any deal page only fires the manager probe
 *     once per signed-in session.
 *   - Fail honest: a failed probe is reported as `failed`, not
 *     coerced to `entitled` or `not-entitled`. The cockpit
 *     surfaces the failure rather than silently leaking a link
 *     a future click would bounce off.
 */

export type ManagerEntitlementState =
  | { kind: 'loading' }
  | { kind: 'entitled'; teamId: string; teamName: string }
  /** User is not a banker, or has no team FK. Not an error. */
  | { kind: 'not-entitled' }
  | { kind: 'failed'; message: string };

const managerProbeCache = new Map<string, Promise<ManagerEntitlementState>>();

/** Test-only: clear the module-level probe cache so each test starts
 *  with a clean slate. App code never calls this. */
export function _resetWorkspaceEntitlementCacheForTests(): void {
  managerProbeCache.clear();
}

function probeManagerEntitlement(
  upn: string,
): Promise<ManagerEntitlementState> {
  const cached = managerProbeCache.get(upn);
  if (cached) return cached;
  const promise: Promise<ManagerEntitlementState> = loadManagerIdentity(upn)
    .then((result): ManagerEntitlementState => {
      if (result.kind === 'ready') {
        return {
          kind: 'entitled',
          teamId: result.identity.teamId,
          teamName: result.identity.teamName,
        };
      }
      if (result.kind === 'failed') {
        return { kind: 'failed', message: result.message };
      }
      // 'not-banker' or 'no-team' — honestly not entitled.
      return { kind: 'not-entitled' };
    })
    .catch(
      (err: unknown): ManagerEntitlementState => ({
        kind: 'failed',
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  managerProbeCache.set(upn, promise);
  return promise;
}

/**
 * Hook: probe and expose the manager-entitlement state for the
 * currently-signed-in UPN. Cached at module level — multiple
 * concurrent mounts share one Promise.
 */
export function useManagerEntitlement(): ManagerEntitlementState {
  const { upn } = useBootstrap();
  const [state, setState] = useState<ManagerEntitlementState>({
    kind: 'loading',
  });
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    probeManagerEntitlement(upn).then((resolved) => {
      if (!cancelled) setState(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [upn]);
  return state;
}

export interface EntitledRoutesState {
  kind: 'loading' | 'ready';
  /** Additional workspace routes the user can navigate to beyond
   *  their bootstrap-primary route. Does NOT include the primary
   *  route — the caller already knows it from `useBootstrap()`. */
  routes: ReadonlyArray<string>;
}

/**
 * Hook: returns the additional workspace routes the signed-in user
 * is entitled to navigate to via a workspace switcher.
 *
 * `kind: 'loading'` is surfaced while the manager probe is in
 * flight so callers (e.g. WorkspaceGate) can wait honestly rather
 * than mis-classifying an entitled user.
 *
 * Phase 127B — when the manager probe returns `entitled`, the team
 * workspace route is admitted alongside the manager route. The
 * probe's success condition (`loadManagerIdentity` returns
 * `kind: 'ready'`) is the same condition `TeamProvider` /
 * `TeamDataProvider` would enforce when the user actually navigates
 * to the team workspace (banker row + populated team FK). Adding the
 * team route here therefore does NOT widen data access — the team
 * route's own provider chain still re-verifies identity before
 * rendering anything, and the team queries continue to scope by
 * `_cr664_team_value` exactly as before. Banker-only users
 * (probe → `not-entitled`) never receive the team route.
 */
export function useEntitledRoutes(): EntitledRoutesState {
  const m = useManagerEntitlement();
  if (m.kind === 'loading') return { kind: 'loading', routes: [] };
  const routes: string[] = [];
  if (m.kind === 'entitled') {
    routes.push(WORKSPACE_ROUTES.manager);
    routes.push(WORKSPACE_ROUTES.team);
  }
  return { kind: 'ready', routes };
}

// ---------------------------------------------------------------------------
// Pure deriver — workspace links for the switcher
// ---------------------------------------------------------------------------

export type WorkspaceLinkKey =
  | 'banker'
  | 'team'
  | 'manager'
  | 'portfolio'
  | 'executive'
  | 'admin';

/**
 * Phase 126C — the search-param marker that tells ManagerWorkspace
 * to render the Portfolio cockpit instead of the Manager Bloomberg
 * Control Panel. Both surfaces share the manager route + the manager
 * data provider chain; the query string is a pure rendering hint.
 */
export const PORTFOLIO_SURFACE_PARAM_NAME = 'surface';
export const PORTFOLIO_SURFACE_PARAM_VALUE = 'portfolio';
export const PORTFOLIO_SURFACE_URL = `${WORKSPACE_ROUTES.manager}?${PORTFOLIO_SURFACE_PARAM_NAME}=${PORTFOLIO_SURFACE_PARAM_VALUE}`;

export interface WorkspaceLink {
  /** Stable key. */
  key: WorkspaceLinkKey;
  /** Display label rendered in the switcher. */
  label: string;
  /**
   * Concrete URL the link navigates to. For workspace routes this
   * matches WORKSPACE_ROUTES[key]; for the Phase 126C portfolio
   * surface this is `${WORKSPACE_ROUTES.manager}?surface=portfolio`.
   */
  route: string;
  /** True when this is the workspace the user is currently rendering. */
  isCurrent: boolean;
}

export interface DeriveWorkspaceLinksInput {
  /** The user's bootstrap-resolved primary route. Always present in
   *  the output even if not currently rendered. */
  bootstrapRoute: string;
  /** The route currently being rendered. May equal bootstrapRoute or
   *  an entitled additional route. */
  currentRoute: string;
  /** Additional entitled routes the user can switch to. */
  entitledRoutes: ReadonlyArray<string>;
  /**
   * Phase 126C — set true to surface the Portfolio Workspace
   * rendering option in the switcher. The portfolio link navigates
   * to the same manager route + a `?surface=portfolio` query marker;
   * ManagerWorkspace reads the marker and swaps the lead cockpit
   * accordingly. The link is added only when the user already has
   * the manager route in their allowed set (bootstrap-primary or
   * Phase 124C entitled probe). No data-scope widening — portfolio
   * is a rendering surface, not a permission.
   */
  includePortfolioSurface?: boolean;
  /**
   * Phase 126C — when the user is currently rendering the portfolio
   * surface, the deriver marks the portfolio link as `isCurrent` and
   * the manager link as not-current (even though both share the same
   * route path). Caller computes this from the URL search params +
   * the Phase 126B bootstrap workspace-name fallback.
   */
  currentSurface?: 'portfolio';
}

const LINK_META: Record<
  WorkspaceLinkKey,
  { route: string; label: string }
> = {
  banker: { route: WORKSPACE_ROUTES.banker, label: 'Banker Workspace' },
  team: { route: WORKSPACE_ROUTES.team, label: 'Team Workspace' },
  manager: { route: WORKSPACE_ROUTES.manager, label: 'Manager Workspace' },
  portfolio: { route: PORTFOLIO_SURFACE_URL, label: 'Portfolio Workspace' },
  executive: { route: WORKSPACE_ROUTES.executive, label: 'Executive Workspace' },
  admin: { route: WORKSPACE_ROUTES.admin, label: 'Admin Workspace' },
};

const LINK_ORDER: ReadonlyArray<WorkspaceLinkKey> = [
  'banker',
  'team',
  'manager',
  'portfolio',
  'executive',
  'admin',
];

/**
 * Pure: project the bootstrap route + entitled additional routes
 * into the ordered link list the switcher renders. Deduplicates
 * routes; preserves catalog order so the switcher reads the same
 * across surfaces.
 *
 * Portfolio surface (Phase 126C) is only appended when the caller
 * opts in via `includePortfolioSurface` AND the user has the manager
 * route in their allowed set. Banker-only users never see the
 * portfolio link.
 *
 * The returned list always includes the bootstrap route. If
 * `entitledRoutes` is empty (or only contains the bootstrap route),
 * the list has length 1 and the switcher should render as a static
 * pill instead.
 */
export function deriveWorkspaceLinks(
  input: DeriveWorkspaceLinksInput,
): WorkspaceLink[] {
  const allowed = new Set<string>([input.bootstrapRoute, ...input.entitledRoutes]);
  const isPortfolioCurrent = input.currentSurface === 'portfolio';
  const links: WorkspaceLink[] = [];
  for (const key of LINK_ORDER) {
    const meta = LINK_META[key];
    let isAllowed: boolean;
    if (key === 'portfolio') {
      // Portfolio is a rendering surface attached to the manager
      // route. It is allowed iff (a) the caller explicitly opts in
      // AND (b) the manager route is in the user's allowed set.
      // This keeps the link out of the switcher for banker-only
      // users and never widens permission.
      isAllowed =
        (input.includePortfolioSurface ?? false) &&
        allowed.has(WORKSPACE_ROUTES.manager);
    } else {
      isAllowed = allowed.has(meta.route);
    }
    if (!isAllowed) continue;
    let isCurrent: boolean;
    if (key === 'portfolio') {
      isCurrent = isPortfolioCurrent;
    } else if (key === 'manager') {
      // The manager link is "current" only when the user is on the
      // manager route AND not currently surfacing portfolio. This
      // lets the switcher mark exactly one of the two same-route
      // entries as current at a time.
      isCurrent =
        meta.route === input.currentRoute && !isPortfolioCurrent;
    } else {
      isCurrent = meta.route === input.currentRoute;
    }
    links.push({
      key,
      label: meta.label,
      route: meta.route,
      isCurrent,
    });
  }
  return links;
}

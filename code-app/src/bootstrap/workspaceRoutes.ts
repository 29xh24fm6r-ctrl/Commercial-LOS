export const WORKSPACE_ROUTES = {
  banker: '/workspaces/banker',
  team: '/workspaces/team',
  manager: '/workspaces/manager',
  executive: '/workspaces/executive',
  admin: '/workspaces/admin',
} as const;

export type WorkspaceKey = keyof typeof WORKSPACE_ROUTES;

/**
 * Phase 142I — Executive product-strategy surface marker.
 *
 * Mirrors the Phase 126C portfolio-surface pattern: the competitive /
 * product-strategy dashboard (Phase 142H) is a read-only RENDERING SURFACE
 * attached to the EXECUTIVE route — `/workspaces/executive?surface=product-strategy`.
 * It is NOT a new route and NOT a new entitlement: it is subordinate to executive
 * access by construction. The existing `WorkspaceGate allowed={executive}` already
 * fails closed for non-executive users, while loading, and on direct URL — the
 * surface inherits that gating and never widens permission.
 */
export const PRODUCT_STRATEGY_SURFACE_PARAM_NAME = 'surface';
export const PRODUCT_STRATEGY_SURFACE_PARAM_VALUE = 'product-strategy';
export const PRODUCT_STRATEGY_SURFACE_URL = `${WORKSPACE_ROUTES.executive}?${PRODUCT_STRATEGY_SURFACE_PARAM_NAME}=${PRODUCT_STRATEGY_SURFACE_PARAM_VALUE}`;

/** True when a search-param string selects the executive product-strategy surface. */
export function isProductStrategySurface(surfaceParam: string | null | undefined): boolean {
  return surfaceParam === PRODUCT_STRATEGY_SURFACE_PARAM_VALUE;
}

/**
 * Phase 116: explicit aliases for the live environment's Platform
 * Workspace names. Matched BEFORE the substring regex matchers below
 * (case-insensitive, whitespace-trimmed) so the contract between
 * Code App and live data is exact, not approximate.
 *
 * The six canonical names ship in the deployed environment landed by
 * Phase 113 + Phase 115. Each name appears exactly as the
 * make.powerapps.com Platform Workspace grid displays it.
 *
 * Portfolio Management routes to the Manager Command Center because
 * the manager workspace's card stack (TeamWorkQueue, banker filter,
 * pipeline summary, deals-by-stage, closing forecast, at-risk /
 * blocked deals, banker workload, manager activity summary, autopilot
 * rollup, morning catch-up) is the closest functional fit for a
 * portfolio-oversight role. The Banker model's
 * `cr664_roletype: PortfolioManager` enum value (788190002) confirms
 * portfolio managers participate in banker-style workflows; at the
 * workspace level, the Manager Command Center is where their
 * team-scoped oversight UX lives today. See
 * docs/PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md §2 for the
 * full decision record.
 */
const EXPLICIT_ALIASES: Readonly<Record<string, WorkspaceKey>> = Object.freeze({
  'Admin Control Center': 'admin',
  'Banker Workspace': 'banker',
  'Manager Command Center': 'manager',
  'Team Workspace': 'team',
  'Executive Dashboard': 'executive',
  'Portfolio Management': 'manager',
});

/**
 * Lower-case lookup table built from EXPLICIT_ALIASES at module
 * load. We materialize it once so case-insensitive lookup is O(1)
 * and the exact-name contract above stays human-readable.
 */
const EXPLICIT_ALIASES_LOWER: ReadonlyMap<string, WorkspaceKey> = new Map(
  Object.entries(EXPLICIT_ALIASES).map(([name, key]) => [name.toLowerCase(), key]),
);

/**
 * Substring regex fallback. Catches workspace names that don't
 * appear in EXPLICIT_ALIASES but contain a role keyword
 * (e.g. "Senior Banker Office" → banker; "Audit Admin Surface"
 * → admin). The fallback is intentionally conservative — only the
 * five role keywords from Phases 4 / 32 match.
 */
const MATCHERS: ReadonlyArray<readonly [WorkspaceKey, RegExp]> = [
  ['banker', /\bbanker\b/i],
  ['team', /\bteam\b/i],
  ['manager', /\bmanager\b/i],
  ['executive', /\b(executive|board)\b/i],
  ['admin', /\badmin\b/i],
];

/**
 * Phase 126B — set of canonical workspace names that mean "portfolio
 * view" inside the manager route. Today only the Phase 116 alias
 * 'Portfolio Management' lives here; future portfolio aliases can
 * be added without changing the predicate's call sites.
 *
 * Stored lowercased so the predicate is a single case-insensitive
 * lookup; trim happens at the call site.
 */
const PORTFOLIO_WORKSPACE_NAMES_LOWER: ReadonlySet<string> = new Set([
  'portfolio management',
]);

/**
 * Phase 126B — predicate that returns true when a bootstrap-resolved
 * workspace name represents a Portfolio view. Used by ManagerWorkspace
 * to swap in <PortfolioCommandCenter> in place of
 * <ManagerBloombergControlPanel> while keeping the manager route,
 * the manager data provider, and the Lending OS shell unchanged.
 *
 * Honest behavior: undefined / empty input returns false. A workspace
 * name like 'Manager Command Center' returns false even though it
 * resolves to the same manager route as 'Portfolio Management'. The
 * predicate is name-scoped, not route-scoped, exactly so the two
 * surfaces can co-exist behind one route.
 */
export function isPortfolioWorkspaceName(
  workspaceName: string | undefined,
): boolean {
  if (!workspaceName) return false;
  const trimmed = workspaceName.trim();
  if (trimmed.length === 0) return false;
  return PORTFOLIO_WORKSPACE_NAMES_LOWER.has(trimmed.toLowerCase());
}

export function resolveWorkspaceRoute(
  workspaceName: string | undefined,
): string | null {
  if (!workspaceName) return null;
  const trimmed = workspaceName.trim();
  if (trimmed.length === 0) return null;

  // Phase 116: explicit alias map first (case-insensitive,
  // exact-name). This is the contract with the live env's Platform
  // Workspace seed data.
  const aliasKey = EXPLICIT_ALIASES_LOWER.get(trimmed.toLowerCase());
  if (aliasKey) return WORKSPACE_ROUTES[aliasKey];

  // Substring regex fallback (Phases 4 / 32). Preserves resolution
  // for any workspace name that contains a role keyword but isn't
  // an explicit alias.
  for (const [key, re] of MATCHERS) {
    if (re.test(trimmed)) return WORKSPACE_ROUTES[key];
  }

  // Fail closed. AuthGate's UnresolvedWorkspaceError path renders
  // the unmapped name honestly — no default workspace, no silent
  // demotion.
  return null;
}

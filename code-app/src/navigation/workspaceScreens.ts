import { WORKSPACE_ROUTES, type WorkspaceKey } from '../bootstrap/workspaceRoutes';

/**
 * Phase 123A — Multi-screen team deployment registry.
 *
 * Single source of truth for the five workspace screens the project
 * deploys for team rollout:
 *
 *   1. Banker Deal Command Center
 *   2. Manager "Bloomberg" Control Panel
 *   3. Portfolio Command Center
 *   4. Team Work Queue / Exceptions Center
 *   5. Executive Pipeline Snapshot
 *
 * This file is metadata only — it does not register routes
 * (React Router routes live in `src/App.tsx`) and does not
 * dispatch to components. The purpose is to give every surface
 * a stable id, a single human-readable label, the role it serves,
 * the route it lives at, and a short description of its purpose.
 * Used by:
 *
 *   - documentation generators (PHASE_123A_MULTI_SCREEN_SHELL.md
 *     pulls the screen list directly from this module).
 *   - static-source contract tests that pin the five screens, their
 *     routes (which must match WORKSPACE_ROUTES), and their roles
 *     (so a route renamed in workspaceRoutes.ts trips an honest
 *     failure here).
 *   - future navigation primitives that surface a global "where
 *     can I go?" menu without each surface having to re-spell its
 *     own metadata.
 *
 * Discipline:
 *   - Every route value is sourced from WORKSPACE_ROUTES. No
 *     route string is hardcoded here.
 *   - Portfolio Management points at the manager route per the
 *     Phase 116 alias decision (workspaceRoutes.ts §EXPLICIT_ALIASES).
 *     The screen still has its own id so leadership / nav primitives
 *     can refer to "Portfolio Command Center" by name; under the
 *     hood it resolves to the same React shell as the Manager
 *     Command Center.
 *   - No fake / sample data. The descriptions are purely
 *     informational — they never reference a hardcoded borrower,
 *     deal, or test record name. Pinned by a static-source
 *     regression scan in workspaceScreens.test.ts.
 */

export type WorkspaceScreenId =
  | 'banker-command-center'
  | 'manager-control-panel'
  | 'portfolio-command-center'
  | 'team-exceptions'
  | 'executive-snapshot';

export type WorkspaceScreenRole = 'banker' | 'manager' | 'team' | 'executive';

export interface WorkspaceScreen {
  /** Stable id — used as a key for nav menus / docs / tests. */
  id: WorkspaceScreenId;
  /** Human-readable label. */
  label: string;
  /** The role the screen serves. */
  role: WorkspaceScreenRole;
  /**
   * Underlying workspace route key the screen resolves to. Sourced
   * from WORKSPACE_ROUTES so a route rename in workspaceRoutes.ts
   * cascades automatically.
   */
  workspaceKey: WorkspaceKey;
  /**
   * Concrete route path. Always equal to WORKSPACE_ROUTES[workspaceKey]
   * — pinned by tests.
   */
  route: string;
  /**
   * Short purpose statement. Renders in documentation + leadership
   * nav menus. No hardcoded sample data, no marketing language.
   */
  description: string;
  /**
   * The shared deal-intelligence view-model exposes a per-deal
   * shape. Screens that consume it at the SINGLE-DEAL level set
   * this flag true (cockpit-style surfaces). Roll-up screens
   * (Manager / Portfolio / Team / Executive) set false because
   * their per-deal display is one of many rows, not the top-level
   * surface.
   */
  consumesPerDealViewModel: boolean;
}

export const WORKSPACE_SCREENS: ReadonlyArray<WorkspaceScreen> = Object.freeze([
  {
    id: 'banker-command-center',
    label: 'Banker Deal Command Center',
    role: 'banker',
    workspaceKey: 'banker',
    route: WORKSPACE_ROUTES.banker,
    description:
      'One-deal operating screen for the banker. Hosts deal identity, ' +
      'profile completeness, next-best-action panel, tasks / documents / ' +
      'credit memo cards, and borrower communication shortcuts.',
    consumesPerDealViewModel: true,
  },
  {
    id: 'manager-control-panel',
    label: 'Manager Bloomberg Control Panel',
    role: 'manager',
    workspaceKey: 'manager',
    route: WORKSPACE_ROUTES.manager,
    description:
      'Manager operating cockpit. Pipeline KPIs, team / banker filters, ' +
      'exception rows, blocked / at-risk deals, stage aging, top actions ' +
      'needed.',
    consumesPerDealViewModel: false,
  },
  {
    id: 'portfolio-command-center',
    label: 'Portfolio Command Center',
    role: 'manager',
    workspaceKey: 'manager',
    route: WORKSPACE_ROUTES.manager,
    description:
      'Portfolio-level pipeline / risk view. Resolves to the Manager ' +
      'Command Center per the Phase 116 alias decision; Banker model ' +
      'role 788190002 (PortfolioManager) participates in manager-style ' +
      'workflows. Total pipeline, deal count, completeness buckets, ' +
      'stage distribution, missing-field / compliance exception ' +
      'distribution, product / loan / pricing mix.',
    consumesPerDealViewModel: false,
  },
  {
    id: 'team-exceptions',
    label: 'Team Work Queue / Exceptions Center',
    role: 'team',
    workspaceKey: 'team',
    route: WORKSPACE_ROUTES.team,
    description:
      'What the team needs to do today. Open tasks, outstanding documents, ' +
      'missing data, stale deals, blocked deals, owner / banker assignment.',
    consumesPerDealViewModel: false,
  },
  {
    id: 'executive-snapshot',
    label: 'Executive Pipeline Snapshot',
    role: 'executive',
    workspaceKey: 'executive',
    route: WORKSPACE_ROUTES.executive,
    description:
      'Lightweight leadership view. Pipeline amount, active deals, ' +
      'closings / target dates, risk / exceptions summary, top deals by ' +
      'amount / urgency.',
    consumesPerDealViewModel: false,
  },
]);

/** Find one screen by id. Returns undefined if no match. */
export function getWorkspaceScreen(
  id: WorkspaceScreenId,
): WorkspaceScreen | undefined {
  return WORKSPACE_SCREENS.find((s) => s.id === id);
}

/** Find all screens for a role. Returns an empty array when none match. */
export function getWorkspaceScreensForRole(
  role: WorkspaceScreenRole,
): ReadonlyArray<WorkspaceScreen> {
  return WORKSPACE_SCREENS.filter((s) => s.role === role);
}

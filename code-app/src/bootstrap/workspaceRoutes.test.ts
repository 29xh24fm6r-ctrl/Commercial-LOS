import { describe, it, expect } from 'vitest';
import {
  WORKSPACE_ROUTES,
  resolveWorkspaceRoute,
  isPortfolioWorkspaceName,
} from './workspaceRoutes';

/**
 * Phase 116 — first-live-launch stabilization tests for the
 * workspace-name → route resolver.
 *
 * The deployed environment landed by Phase 113 + Phase 115 has six
 * Platform Workspace rows with these exact names:
 *
 *   - Admin Control Center
 *   - Banker Workspace
 *   - Executive Dashboard
 *   - Manager Command Center
 *   - Portfolio Management
 *   - Team Workspace
 *
 * Five of those names resolved via the legacy substring regex
 * matcher (Phases 4 / 32). The sixth — Portfolio Management —
 * failed closed because no regex matched it, so any Platform User
 * pointed at that workspace was stranded at AuthGate.
 *
 * Phase 116 introduces an explicit alias map that runs BEFORE the
 * regex fallback. This file pins every live name → expected route
 * AND pins the fail-closed contract for unknown names. Before
 * Phase 116 there were no workspace-route tests at all — the
 * resolver was unverified by CI.
 */

describe('Phase 116 — live Platform Workspace name aliases resolve to the expected route', () => {
  it('Admin Control Center → admin route', () => {
    expect(resolveWorkspaceRoute('Admin Control Center')).toBe(WORKSPACE_ROUTES.admin);
  });

  it('Banker Workspace → banker route', () => {
    expect(resolveWorkspaceRoute('Banker Workspace')).toBe(WORKSPACE_ROUTES.banker);
  });

  it('Manager Command Center → manager route', () => {
    expect(resolveWorkspaceRoute('Manager Command Center')).toBe(WORKSPACE_ROUTES.manager);
  });

  it('Team Workspace → team route', () => {
    expect(resolveWorkspaceRoute('Team Workspace')).toBe(WORKSPACE_ROUTES.team);
  });

  it('Executive Dashboard → executive route', () => {
    expect(resolveWorkspaceRoute('Executive Dashboard')).toBe(WORKSPACE_ROUTES.executive);
  });

  it('Portfolio Management → manager route (Phase 116 decision; documented in PHASE_116 §2)', () => {
    // The Portfolio Management workspace routes to the Manager
    // Command Center because that workspace's card stack is the
    // closest functional fit for a portfolio-oversight role. See
    // docs/PHASE_116_FIRST_LIVE_LAUNCH_STABILIZATION.md §2 for the
    // full decision record.
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(WORKSPACE_ROUTES.manager);
  });
});

describe('Phase 116 — explicit aliases are case-insensitive and whitespace-trimmed', () => {
  it('lowercased name still matches the alias', () => {
    expect(resolveWorkspaceRoute('banker workspace')).toBe(WORKSPACE_ROUTES.banker);
  });

  it('UPPERCASED name still matches the alias', () => {
    expect(resolveWorkspaceRoute('BANKER WORKSPACE')).toBe(WORKSPACE_ROUTES.banker);
  });

  it('mixed-case name still matches the alias', () => {
    expect(resolveWorkspaceRoute('AdMiN CoNtRoL CeNtEr')).toBe(WORKSPACE_ROUTES.admin);
  });

  it('leading and trailing whitespace is trimmed before lookup', () => {
    expect(resolveWorkspaceRoute('   Portfolio Management   ')).toBe(
      WORKSPACE_ROUTES.manager,
    );
  });
});

describe('Phase 116 — substring regex fallback preserved for non-alias names', () => {
  it('a non-alias name containing the word "banker" still resolves to banker', () => {
    expect(resolveWorkspaceRoute('Senior Banker Office')).toBe(WORKSPACE_ROUTES.banker);
  });

  it('a non-alias name containing the word "manager" still resolves to manager', () => {
    expect(resolveWorkspaceRoute('Regional Manager Hub')).toBe(WORKSPACE_ROUTES.manager);
  });

  it('a non-alias name containing "board" still resolves to executive', () => {
    expect(resolveWorkspaceRoute('Board Reporting')).toBe(WORKSPACE_ROUTES.executive);
  });

  it('a non-alias name containing only the substring "manage" (no "manager") does NOT match manager', () => {
    // \b word-boundary means "Management" alone (without "manager")
    // doesn't trip the manager regex. This catches the original
    // Portfolio Management failure mode: pre-Phase-116 it fell
    // through to null.
    const customNonAliasManagementName = 'Loan Management Suite';
    // It will still resolve null because no regex matches the bare
    // word "Management" — confirming the fail-closed behavior we
    // pinned in Phase 115.
    expect(resolveWorkspaceRoute(customNonAliasManagementName)).toBeNull();
  });
});

describe('Phase 116 — fail-closed contract for unknown workspace names', () => {
  it('undefined → null', () => {
    expect(resolveWorkspaceRoute(undefined)).toBeNull();
  });

  it('empty string → null', () => {
    expect(resolveWorkspaceRoute('')).toBeNull();
  });

  it('whitespace-only string → null', () => {
    expect(resolveWorkspaceRoute('   ')).toBeNull();
  });

  it('Borrower Portal → null (no banker / team / manager / executive / admin keyword)', () => {
    // Phase 65 / Phase 110: borrower portal is NOT_WIRED.
    // A workspace named "Borrower Portal" must not resolve to ANY
    // landing route. Permission-before-render preserved.
    expect(resolveWorkspaceRoute('Borrower Portal')).toBeNull();
  });

  it('arbitrary unknown name → null (no default workspace fallback)', () => {
    // Catches a hypothetical regression where someone adds a
    // fallback like `return WORKSPACE_ROUTES.banker;`. Any
    // unmapped workspace name MUST flow to UnresolvedWorkspaceError
    // at AuthGate; it must never silently default.
    expect(resolveWorkspaceRoute('Some Untracked Surface')).toBeNull();
  });

  it('the substring "magicLink" or "invitation" must NOT resolve to any route (Phase 110 lock invariant)', () => {
    // Belt-and-suspenders: the borrower-portal compound NOT_WIRED
    // entry forbids these surfaces from being implied as available.
    // If a future Platform Workspace row was accidentally named
    // "Magic Link Invitation Portal", the resolver should still
    // return null.
    expect(resolveWorkspaceRoute('Magic Link Invitation Portal')).toBeNull();
  });
});

describe('Phase 116 — explicit alias coverage matches the documented live environment names', () => {
  it('all six live Platform Workspace names from PHASE_116 §1 resolve to non-null routes', () => {
    const liveNames = [
      'Admin Control Center',
      'Banker Workspace',
      'Executive Dashboard',
      'Manager Command Center',
      'Portfolio Management',
      'Team Workspace',
    ];
    for (const name of liveNames) {
      expect(
        resolveWorkspaceRoute(name),
        `live workspace name "${name}" must resolve to a route`,
      ).not.toBeNull();
    }
  });

  it('the resolved routes belong to the canonical five-key WORKSPACE_ROUTES set', () => {
    const allowed = new Set<string>(Object.values(WORKSPACE_ROUTES));
    const liveNames = [
      'Admin Control Center',
      'Banker Workspace',
      'Executive Dashboard',
      'Manager Command Center',
      'Portfolio Management',
      'Team Workspace',
    ];
    for (const name of liveNames) {
      const route = resolveWorkspaceRoute(name);
      expect(
        route !== null && allowed.has(route),
        `resolved route "${route}" for "${name}" must be one of the canonical five`,
      ).toBe(true);
    }
  });

  it('Portfolio Management routes to manager (Phase 116 §2 decision)', () => {
    // Explicit double-check that the decision is locked. If a
    // future phase wants to re-route Portfolio Management to
    // executive or to a new dedicated route, that change must
    // update this assertion AND the Phase 116 §2 doc in the same
    // commit.
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(
      WORKSPACE_ROUTES.manager,
    );
  });
});

describe('Phase 116 — WORKSPACE_ROUTES contract', () => {
  it('exposes exactly five canonical keys (banker / team / manager / executive / admin)', () => {
    expect(Object.keys(WORKSPACE_ROUTES).sort()).toEqual(
      ['admin', 'banker', 'executive', 'manager', 'team'].sort(),
    );
  });

  it('each route is under /workspaces/', () => {
    for (const route of Object.values(WORKSPACE_ROUTES)) {
      expect(route).toMatch(/^\/workspaces\//);
    }
  });
});

describe('Phase 126B — isPortfolioWorkspaceName predicate', () => {
  it('returns true for the canonical "Portfolio Management" name', () => {
    expect(isPortfolioWorkspaceName('Portfolio Management')).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isPortfolioWorkspaceName('  portfolio management  ')).toBe(true);
    expect(isPortfolioWorkspaceName('PORTFOLIO MANAGEMENT')).toBe(true);
    expect(isPortfolioWorkspaceName('Portfolio management')).toBe(true);
  });

  it('returns false for manager / banker / team / executive / admin canonical names', () => {
    expect(isPortfolioWorkspaceName('Manager Command Center')).toBe(false);
    expect(isPortfolioWorkspaceName('Banker Workspace')).toBe(false);
    expect(isPortfolioWorkspaceName('Team Workspace')).toBe(false);
    expect(isPortfolioWorkspaceName('Executive Dashboard')).toBe(false);
    expect(isPortfolioWorkspaceName('Admin Control Center')).toBe(false);
  });

  it('returns false for undefined / empty / whitespace input (honest absence)', () => {
    expect(isPortfolioWorkspaceName(undefined)).toBe(false);
    expect(isPortfolioWorkspaceName('')).toBe(false);
    expect(isPortfolioWorkspaceName('   ')).toBe(false);
  });

  it('returns false for unrelated names (no substring matching)', () => {
    // The predicate is name-exact (case/whitespace tolerant), not
    // substring. A name like "Portfolio Manager Office" should NOT
    // match — only the canonical alias does.
    expect(isPortfolioWorkspaceName('manage portfolio')).toBe(false);
    expect(isPortfolioWorkspaceName('Portfolio Manager Office')).toBe(false);
    expect(isPortfolioWorkspaceName('My Portfolio')).toBe(false);
  });

  it('does NOT change the route the same name resolves to (Phase 116 alias preserved)', () => {
    // Phase 126B is route-preserving: 'Portfolio Management' still
    // routes to the manager route. The predicate only governs which
    // cockpit ManagerWorkspace mounts inside that route.
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(
      WORKSPACE_ROUTES.manager,
    );
  });
});

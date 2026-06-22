import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import {
  deriveHasAdminWorkspaceEntitlement,
} from '../../admin/adminWorkspaceEntitlementQuery';
import { isAdminConsoleAuthorized } from '../../admin/adminOperationsConsoleModel';

/**
 * PHASE 204 — admin / superadmin workspace reachability contract.
 *
 * Admin becomes reachable in the switcher ONLY for admin-entitled users, via an
 * existing-entitlement probe, fail-closed, with no route/entitlement widening.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_204_SUPERADMIN_ADMIN_WORKSPACE_REACHABILITY.md';
const ENTITLEMENTS = read('src/bootstrap/workspaceEntitlements.ts');
const PROBE = read('src/admin/adminWorkspaceEntitlementQuery.ts');
const ADMIN_OPS = read('src/admin/AdminOperationsConsole.tsx');
const ADMIN_WORKSPACE = read('src/workspaces/AdminWorkspace.tsx');
const APP = read('src/App.tsx');

describe('204 — doc + probe behavior', () => {
  it('the Phase 204 doc + probe + tests exist', () => {
    for (const f of [
      DOC_REL,
      'src/admin/adminWorkspaceEntitlementQuery.ts',
      'src/admin/adminWorkspaceEntitlementQuery.test.ts',
    ]) {
      expect(existsSync(resolve(ROOT, f)), f).toBe(true);
    }
  });

  it('admin entitlement requires the admin workspace at Full/Admin level', () => {
    expect(deriveHasAdminWorkspaceEntitlement([{ workspaceName: 'Admin Control Center', accessLevelName: 'Full' }])).toBe(true);
    expect(deriveHasAdminWorkspaceEntitlement([{ workspaceName: 'Admin Control Center', accessLevelName: 'ReadOnly' }])).toBe(false);
    expect(deriveHasAdminWorkspaceEntitlement([{ workspaceName: 'Banker Workspace', accessLevelName: 'Full' }])).toBe(false);
    expect(deriveHasAdminWorkspaceEntitlement([])).toBe(false);
  });
});

describe('204 — entitled-routes wiring (admin only when entitled)', () => {
  it('useEntitledRoutes pushes the admin route only on the entitled branch', () => {
    expect(ENTITLEMENTS).toMatch(/useAdminEntitlement/);
    expect(ENTITLEMENTS).toMatch(/if \(a\.kind === 'entitled'\) \{\s*routes\.push\(WORKSPACE_ROUTES\.admin\);/);
    // Loading waits for BOTH probes (no mis-classification mid-flight).
    expect(ENTITLEMENTS).toMatch(/m\.kind === 'loading' \|\| a\.kind === 'loading'/);
  });

  it('the probe is read-only + fail-closed (no create/update/delete)', () => {
    expect(PROBE).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(PROBE).toMatch(/not-entitled/);
    expect(PROBE).toMatch(/kind: 'failed'/);
  });
});

describe('204 — admin console authorization accepts entitlement, stays fail-closed', () => {
  it('isAdminConsoleAuthorized authorizes primary-admin OR admin-entitled, else denies', () => {
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.admin)).toBe(true);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker, true)).toBe(true);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker, false)).toBe(false);
    expect(isAdminConsoleAuthorized(WORKSPACE_ROUTES.banker)).toBe(false);
  });

  it('AdminOperationsConsole passes the entitlement flag to the authorization check', () => {
    expect(ADMIN_OPS).toMatch(/useEntitledRoutes\(\)\.routes\.includes\(WORKSPACE_ROUTES\.admin\)/);
    expect(ADMIN_OPS).toMatch(/isAdminConsoleAuthorized\(route, adminEntitled\)/);
  });
});

describe('204 — no widening; admin surfaces preserved', () => {
  it('the workspace route shape is unchanged (5 routes), admin gate intact', () => {
    expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(5);
    expect(APP).toMatch(/<WorkspaceGate allowed=\{WORKSPACE_ROUTES\.admin\}>\s*<AdminWorkspace\s*\/>/);
  });

  it('AdminWorkspace still wraps AdminProvider and mounts the V1 readiness panel', () => {
    expect(ADMIN_WORKSPACE).toMatch(/<AdminProvider>/);
    expect(ADMIN_WORKSPACE).toMatch(/<V1ActivationReadinessPanel\s*\/>/);
  });
});

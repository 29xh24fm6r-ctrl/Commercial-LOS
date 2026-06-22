import { describe, it, expect } from 'vitest';
import {
  deriveHasAdminWorkspaceEntitlement,
  ADMIN_ACCESS_LEVEL_NAMES,
} from './adminWorkspaceEntitlementQuery';

/**
 * Phase 204 — admin-entitlement derivation contract.
 *
 * The pure predicate decides whether the user's workspace entitlements grant
 * Admin-workspace access (admin workspace + Full/Admin level). Fail-closed.
 */

describe('204 — deriveHasAdminWorkspaceEntitlement', () => {
  it('is true for an Admin workspace entitlement at Full level', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: 'Admin Control Center', accessLevelName: 'Full' },
      ]),
    ).toBe(true);
  });

  it('is true for an Admin workspace entitlement at Admin level', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: 'Admin Control Center', accessLevelName: 'Admin' },
      ]),
    ).toBe(true);
  });

  it('is false for an Admin workspace at ReadOnly level (insufficient)', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: 'Admin Control Center', accessLevelName: 'ReadOnly' },
      ]),
    ).toBe(false);
  });

  it('is false for a non-admin workspace even at Full level', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: 'Banker Workspace', accessLevelName: 'Full' },
      ]),
    ).toBe(false);
  });

  it('is false for an empty entitlement set (fail-closed)', () => {
    expect(deriveHasAdminWorkspaceEntitlement([])).toBe(false);
  });

  it('is false when the workspace name does not resolve to a known workspace', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: undefined, accessLevelName: 'Full' },
        { workspaceName: 'Totally Unknown', accessLevelName: 'Admin' },
      ]),
    ).toBe(false);
  });

  it('finds the admin grant among multiple entitlements', () => {
    expect(
      deriveHasAdminWorkspaceEntitlement([
        { workspaceName: 'Banker Workspace', accessLevelName: 'Full' },
        { workspaceName: 'Manager Command Center', accessLevelName: 'ReadOnly' },
        { workspaceName: 'Admin Control Center', accessLevelName: 'Admin' },
      ]),
    ).toBe(true);
  });

  it('only Full and Admin authorize (ReadOnly does not)', () => {
    expect([...ADMIN_ACCESS_LEVEL_NAMES].sort()).toEqual(['Admin', 'Full']);
  });
});

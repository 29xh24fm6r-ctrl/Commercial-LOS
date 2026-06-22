import { describe, it, expect } from 'vitest';
import {
  deriveHasAdminWorkspaceEntitlement,
  strictAdminEntitlementName,
  ADMIN_ACCESS_LEVEL_NAMES,
  type AdminEntitlementCandidate,
} from './adminWorkspaceEntitlementQuery';
import { resolveWorkspaceRoute, WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 204 / 204B — admin-entitlement derivation contract.
 *
 * Authorization requires ALL FOUR gates: active entitlement, current LOS profile
 * match, access level Admin/Full, and a workspace name that resolves (via the
 * canonical resolver) to the admin route. Never authorize from entitlement name,
 * access level, or owner alone.
 */

const MATT = 'profile-matt';
const CKINGMA = 'profile-ckingma';

/** A valid admin entitlement for Matthew (override individual fields per test). */
function ent(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    accessLevelName: 'Admin',
    workspaceName: 'Admin Control Center',
    losUserProfileId: MATT,
    active: true,
    ...over,
  };
}

const authorize = (entitlements: AdminEntitlementCandidate[], profiles: string[] = [MATT]) =>
  deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: profiles, entitlements });

describe('204B — canonical workspace-route resolver alignment', () => {
  it('1. "Admin Control Center" resolves to the admin route', () => {
    expect(resolveWorkspaceRoute('Admin Control Center')).toBe(WORKSPACE_ROUTES.admin);
  });
  it('2. "Admin Workspace" resolves to the admin route (backward compatibility)', () => {
    expect(resolveWorkspaceRoute('Admin Workspace')).toBe(WORKSPACE_ROUTES.admin);
  });
  it('preserves the other live reference mappings', () => {
    expect(resolveWorkspaceRoute('Banker Workspace')).toBe(WORKSPACE_ROUTES.banker);
    expect(resolveWorkspaceRoute('Team Workspace')).toBe(WORKSPACE_ROUTES.team);
    expect(resolveWorkspaceRoute('Manager Command Center')).toBe(WORKSPACE_ROUTES.manager);
    expect(resolveWorkspaceRoute('Executive Dashboard')).toBe(WORKSPACE_ROUTES.executive);
    // Portfolio Management is rendered as a surface under the manager route.
    expect(resolveWorkspaceRoute('Portfolio Management')).toBe(WORKSPACE_ROUTES.manager);
  });
});

describe('204B — admin authorization gates', () => {
  it('3. Matthew + Admin Control Center + Admin access authorizes', () => {
    expect(authorize([ent({ accessLevelName: 'Admin' })])).toBe(true);
  });
  it('4. Matthew + Admin Control Center + Full access authorizes', () => {
    expect(authorize([ent({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('5. Matthew + Banker Workspace + Full does NOT authorize admin', () => {
    expect(authorize([ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Full' })])).toBe(false);
  });
  it('6. Matthew + Team Workspace + Full does NOT authorize admin', () => {
    expect(authorize([ent({ workspaceName: 'Team Workspace', accessLevelName: 'Full' })])).toBe(false);
  });
  it('7. ckingma admin entitlement does NOT authorize Matthew (profile scoping)', () => {
    expect(authorize([ent({ losUserProfileId: CKINGMA })], [MATT])).toBe(false);
  });
  it('8. a non-admin name AND non-admin workspace does NOT authorize (even at Admin level)', () => {
    expect(
      authorize([ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Admin', entitlementName: 'Banker Full Access' })]),
    ).toBe(false);
  });
  it('9. owner = Matthew does NOT authorize without a LOS profile match', () => {
    // A fully-admin entitlement whose LOS profile is someone else, even if owned
    // by Matthew, is not the current user's profile → not authorized.
    expect(authorize([ent({ losUserProfileId: 'profile-someone-else' })], [MATT])).toBe(false);
  });
  it('10. fail-closed: inactive entitlement, ReadOnly access, or no profile', () => {
    expect(authorize([ent({ active: false })])).toBe(false);
    expect(authorize([ent({ accessLevelName: 'ReadOnly' })])).toBe(false);
    expect(authorize([ent()], [])).toBe(false); // no user profile → fail closed
    expect(authorize([])).toBe(false);
  });

  it('finds the admin grant among mixed entitlements', () => {
    expect(
      authorize([
        ent({ workspaceName: 'Banker Workspace', accessLevelName: 'Full' }),
        ent({ workspaceName: 'Manager Command Center', accessLevelName: 'ReadOnly' }),
        ent({ workspaceName: 'Admin Control Center', accessLevelName: 'Admin' }),
      ]),
    ).toBe(true);
  });

  it('only Full and Admin authorize (ReadOnly does not)', () => {
    expect([...ADMIN_ACCESS_LEVEL_NAMES].sort()).toEqual(['Admin', 'Full']);
  });
});

// ---------------------------------------------------------------------------
// Phase 204C — live row shape: Workspace optional/blank, name carries meaning
// ---------------------------------------------------------------------------

/** The live operator row shape for Matthew (blank Workspace by default). */
function liveRow(over: Partial<AdminEntitlementCandidate> = {}): AdminEntitlementCandidate {
  return {
    entitlementName: 'Matthew Paller - Admin Full Access',
    accessLevelName: 'Admin',
    workspaceName: undefined, // Workspace lookup is optional / blank in live data
    losUserProfileId: MATT,
    active: true,
    ...over,
  };
}

describe('204C — strictAdminEntitlementName resolver', () => {
  it('resolves admin-access names to true', () => {
    for (const name of [
      'Matthew Paller - Admin Full Access',
      'Admin Full Access',
      'Admin Access',
      'Executive Admin Access',
      'Admin Control Center Access',
    ]) {
      expect(strictAdminEntitlementName(name), name).toBe(true);
    }
  });
  it('resolves non-admin names to false', () => {
    for (const name of ['Banker Full Access', 'Team Member Full Access', 'Manager ReadOnly Access', '', undefined]) {
      expect(strictAdminEntitlementName(name), String(name)).toBe(false);
    }
  });
  it('does not match unsafe substrings (administrator / badminton)', () => {
    expect(strictAdminEntitlementName('Administrator Reporting Access')).toBe(false);
    expect(strictAdminEntitlementName('Badminton Club Access')).toBe(false);
  });
});

describe('204C — authorization over the live (blank-Workspace) row shape', () => {
  it('Matthew + Active + Admin + admin name + blank Workspace => authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Admin' })])).toBe(true);
  });
  it('Matthew + Active + Full + admin name + blank Workspace => authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full' })])).toBe(true);
  });
  it('Matthew + Active + Full + "Banker Full Access" + blank Workspace => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full', entitlementName: 'Banker Full Access' })])).toBe(false);
  });
  it('Matthew + Active + Full + "Team Member Full Access" + blank Workspace => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'Full', entitlementName: 'Team Member Full Access' })])).toBe(false);
  });
  it('Matthew + Active + ReadOnly + admin name => not authorized', () => {
    expect(authorize([liveRow({ accessLevelName: 'ReadOnly' })])).toBe(false);
  });
  it('inactive admin entitlement => not authorized', () => {
    expect(authorize([liveRow({ active: false })])).toBe(false);
  });
  it('ckingma profile + admin entitlement does not authorize Matthew', () => {
    expect(authorize([liveRow({ losUserProfileId: CKINGMA })], [MATT])).toBe(false);
  });
  it('Owner Matthew without LOS profile match does not authorize', () => {
    expect(authorize([liveRow({ losUserProfileId: 'profile-other' })], [MATT])).toBe(false);
  });
  it('Workspace = Admin Control Center (populated) still authorizes', () => {
    expect(authorize([liveRow({ workspaceName: 'Admin Control Center', entitlementName: 'Generic Access' })])).toBe(true);
  });
  it('no current LOS profile ids => fail-closed', () => {
    expect(authorize([liveRow()], [])).toBe(false);
  });
  it('entitlement name alone (no profile match) does not authorize', () => {
    expect(authorize([liveRow({ losUserProfileId: 'someone-else' })], [MATT])).toBe(false);
  });
});

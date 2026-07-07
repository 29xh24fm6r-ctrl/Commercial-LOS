// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@microsoft/power-apps/data', () => ({ getClient: () => ({}) }));

import {
  CRM_ROLE_MOUNTS,
  CRM_REQUIRED_MOUNT_ROLES,
  getCrmRoleMount,
  isCrmMountedForRole,
  crmMountedRoles,
  allRequiredRolesMounted,
  type CrmMountRole,
} from './crmRoleMountRegistry';
import { getFeatureSurface } from '../../navigation/featureSurfaces';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { deriveUnifiedCrmReadiness, CRM_TEAM_READINESS_LEDGER } from './unifiedCrmReadiness';

describe('CRM-D — CRM role mounts for team workflows', () => {
  it('mounts CRM for banker, team, manager, and admin', () => {
    for (const role of ['banker', 'team', 'manager', 'admin'] as CrmMountRole[]) {
      expect(isCrmMountedForRole(role), role).toBe(true);
    }
    expect(crmMountedRoles().sort()).toEqual(['admin', 'banker', 'manager', 'team']);
    expect(allRequiredRolesMounted()).toBe(true);
    expect(CRM_REQUIRED_MOUNT_ROLES).toEqual(['banker', 'team', 'manager', 'admin']);
  });

  it('each mount is gated to its own workspace, and unauthorized roles (e.g. executive) are not mounted', () => {
    for (const m of CRM_ROLE_MOUNTS) {
      // Registry workspace must be a real WorkspaceGate route.
      expect(WORKSPACE_ROUTES[m.workspace]).toBeTruthy();
      // The role and its gating workspace align (fail-closed for other roles).
      expect(m.workspace).toBe(m.role);
    }
    // Executive has no CRM mount — access stays blocked for that role.
    expect(getCrmRoleMount('executive' as CrmMountRole)).toBeUndefined();
    expect(isCrmMountedForRole('executive' as CrmMountRole)).toBe(false);
  });

  it('every role mount resolves to a registered feature surface gated to the matching workspace', () => {
    for (const m of CRM_ROLE_MOUNTS) {
      const surface = getFeatureSurface(m.surfaceKey);
      expect(surface, m.surfaceKey).toBeTruthy();
      expect(surface?.workspace).toBe(m.workspace);
      expect(surface?.flag).toBe('CRM_COMMAND_CENTER_ROUTE_ENABLED');
    }
  });

  it('routed team/manager/admin mounts are READ-ONLY; only the banker has read-write (via the identity-gated hub)', () => {
    expect(getCrmRoleMount('banker')?.access).toBe('read-write');
    expect(getCrmRoleMount('team')?.access).toBe('read');
    expect(getCrmRoleMount('manager')?.access).toBe('read');
    expect(getCrmRoleMount('admin')?.access).toBe('read');
  });

  it('the delivery ledger rolesMounted stays consistent with the mount registry', () => {
    const led = CRM_TEAM_READINESS_LEDGER.rolesMounted;
    for (const role of CRM_REQUIRED_MOUNT_ROLES) {
      expect(led[role], role).toBe(isCrmMountedForRole(role));
    }
  });

  it('the unified team-scope readiness dimension is now ready', () => {
    const r = deriveUnifiedCrmReadiness();
    expect(r.dimensions.find((d) => d.key === 'team-scope')?.status).toBe('ready');
  });
});

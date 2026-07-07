import type { WorkspaceKey } from '../../bootstrap/workspaceRoutes';

/**
 * CRM-D — CRM role-mount registry.
 *
 * The single source of truth for WHICH roles have a CRM surface actually mounted, the
 * WorkspaceGate that authorizes each mount, the routed feature-surface key it lives at,
 * and the access level. Before CRM-D the banker was the only active mount (the crm-hub
 * tab + the CRM-C command-center route); team / manager / admin were mount-CAPABLE but
 * unmounted. CRM-D mounts a role-scoped, read-only CRM Command Center surface for team,
 * manager, and admin — each gated by its own workspace so unauthorized roles stay blocked.
 *
 * Access discipline: every routed mount is READ-ONLY (unified readiness + CRM intelligence).
 * Live create/edit stays in the identity-gated CRM Hub (banker), never widened by a mount.
 */

export type CrmMountRole = 'banker' | 'team' | 'manager' | 'admin';

export type CrmMountAccess = 'read' | 'read-write';

export interface CrmRoleMount {
  readonly role: CrmMountRole;
  /** The WorkspaceGate that authorizes this mount (fail-closed for other roles). */
  readonly workspace: WorkspaceKey;
  /** The routed feature-surface key (/surfaces/<key>) this role reaches CRM through. */
  readonly surfaceKey: string;
  /** True when the surface is actually mounted (not merely mount-capable). */
  readonly mounted: boolean;
  /**
   * read = routed read-only CRM (readiness + intelligence + search/readback of loaded
   * records). read-write = the banker additionally operates the identity-gated CRM Hub
   * (live create/edit). Write is NEVER granted by a routed mount alone.
   */
  readonly access: CrmMountAccess;
}

export const CRM_ROLE_MOUNTS: readonly CrmRoleMount[] = Object.freeze([
  { role: 'banker', workspace: 'banker', surfaceKey: 'crm-command-center', mounted: true, access: 'read-write' },
  { role: 'team', workspace: 'team', surfaceKey: 'crm-command-center-team', mounted: true, access: 'read' },
  { role: 'manager', workspace: 'manager', surfaceKey: 'crm-command-center-manager', mounted: true, access: 'read' },
  { role: 'admin', workspace: 'admin', surfaceKey: 'crm-command-center-admin', mounted: true, access: 'read' },
]);

/** The roles CRM-D requires mounted before CRM is team-ready. */
export const CRM_REQUIRED_MOUNT_ROLES: readonly CrmMountRole[] = ['banker', 'team', 'manager', 'admin'];

export function getCrmRoleMount(role: CrmMountRole): CrmRoleMount | undefined {
  return CRM_ROLE_MOUNTS.find((m) => m.role === role);
}

export function isCrmMountedForRole(role: CrmMountRole): boolean {
  return getCrmRoleMount(role)?.mounted === true;
}

/** The roles that currently have CRM actually mounted. */
export function crmMountedRoles(): CrmMountRole[] {
  return CRM_ROLE_MOUNTS.filter((m) => m.mounted).map((m) => m.role);
}

/** True only when every required role is mounted. */
export function allRequiredRolesMounted(): boolean {
  return CRM_REQUIRED_MOUNT_ROLES.every((r) => isCrmMountedForRole(r));
}

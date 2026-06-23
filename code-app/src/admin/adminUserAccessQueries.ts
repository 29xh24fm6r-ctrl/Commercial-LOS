import { Cr664_platformusersService } from '../generated/services/Cr664_platformusersService';
import { Cr664_workspaceentitlementsesService } from '../generated/services/Cr664_workspaceentitlementsesService';

/**
 * Phase 169B -- User & Access Management read-only queries.
 *
 * READ ONLY. This module never calls create/update/delete. It surfaces
 * the real app-level user and workspace-entitlement records an admin
 * needs to see before any (future, separately-gated) governed write.
 *
 * Least-privilege: each query selects only the display fields the admin
 * table renders, orders deterministically, and caps the row count with
 * `top`. Failures throw so the caller can fail closed to "Not available"
 * rather than rendering a partial/again-misleading list.
 */

/** Hard cap on rows pulled for the read-only admin tables. */
export const ADMIN_USER_ACCESS_ROW_CAP = 100;

export interface AdminUserRow {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly primaryWorkspaceName: string | undefined;
  readonly active: boolean;
  readonly identityStatus: string | undefined;
}

export interface AdminEntitlementRow {
  readonly id: string;
  readonly entitlementName: string;
  readonly accessLevel: string | undefined;
  readonly workspaceName: string | undefined;
  readonly profileName: string | undefined;
  readonly isDefault: boolean;
}

export interface AdminUserAccessSummary {
  readonly userCount: number;
  readonly entitlementCount: number;
  readonly users: readonly AdminUserRow[];
  readonly entitlements: readonly AdminEntitlementRow[];
  /** True when more rows exist than the cap returned. */
  readonly usersTruncated: boolean;
  readonly entitlementsTruncated: boolean;
}

export async function loadAdminUserRows(): Promise<readonly AdminUserRow[]> {
  const result = await Cr664_platformusersService.getAll({
    select: [
      'cr664_platformuserid',
      'cr664_email',
      'cr664_fullname',
      'cr664_activestatus',
      'cr664_identitystatusname',
      'cr664_primaryworkspacename',
    ],
    orderBy: ['cr664_fullname asc'],
    top: ADMIN_USER_ACCESS_ROW_CAP,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load platform users.');
  }
  return (result.data ?? []).map(
    (r): AdminUserRow => ({
      id: r.cr664_platformuserid,
      email: r.cr664_email,
      fullName: r.cr664_fullname,
      primaryWorkspaceName: r.cr664_primaryworkspacename,
      active: r.cr664_activestatus === true,
      identityStatus: r.cr664_identitystatusname,
    }),
  );
}

/**
 * Phase 204L — FOUR-FIELD read. Direct Dataverse Web API testing (Phase 204K)
 * proved that selecting the formatted display/name fields on
 * cr664_workspaceentitlements (the workspace display name, the LOS-profile label,
 * the access-level name, isdefault, and the row id) FAILS the whole query live,
 * while a read of exactly these four fields SUCCEEDS. So this read selects ONLY:
 * cr664_entitlementname, cr664_accesslevel, _cr664_losuserprofile_value, statecode.
 * The display-only columns (workspaceName, isDefault) are derived as undefined/false
 * rather than read, and accessLevel is surfaced as the numeric option-set value.
 */
export async function loadAdminEntitlementRows(): Promise<readonly AdminEntitlementRow[]> {
  const result = await Cr664_workspaceentitlementsesService.getAll({
    select: [
      'cr664_entitlementname',
      'cr664_accesslevel',
      '_cr664_losuserprofile_value',
      'statecode',
    ],
    orderBy: ['cr664_entitlementname asc'],
    top: ADMIN_USER_ACCESS_ROW_CAP,
  });
  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to load workspace entitlements.',
    );
  }
  return (result.data ?? []).map(
    (r): AdminEntitlementRow => {
      const entitlementName = r.cr664_entitlementname;
      const accessLevel = r.cr664_accesslevel;
      const profileId = r._cr664_losuserprofile_value;
      const stateCode = r.statecode;
      return {
        id: `${entitlementName}:${accessLevel ?? 'none'}:${profileId ?? 'none'}:${stateCode ?? 'none'}`,
        entitlementName,
        accessLevel: accessLevel === undefined || accessLevel === null ? undefined : String(accessLevel),
        workspaceName: undefined,
        profileName: profileId,
        isDefault: false,
      };
    },
  );
}

/**
 * Load both lists for the admin panel. Fails closed: if either read
 * throws, the whole summary rejects so the UI shows "Not available"
 * rather than a half-populated, misleading table.
 */
export async function loadAdminUserAccessSummary(): Promise<AdminUserAccessSummary> {
  const [users, entitlements] = await Promise.all([
    loadAdminUserRows(),
    loadAdminEntitlementRows(),
  ]);
  return {
    userCount: users.length,
    entitlementCount: entitlements.length,
    users,
    entitlements,
    usersTruncated: users.length >= ADMIN_USER_ACCESS_ROW_CAP,
    entitlementsTruncated: entitlements.length >= ADMIN_USER_ACCESS_ROW_CAP,
  };
}

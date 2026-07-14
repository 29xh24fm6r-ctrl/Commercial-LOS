/**
 * Read-only queries backing Admin → Grant/Revoke Admin Access.
 *
 * `cr664_workspaceentitlements` has no reliable PlatformUser FK and its
 * Workspace/access-level-name/isdefault display fields are not selectable in
 * live Dataverse (see adminWorkspaceEntitlementQuery.ts and
 * adminUserAccessQueries.ts, both hard-won across many "Phase 204" fixes) — so
 * an entitlement's identity is carried entirely by its NAME (a
 * "{upn} - Admin {Level} Access" convention) and admin-shape is carried by the
 * literal word "admin" in that name. This module reuses the SAME proven field
 * selections and gate logic those modules already established rather than
 * re-deriving them.
 *
 * READ ONLY — this module never calls create/update/delete.
 */

import {
  resolveAccessLevelKind,
  classifyCurrentUserIdentityMatch,
  entitlementMeetsAdminGates,
  type AccessLevelKind,
  type AdminEntitlementCandidate,
  type AdminCurrentUser,
} from './adminWorkspaceEntitlementQuery';

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

const ADMIN_SHAPED_FILTER =
  'statecode eq 0 and (cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000)';

export type AdminAccessTier = 'admin' | 'full' | 'none' | 'failed';

export interface AdminAccessTierResult {
  readonly tier: AdminAccessTier;
  readonly message?: string;
}

/**
 * Resolve the SIGNED-IN admin's own highest access tier among their admin-
 * shaped entitlements: 'admin' (can grant/revoke), 'full' (can use admin
 * tools only), 'none' (holds no admin-shaped entitlement — should not have
 * reached this panel, but fail closed rather than assume), 'failed' (the read
 * itself failed — fail closed, never assume 'admin').
 */
export async function loadCurrentAdminAccessTier(
  upn: string,
  fullName: string | undefined,
): Promise<AdminAccessTierResult> {
  const trimmedUpn = (upn ?? '').trim();
  if (trimmedUpn.length === 0) return { tier: 'none' };
  try {
    const { Cr664_workspaceentitlementsesService } = await import(
      '../generated/services/Cr664_workspaceentitlementsesService'
    );
    const res = await Cr664_workspaceentitlementsesService.getAll({
      select: ['cr664_entitlementname', 'cr664_accesslevel', '_cr664_losuserprofile_value', 'statecode'],
      filter: ADMIN_SHAPED_FILTER,
      top: 200,
    });
    if (!res.success) {
      return { tier: 'failed', message: res.error?.message ?? 'Could not read admin entitlements.' };
    }
    const currentUser: AdminCurrentUser = { upn: trimmedUpn, fullName };
    const candidates: AdminEntitlementCandidate[] = (res.data ?? []).map((r) => ({
      entitlementName: r.cr664_entitlementname,
      accessLevel: r.cr664_accesslevel,
      losUserProfileId: r._cr664_losuserprofile_value,
      active: r.statecode === 0,
    }));
    let best: AdminAccessTier = 'none';
    for (const c of candidates) {
      if (!entitlementMeetsAdminGates(c)) continue;
      if (classifyCurrentUserIdentityMatch(currentUser, c) === 'none') continue;
      const kind = resolveAccessLevelKind(c.accessLevel, c.accessLevelName);
      if (kind === 'Admin') return { tier: 'admin' };
      if (kind === 'Full') best = 'full';
    }
    return { tier: best };
  } catch (err: unknown) {
    return { tier: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}

export interface AdminEntitlementListRow {
  readonly id: string;
  readonly entitlementName: string;
  readonly accessLevelKind: AccessLevelKind;
  readonly active: boolean;
}

export interface AdminEntitlementListResult {
  readonly success: boolean;
  readonly rows?: readonly AdminEntitlementListRow[];
  readonly error?: string;
}

/**
 * List every ACTIVE admin-shaped entitlement row, with its raw id, for the
 * Revoke list. NOTE: adminUserAccessQueries.ts documents that selecting
 * cr664_workspaceentitlementsid alongside the table's FORMATTED display
 * fields fails the query live; this select stays within the proven-safe raw
 * fields (id is the table's own primary key, not a formatted/lookup-display
 * field) but has not been exercised against live Dataverse by this change —
 * if it fails, the panel shows "unavailable" rather than crashing or faking
 * a result.
 */
export async function listAdminEntitlementRows(): Promise<AdminEntitlementListResult> {
  try {
    const { Cr664_workspaceentitlementsesService } = await import(
      '../generated/services/Cr664_workspaceentitlementsesService'
    );
    const res = await Cr664_workspaceentitlementsesService.getAll({
      select: ['cr664_workspaceentitlementsid', 'cr664_entitlementname', 'cr664_accesslevel', 'statecode'],
      filter: ADMIN_SHAPED_FILTER,
      orderBy: ['cr664_entitlementname asc'],
      top: 200,
    });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Could not read admin entitlements.' };
    const rows: AdminEntitlementListRow[] = (res.data ?? []).map((r) => ({
      id: r.cr664_workspaceentitlementsid,
      entitlementName: r.cr664_entitlementname,
      accessLevelKind: resolveAccessLevelKind(r.cr664_accesslevel),
      active: r.statecode === 0,
    }));
    return { success: true, rows };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface PlatformUserOption {
  readonly id: string;
  readonly upn: string;
  readonly fullName: string;
}

export interface PlatformUserOptionsResult {
  readonly success: boolean;
  readonly rows?: readonly PlatformUserOption[];
  readonly error?: string;
}

/** Active platform users, for the "grant to" picker. */
export async function listGrantablePlatformUsers(): Promise<PlatformUserOptionsResult> {
  try {
    const { Cr664_platformusersService } = await import('../generated/services/Cr664_platformusersService');
    const res = await Cr664_platformusersService.getAll({
      select: ['cr664_platformuserid', 'cr664_email', 'cr664_fullname', 'cr664_activestatus'],
      orderBy: ['cr664_fullname asc'],
      top: 200,
    });
    if (!res.success) return { success: false, error: res.error?.message ?? 'Could not read platform users.' };
    const rows: PlatformUserOption[] = (res.data ?? [])
      .filter((r) => r.cr664_activestatus !== false)
      .map((r) => ({ id: r.cr664_platformuserid, upn: r.cr664_email, fullName: r.cr664_fullname }));
    return { success: true, rows };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export { escapeOData };

import { resolveWorkspaceRoute, WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 204 — admin / superadmin workspace entitlement probe.
 *
 * READ-ONLY, FAIL-CLOSED. Resolves whether the signed-in user holds an existing
 * Admin-workspace entitlement so the workspace switcher can surface Admin
 * Workspace for authorized admins/superadmins ONLY — without widening access or
 * inventing schema. It reuses the existing entitlement chain (Phase 115/188):
 *
 *   cr664_platformusers (cr664_email = upn, active)
 *     → _cr664_coreuser_value (the cr664_user core identity)
 *     → cr664_losuserprofiles (_cr664_user_value = coreUserId)
 *     → cr664_workspaceentitlements (_cr664_losuserprofile_value = profileId)
 *
 * An entitlement authorizes admin iff its workspace resolves to the admin route
 * AND its access level is Full or Admin. Any missing hop, inactive user, or read
 * error returns a not-entitled / failed result — never a coerced "entitled".
 * No create/update/delete, no fabricated data.
 */

export type AdminWorkspaceEntitlementResult =
  | { kind: 'entitled' }
  /** Active read confirmed no admin entitlement. Not an error. */
  | { kind: 'not-entitled' }
  | { kind: 'failed'; message: string };

/** Access-level names (cr664_accesslevelname) that authorize admin-workspace access. */
export const ADMIN_ACCESS_LEVEL_NAMES: ReadonlySet<string> = new Set(['Full', 'Admin']);

export interface AdminEntitlementCandidate {
  readonly accessLevelName?: string;
  readonly workspaceName?: string;
  /** The entitlement's LOS user profile lookup (_cr664_losuserprofile_value). */
  readonly losUserProfileId?: string;
  /** True when the entitlement row is Active (statecode === 0). */
  readonly active?: boolean;
}

export interface AdminEntitlementDecisionInput {
  /** The signed-in user's resolved LOS user profile id(s). */
  readonly userLosProfileIds: ReadonlyArray<string>;
  /** Candidate workspace entitlements to evaluate. */
  readonly entitlements: ReadonlyArray<AdminEntitlementCandidate>;
}

/**
 * Phase 204B — PURE admin-authorization decision. Authorizes iff at least one
 * entitlement satisfies ALL FOUR gates (defense in depth — never authorize from
 * any single field):
 *   1. the entitlement is ACTIVE;
 *   2. its LOS user profile matches the CURRENT user's profile (not owner, not
 *      entitlement name);
 *   3. its access level is Admin or Full (not ReadOnly);
 *   4. its workspace name resolves (via the canonical resolver) to the admin
 *      route — so the live "Admin Control Center" reference row counts, but a
 *      non-admin workspace never does.
 * No profile → fail closed. Fully unit-testable.
 */
export function deriveHasAdminWorkspaceEntitlement(
  input: AdminEntitlementDecisionInput,
): boolean {
  const profileSet = new Set(input.userLosProfileIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (profileSet.size === 0) return false;
  return input.entitlements.some(
    (e) =>
      e.active === true &&
      typeof e.losUserProfileId === 'string' &&
      profileSet.has(e.losUserProfileId) &&
      ADMIN_ACCESS_LEVEL_NAMES.has((e.accessLevelName ?? '').trim()) &&
      resolveWorkspaceRoute(e.workspaceName) === WORKSPACE_ROUTES.admin,
  );
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Live, read-only, fail-closed admin-entitlement probe. The SDK-bound generated
 * services load via dynamic import so this module's static graph stays SDK-free
 * (importing the probe never pulls the SDK; only a real read does).
 */
export async function loadAdminWorkspaceEntitlement(
  upn: string,
): Promise<AdminWorkspaceEntitlementResult> {
  const trimmed = (upn ?? '').trim();
  if (trimmed.length === 0) return { kind: 'not-entitled' };
  try {
    const [{ Cr664_platformusersService }, { Cr664_losuserprofilesService }, { Cr664_workspaceentitlementsesService }] =
      await Promise.all([
        import('../generated/services/Cr664_platformusersService'),
        import('../generated/services/Cr664_losuserprofilesService'),
        import('../generated/services/Cr664_workspaceentitlementsesService'),
      ]);

    const userRes = await Cr664_platformusersService.getAll({
      select: ['cr664_platformuserid', 'cr664_email', 'cr664_activestatus', '_cr664_coreuser_value'],
      filter: `cr664_email eq '${escapeOData(trimmed)}'`,
      top: 1,
    });
    if (!userRes.success) {
      return { kind: 'failed', message: userRes.error?.message ?? 'Failed to load platform user.' };
    }
    const user = userRes.data?.[0];
    if (!user || user.cr664_activestatus !== true) return { kind: 'not-entitled' };
    const coreUserId = user._cr664_coreuser_value;
    if (!coreUserId) return { kind: 'not-entitled' };

    const profileRes = await Cr664_losuserprofilesService.getAll({
      select: ['cr664_losuserprofileid'],
      filter: `_cr664_user_value eq ${coreUserId}`,
      top: 10,
    });
    if (!profileRes.success) {
      return { kind: 'failed', message: profileRes.error?.message ?? 'Failed to load LOS user profile.' };
    }
    const profileIds = (profileRes.data ?? [])
      .map((r) => r.cr664_losuserprofileid)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (profileIds.length === 0) return { kind: 'not-entitled' };

    const filter = profileIds.map((id) => `_cr664_losuserprofile_value eq ${id}`).join(' or ');
    const entRes = await Cr664_workspaceentitlementsesService.getAll({
      select: ['cr664_accesslevelname', 'cr664_workspacename', '_cr664_losuserprofile_value', 'statecode'],
      filter,
      top: 100,
    });
    if (!entRes.success) {
      return { kind: 'failed', message: entRes.error?.message ?? 'Failed to load workspace entitlements.' };
    }
    const entitlements: AdminEntitlementCandidate[] = (entRes.data ?? []).map((r) => ({
      accessLevelName: r.cr664_accesslevelname,
      workspaceName: r.cr664_workspacename,
      losUserProfileId: r._cr664_losuserprofile_value,
      // statecode 0 = Active (Cr664_workspaceentitlementsesstatecode).
      active: r.statecode === 0,
    }));
    return deriveHasAdminWorkspaceEntitlement({ userLosProfileIds: profileIds, entitlements })
      ? { kind: 'entitled' }
      : { kind: 'not-entitled' };
  } catch (err: unknown) {
    return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}

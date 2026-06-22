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
 * An entitlement authorizes admin iff it is active, its LOS profile matches the
 * current user, its access level resolves to Full or Admin (from the authoritative
 * cr664_accesslevel option-set — Phase 204D), and EITHER its workspace resolves to
 * the admin route OR its entitlement name strictly resolves to admin (Phase 204C).
 * Any missing hop, inactive user, or read error returns a not-entitled / failed
 * result — never a coerced "entitled". No create/update/delete, no fabricated data.
 */

export type AdminWorkspaceEntitlementResult =
  | { kind: 'entitled' }
  /** Active read confirmed no admin entitlement. Not an error. */
  | { kind: 'not-entitled' }
  | { kind: 'failed'; message: string };

/** Access-level names (cr664_accesslevelname) that authorize admin-workspace access. */
export const ADMIN_ACCESS_LEVEL_NAMES: ReadonlySet<string> = new Set(['Full', 'Admin']);

/**
 * Phase 204D — the authoritative Dataverse option-set for the entitlement's
 * access level (cr664_accesslevel). The formatted name field (cr664_accesslevelname)
 * is optional and is frequently NOT returned by the Power Apps data client, so the
 * numeric option-set value is the source of truth for the access-level gate.
 */
export const ACCESS_LEVEL_OPTION_SET: Readonly<Record<number, AccessLevelKind>> = {
  788190000: 'Full',
  788190001: 'ReadOnly',
  788190002: 'Admin',
};

export type AccessLevelKind = 'Full' | 'Admin' | 'ReadOnly' | 'Unknown';

/** Access-level kinds that authorize admin-workspace access (not ReadOnly / Unknown). */
export const ADMIN_ACCESS_LEVEL_KINDS: ReadonlySet<AccessLevelKind> = new Set<AccessLevelKind>([
  'Full',
  'Admin',
]);

export interface AdminEntitlementCandidate {
  /**
   * The authoritative access-level option-set value (cr664_accesslevel): a number
   * (788190000=Full / 788190001=ReadOnly / 788190002=Admin) on live rows. A numeric
   * string is also accepted for clients that stringify option-set values.
   */
  readonly accessLevel?: number | string;
  /**
   * The optional formatted access-level name (cr664_accesslevelname). String fallback
   * only — NOT relied upon for live reads because the client may omit it.
   */
  readonly accessLevelName?: string;
  readonly workspaceName?: string;
  /** The entitlement display name (cr664_entitlementname). */
  readonly entitlementName?: string;
  /** The entitlement's LOS user profile lookup (_cr664_losuserprofile_value). */
  readonly losUserProfileId?: string;
  /** True when the entitlement row is Active (statecode === 0). */
  readonly active?: boolean;
}

/**
 * Phase 204D — resolve the entitlement's access level to a stable kind. The
 * authoritative numeric option-set value (cr664_accesslevel) is preferred; a
 * numeric string is parsed; the formatted name (cr664_accesslevelname) is a
 * last-resort fallback (used by pure tests, not relied upon live). Anything
 * unrecognized resolves to 'Unknown' so the access gate fails closed.
 */
export function resolveAccessLevelKind(
  accessLevel: number | string | undefined,
  accessLevelName?: string,
): AccessLevelKind {
  if (typeof accessLevel === 'number') {
    return ACCESS_LEVEL_OPTION_SET[accessLevel] ?? 'Unknown';
  }
  if (typeof accessLevel === 'string' && accessLevel.trim().length > 0) {
    const trimmed = accessLevel.trim();
    const asNum = Number(trimmed);
    if (Number.isInteger(asNum) && Object.prototype.hasOwnProperty.call(ACCESS_LEVEL_OPTION_SET, asNum)) {
      return ACCESS_LEVEL_OPTION_SET[asNum];
    }
    if (trimmed === 'Full' || trimmed === 'Admin' || trimmed === 'ReadOnly') return trimmed;
  }
  const name = (accessLevelName ?? '').trim();
  if (name === 'Full' || name === 'Admin' || name === 'ReadOnly') return name;
  return 'Unknown';
}

export interface AdminEntitlementDecisionInput {
  /** The signed-in user's resolved LOS user profile id(s). */
  readonly userLosProfileIds: ReadonlyArray<string>;
  /** Candidate workspace entitlements to evaluate. */
  readonly entitlements: ReadonlyArray<AdminEntitlementCandidate>;
}

/**
 * Phase 204C — strict admin-entitlement-NAME resolver. The live Workspace
 * Entitlements.Workspace lookup is optional and often blank, so admin meaning is
 * carried by the entitlement name. An entitlement name "resolves to admin
 * access" iff it contains the standalone word "admin" (case-insensitive) — so
 * "Admin Full Access", "Executive Admin Access", "Admin Control Center Access",
 * and "Matthew Paller - Admin Full Access" qualify, while "Banker Full Access",
 * "Team Member Full Access", and "Manager ReadOnly Access" do not. The word
 * boundary keeps unsafe substrings ("administrator", "badminton") from matching.
 *
 * This is NOT authorization on its own — the deriver still requires the active /
 * profile-match / access-level gates to pass.
 */
export function strictAdminEntitlementName(entitlementName: string | undefined): boolean {
  return /\badmin\b/i.test((entitlementName ?? '').trim());
}

/**
 * Phase 204C / 204D — PURE admin-authorization decision over the LIVE row shape.
 * Authorizes iff at least one entitlement satisfies ALL gates (defense in depth
 * — never authorize from name, access level, or owner alone):
 *   1. the entitlement is ACTIVE;
 *   2. its LOS user profile matches the CURRENT user's profile (not owner);
 *   3. its access level resolves to Admin or Full (not ReadOnly / Unknown) — from
 *      the authoritative numeric option-set (cr664_accesslevel) or a string
 *      fallback (Phase 204D);
 *   4. EITHER its workspace name resolves to the admin route (when the optional
 *      Workspace lookup is populated) OR its entitlement name strictly resolves
 *      to admin access (the live rows carry meaning in the name, with Workspace
 *      blank).
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
      ADMIN_ACCESS_LEVEL_KINDS.has(resolveAccessLevelKind(e.accessLevel, e.accessLevelName)) &&
      (resolveWorkspaceRoute(e.workspaceName) === WORKSPACE_ROUTES.admin ||
        strictAdminEntitlementName(e.entitlementName)),
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
      // Phase 204D — select the authoritative numeric access-level option-set
      // (cr664_accesslevel), NOT the optional formatted name (cr664_accesslevelname)
      // which the client may omit. cr664_workspacename stays selected because the
      // Workspace path is still one of the two OR conditions in the deriver.
      select: [
        'cr664_entitlementname',
        'cr664_accesslevel',
        'cr664_workspacename',
        '_cr664_losuserprofile_value',
        'statecode',
      ],
      filter,
      top: 100,
    });
    if (!entRes.success) {
      return { kind: 'failed', message: entRes.error?.message ?? 'Failed to load workspace entitlements.' };
    }
    const entitlements: AdminEntitlementCandidate[] = (entRes.data ?? []).map((r) => ({
      entitlementName: r.cr664_entitlementname,
      // Authoritative option-set value (788190000=Full / 788190002=Admin).
      accessLevel: r.cr664_accesslevel,
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

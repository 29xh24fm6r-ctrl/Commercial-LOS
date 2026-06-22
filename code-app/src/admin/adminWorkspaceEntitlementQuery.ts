import { resolveWorkspaceRoute, WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';

/**
 * Phase 204 / 204E — admin / superadmin workspace entitlement probe.
 *
 * READ-ONLY, FAIL-CLOSED. Resolves whether the signed-in user holds an existing
 * Admin-workspace entitlement so the workspace switcher can surface Admin
 * Workspace for authorized admins/superadmins ONLY — without widening access or
 * inventing schema.
 *
 * Phase 204E — identity follows the LIVE Phase 115 bootstrap contract: the
 * canonical current user is the active `cr664_platformuser` matched by
 * `cr664_email` (NOT the legacy cr664_user → cr664_losuserprofile chain, which the
 * live environment does not populate — see bootstrapFlow.ts). The probe therefore
 * does NOT require `_cr664_coreuser_value` or a resolved LOS profile; those remain
 * an OPTIONAL match signal when present. `cr664_workspaceentitlements` carries no
 * PlatformUser FK, so the probe queries active Admin/Full entitlements and then
 * attributes a row to the current user by the strongest available SAFE signal
 * (profile-id, profile-label == UPN, or user-specific entitlement name).
 *
 * An entitlement authorizes admin iff it is active, its access level resolves to
 * Full or Admin (authoritative cr664_accesslevel option-set — Phase 204D), EITHER
 * its workspace resolves to the admin route OR its entitlement name strictly
 * resolves to admin (Phase 204C), AND it is attributed to the current user
 * (Phase 204E). Any inactive user or read error returns a not-entitled / failed
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
  /**
   * Phase 204E — the optional formatted LOS-profile label (cr664_losuserprofilename).
   * In the live env the LOS-profile label is the user's UPN, so this is an identity
   * signal when the client returns it.
   */
  readonly losUserProfileName?: string;
  /**
   * Phase 204E — the formatted owner name (owneridname). Carried for completeness /
   * diagnostics ONLY. Owner is NEVER an authorization signal.
   */
  readonly ownerName?: string;
  /** True when the entitlement row is Active (statecode === 0). */
  readonly active?: boolean;
}

/**
 * Phase 204E — the canonical current-user identity, sourced from the live
 * `cr664_platformuser` row (Phase 115 bootstrap contract), NOT the legacy
 * cr664_user → losuserprofile chain. `losUserProfileIds` is an OPTIONAL legacy
 * signal: in the live env it is usually empty, so identity is matched by the
 * stronger available signals (profile-label == UPN, or user-specific entitlement
 * name) instead.
 */
export interface AdminCurrentUser {
  /** The signed-in user principal name (cr664_email on the PlatformUser row). */
  readonly upn: string;
  /** cr664_platformuserid of the matched PlatformUser. */
  readonly platformUserId?: string;
  /** cr664_fullname of the matched PlatformUser (used for user-specific name match). */
  readonly fullName?: string;
  /**
   * Optional LOS user-profile id(s) resolved for this user via the legacy chain
   * (only when cr664_user / losuserprofile happen to be populated). May be empty.
   */
  readonly losUserProfileIds?: ReadonlyArray<string>;
}

export interface AdminEntitlementUserDecisionInput {
  readonly currentUser: AdminCurrentUser;
  readonly entitlements: ReadonlyArray<AdminEntitlementCandidate>;
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
 * Phase 204C / 204D — the NON-identity admin gates an entitlement must satisfy:
 *   1. the entitlement is ACTIVE;
 *   2. its access level resolves to Admin or Full (not ReadOnly / Unknown) — from
 *      the authoritative numeric option-set (cr664_accesslevel) or a string
 *      fallback (Phase 204D);
 *   3. EITHER its workspace name resolves to the admin route (when the optional
 *      Workspace lookup is populated) OR its entitlement name strictly resolves
 *      to admin access (the live rows carry meaning in the name, Workspace blank).
 * Identity (current-user match) is enforced SEPARATELY by the callers below — an
 * entitlement passing these gates is admin-shaped but not yet attributed to the
 * signed-in user.
 */
function entitlementMeetsAdminGates(e: AdminEntitlementCandidate): boolean {
  return (
    e.active === true &&
    ADMIN_ACCESS_LEVEL_KINDS.has(resolveAccessLevelKind(e.accessLevel, e.accessLevelName)) &&
    (resolveWorkspaceRoute(e.workspaceName) === WORKSPACE_ROUTES.admin ||
      strictAdminEntitlementName(e.entitlementName))
  );
}

/**
 * Phase 204C / 204D — PURE admin-authorization over LOS-profile-id matching.
 * Retained for the legacy chain: authorizes iff at least one entitlement passes
 * the admin gates AND its LOS user profile is in the current user's resolved
 * profile-id set. Never authorize from name, access level, or owner alone.
 * No profile → fail closed.
 */
export function deriveHasAdminWorkspaceEntitlement(
  input: AdminEntitlementDecisionInput,
): boolean {
  const profileSet = new Set(input.userLosProfileIds.filter((id) => typeof id === 'string' && id.length > 0));
  if (profileSet.size === 0) return false;
  return input.entitlements.some(
    (e) =>
      typeof e.losUserProfileId === 'string' &&
      profileSet.has(e.losUserProfileId) &&
      entitlementMeetsAdminGates(e),
  );
}

/**
 * Phase 204E — does this admin-shaped entitlement belong to the CURRENT user?
 * Identity is matched by the strongest available SAFE signal (never owner):
 *   a. profile-id match — the entitlement's LOS profile id is in the user's
 *      resolved profile-id set (legacy chain, usually empty in live env);
 *   b. profile-label match — cr664_losuserprofilename equals the UPN exactly
 *      (case-insensitive); the live LOS-profile label is the user's UPN;
 *   c. user-specific entitlement name — the name begins with the user's full name
 *      or email followed by " - Admin" (e.g. "Matthew Paller - Admin Full Access").
 * A generic admin name (e.g. "Executive Admin Access") with none of these matches
 * is NOT attributed to the user. Returns false when no signal is available.
 */
export function matchesCurrentUserIdentity(
  currentUser: AdminCurrentUser,
  e: AdminEntitlementCandidate,
): boolean {
  const upn = (currentUser.upn ?? '').trim().toLowerCase();
  if (upn.length === 0) return false;

  // (a) profile-id match (legacy chain)
  const profileIds = (currentUser.losUserProfileIds ?? []).filter(
    (id) => typeof id === 'string' && id.length > 0,
  );
  if (
    typeof e.losUserProfileId === 'string' &&
    e.losUserProfileId.length > 0 &&
    profileIds.includes(e.losUserProfileId)
  ) {
    return true;
  }

  // (b) profile-label equals UPN exactly (case-insensitive)
  const profileLabel = (e.losUserProfileName ?? '').trim().toLowerCase();
  if (profileLabel.length > 0 && profileLabel === upn) return true;

  // (c) user-specific entitlement name begins with fullName/email + " - Admin"
  const name = (e.entitlementName ?? '').trim().toLowerCase();
  if (name.length > 0) {
    const fullName = (currentUser.fullName ?? '').trim().toLowerCase();
    const candidates = [fullName, upn].filter((s) => s.length > 0);
    for (const id of candidates) {
      if (name.startsWith(`${id} - admin`)) return true;
    }
  }

  return false;
}

/**
 * Phase 204E — PURE identity-aware admin authorization over the LIVE PlatformUser
 * identity. Authorizes iff at least one entitlement passes the admin gates AND is
 * attributed to the current user by a safe identity signal. This is the live path:
 * it does NOT require the legacy cr664_user / losuserprofile chain. Never authorize
 * from access level, generic admin name, or owner alone.
 */
export function deriveHasAdminWorkspaceEntitlementForUser(
  input: AdminEntitlementUserDecisionInput,
): boolean {
  if ((input.currentUser.upn ?? '').trim().length === 0) return false;
  return input.entitlements.some(
    (e) => entitlementMeetsAdminGates(e) && matchesCurrentUserIdentity(input.currentUser, e),
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

    // Phase 204E — canonical identity is the live PlatformUser (Phase 115), matched
    // by cr664_email exactly as bootstrapFlow.ts does. We DO NOT require the legacy
    // _cr664_coreuser_value / losuserprofile chain (the live env does not populate
    // it); a valid active PlatformUser is sufficient identity.
    const userRes = await Cr664_platformusersService.getAll({
      select: [
        'cr664_platformuserid',
        'cr664_email',
        'cr664_fullname',
        'cr664_activestatus',
        '_cr664_coreuser_value',
      ],
      filter: `cr664_email eq '${escapeOData(trimmed)}'`,
      top: 1,
    });
    if (!userRes.success) {
      return { kind: 'failed', message: userRes.error?.message ?? 'Failed to load platform user.' };
    }
    const user = userRes.data?.[0];
    if (!user || user.cr664_activestatus !== true) return { kind: 'not-entitled' };

    // Optional legacy signal: resolve LOS profile id(s) ONLY when the legacy core
    // user link is present. A blank core user no longer fails the probe, and a
    // failed/empty optional read is non-fatal — identity falls back to the live
    // PlatformUser signals (profile label == UPN, or user-specific entitlement name).
    let profileIds: string[] = [];
    const coreUserId = user._cr664_coreuser_value;
    if (coreUserId) {
      const profileRes = await Cr664_losuserprofilesService.getAll({
        select: ['cr664_losuserprofileid'],
        filter: `_cr664_user_value eq ${coreUserId}`,
        top: 10,
      });
      if (profileRes.success) {
        profileIds = (profileRes.data ?? [])
          .map((r) => r.cr664_losuserprofileid)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
    }

    // Phase 204E — query active Admin/Full entitlements directly (server-side gate),
    // then attribute to the current user client-side by the strongest safe signal.
    // There is no PlatformUser FK on cr664_workspaceentitlements, so we cannot filter
    // by the current user server-side; the identity gate is enforced in the deriver.
    const entRes = await Cr664_workspaceentitlementsesService.getAll({
      // Phase 204D — select the authoritative numeric access-level option-set
      // (cr664_accesslevel), NOT the optional formatted name (cr664_accesslevelname)
      // which the client may omit. cr664_workspacename stays selected (one OR branch);
      // cr664_losuserprofilename is the live identity label (Phase 204E).
      select: [
        'cr664_entitlementname',
        'cr664_accesslevel',
        'cr664_workspacename',
        '_cr664_losuserprofile_value',
        'cr664_losuserprofilename',
        'statecode',
      ],
      // Active + Admin(788190002)/Full(788190000) only. Reduces the candidate set
      // before the client-side identity match.
      filter: 'statecode eq 0 and (cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000)',
      top: 200,
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
      losUserProfileName: r.cr664_losuserprofilename,
      // statecode 0 = Active (Cr664_workspaceentitlementsesstatecode).
      active: r.statecode === 0,
    }));

    const currentUser: AdminCurrentUser = {
      upn: trimmed,
      platformUserId: user.cr664_platformuserid,
      fullName: user.cr664_fullname,
      losUserProfileIds: profileIds,
    };
    return deriveHasAdminWorkspaceEntitlementForUser({ currentUser, entitlements })
      ? { kind: 'entitled' }
      : { kind: 'not-entitled' };
  } catch (err: unknown) {
    return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}

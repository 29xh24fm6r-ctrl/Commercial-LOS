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

// ---------------------------------------------------------------------------
// Phase 204F — PlatformUser validity gate (aligned with bootstrapFlow.ts)
// ---------------------------------------------------------------------------

/** cr664_platformusers.statecode value meaning the row is Inactive. */
const PLATFORM_USER_STATECODE_INACTIVE = 1;
/** cr664_identitystatus option-set values that explicitly BLOCK the probe. */
const IDENTITY_STATUS_DISABLED = 788190002;
const IDENTITY_STATUS_SUSPENDED = 788190003;

/** The PlatformUser fields the admin probe inspects for usability. */
export interface AdminProbePlatformUser {
  readonly cr664_activestatus?: boolean;
  readonly cr664_identitystatus?: number;
  readonly statecode?: number;
}

/**
 * Phase 204F — is this PlatformUser usable for the admin probe? Aligned with
 * `bootstrapFlow.ts`, which lets a user boot the app on the strength of a
 * PlatformUser row + a primary workspace and does NOT gate on `cr664_activestatus`.
 *
 * The probe must not be STRICTER than bootstrap, or a user who boots the app
 * normally could fail the admin probe before entitlement evaluation. So
 * `cr664_activestatus` (optional, sometimes omitted/false) is NOT a required gate.
 * The row is usable unless it is EXPLICITLY disabled:
 *   - `statecode === 1` (Inactive)               → not usable;
 *   - `cr664_identitystatus` Disabled/Suspended   → not usable.
 * A missing row is not usable. Everything else (including undefined/false
 * activestatus, undefined statecode/identitystatus, or identitystatus Pending)
 * is usable and proceeds to entitlement evaluation. Fail-closed on explicit
 * deactivation only.
 */
export function resolvePlatformUserUsableForAdminProbe(
  user: AdminProbePlatformUser | undefined | null,
): boolean {
  if (!user) return false;
  if (user.statecode === PLATFORM_USER_STATECODE_INACTIVE) return false;
  if (
    user.cr664_identitystatus === IDENTITY_STATUS_DISABLED ||
    user.cr664_identitystatus === IDENTITY_STATUS_SUSPENDED
  ) {
    return false;
  }
  return true;
}

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
export function entitlementMeetsAdminGates(e: AdminEntitlementCandidate): boolean {
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
export type AdminIdentityMatchReason =
  | 'profile-id'
  | 'profile-label-upn'
  | 'full-name-admin-prefix'
  | 'upn-admin-prefix'
  | 'none';

/**
 * Phase 204G — classify WHICH safe identity signal (if any) attributes this
 * entitlement to the current user, in priority order. Same logic as
 * `matchesCurrentUserIdentity`; it additionally names the matching signal so the
 * read-only diagnostic can show exactly why a row did or did not attribute.
 */
export function classifyCurrentUserIdentityMatch(
  currentUser: AdminCurrentUser,
  e: AdminEntitlementCandidate,
): AdminIdentityMatchReason {
  const upn = (currentUser.upn ?? '').trim().toLowerCase();
  if (upn.length === 0) return 'none';

  // (a) profile-id match (legacy chain)
  const profileIds = (currentUser.losUserProfileIds ?? []).filter(
    (id) => typeof id === 'string' && id.length > 0,
  );
  if (
    typeof e.losUserProfileId === 'string' &&
    e.losUserProfileId.length > 0 &&
    profileIds.includes(e.losUserProfileId)
  ) {
    return 'profile-id';
  }

  // (b) profile-label equals UPN exactly (case-insensitive)
  const profileLabel = (e.losUserProfileName ?? '').trim().toLowerCase();
  if (profileLabel.length > 0 && profileLabel === upn) return 'profile-label-upn';

  // (c) user-specific entitlement name begins with fullName/email + " - Admin"
  const name = (e.entitlementName ?? '').trim().toLowerCase();
  if (name.length > 0) {
    const fullName = (currentUser.fullName ?? '').trim().toLowerCase();
    if (fullName.length > 0 && name.startsWith(`${fullName} - admin`)) return 'full-name-admin-prefix';
    if (name.startsWith(`${upn} - admin`)) return 'upn-admin-prefix';
  }

  return 'none';
}

export function matchesCurrentUserIdentity(
  currentUser: AdminCurrentUser,
  e: AdminEntitlementCandidate,
): boolean {
  return classifyCurrentUserIdentityMatch(currentUser, e) !== 'none';
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

    // Phase 204E/204F — canonical identity is the live PlatformUser (Phase 115),
    // matched by cr664_email exactly as bootstrapFlow.ts does. We DO NOT require the
    // legacy _cr664_coreuser_value / losuserprofile chain (the live env does not
    // populate it), and (204F) we DO NOT require cr664_activestatus — a PlatformUser
    // that boots the app (row present, not explicitly Inactive/Disabled/Suspended)
    // is usable identity for the probe.
    const userRes = await Cr664_platformusersService.getAll({
      select: [
        'cr664_platformuserid',
        'cr664_email',
        'cr664_fullname',
        'cr664_activestatus',
        'cr664_identitystatus',
        'statecode',
        '_cr664_coreuser_value',
      ],
      filter: `cr664_email eq '${escapeOData(trimmed)}'`,
      top: 1,
    });
    if (!userRes.success) {
      return { kind: 'failed', message: userRes.error?.message ?? 'Failed to load platform user.' };
    }
    const user = userRes.data?.[0];
    // Phase 204F — align with bootstrapFlow.ts: do NOT require cr664_activestatus.
    // Fail closed only on explicit deactivation (Inactive statecode or
    // Disabled/Suspended identity status).
    if (!resolvePlatformUserUsableForAdminProbe(user)) return { kind: 'not-entitled' };

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

// ---------------------------------------------------------------------------
// Phase 204G — TEMPORARY read-only live admin-probe gate diagnostic
//
// Exposes the exact gate-by-gate outcome of the live admin probe so an operator
// can see which production value fails. READ-ONLY: no writes, no auth change, no
// access widening. The card is feature-flagged off-by-default in spirit (the flag
// below is the single on switch for this temporary phase) and renders sanitized
// values only — own UPN/full name (already shown in the app shell), counts, gate
// booleans; NO GUIDs and NO other users' identities.
// ---------------------------------------------------------------------------

/** Single on-switch for the temporary Phase 204G diagnostic card. */
export const ADMIN_ENTITLEMENT_DIAGNOSTIC_ENABLED = true;

export interface AdminEntitlementDiagnosticRow {
  readonly entitlementName: string;
  /** Sanitized raw cr664_accesslevel value (option-set number as text). */
  readonly accessLevelRaw: string;
  readonly accessLevelKind: AccessLevelKind;
  readonly active: boolean;
  readonly workspaceName: string;
  readonly losUserProfileName: string;
  readonly hasAdminName: boolean;
  readonly hasAdminWorkspace: boolean;
  readonly identityMatched: boolean;
  readonly identityMatchReason: AdminIdentityMatchReason;
  readonly finalEligible: boolean;
}

export interface AdminEntitlementDiagnostic {
  readonly platformUserFound: boolean;
  readonly platformUserUsable: boolean;
  readonly platformUserFullName: string;
  readonly platformUserEmail: string;
  readonly profileIdsCount: number;
  readonly entitlementQuerySuccess: boolean;
  readonly entitlementRowsReturned: number;
  readonly rows: ReadonlyArray<AdminEntitlementDiagnosticRow>;
  readonly finalResult: 'entitled' | 'not-entitled' | 'failed';
  readonly failureSummary: string;
}

export interface AdminEntitlementDiagnosticInput {
  readonly currentUser: AdminCurrentUser;
  readonly platformUserFound: boolean;
  readonly platformUserUsable: boolean;
  readonly entitlementQuerySuccess: boolean;
  readonly profileIdsCount: number;
  readonly entitlements: ReadonlyArray<AdminEntitlementCandidate>;
  readonly failureSummary?: string;
}

const REDACTED_OTHER = '«redacted-other-identity»';

/** Show a profile label only when it is the current user's own UPN; else redact. */
function sanitizeProfileLabel(label: string | undefined, upn: string): string {
  const v = (label ?? '').trim();
  if (v.length === 0) return '(blank)';
  return v.toLowerCase() === upn.trim().toLowerCase() ? v : REDACTED_OTHER;
}

/** Show an entitlement name only when the row attributes to the current user; else redact. */
function sanitizeEntitlementName(
  name: string | undefined,
  attributedToCurrentUser: boolean,
): string {
  const v = (name ?? '').trim();
  if (v.length === 0) return '(blank)';
  return attributedToCurrentUser ? v : REDACTED_OTHER;
}

/**
 * Phase 204G — PURE diagnostic builder. Recomputes each gate from the same pure
 * helpers the live probe uses, with identity fields SANITIZED so the card never
 * leaks GUIDs or other users' identities. Fully unit-testable without the SDK.
 */
export function buildAdminEntitlementDiagnostic(
  input: AdminEntitlementDiagnosticInput,
): AdminEntitlementDiagnostic {
  const upn = (input.currentUser.upn ?? '').trim();
  const rows: AdminEntitlementDiagnosticRow[] = input.entitlements.map((e) => {
    const accessLevelKind = resolveAccessLevelKind(e.accessLevel, e.accessLevelName);
    const hasAdminName = strictAdminEntitlementName(e.entitlementName);
    const hasAdminWorkspace = resolveWorkspaceRoute(e.workspaceName) === WORKSPACE_ROUTES.admin;
    const reason = classifyCurrentUserIdentityMatch(input.currentUser, e);
    const identityMatched = reason !== 'none';
    const finalEligible = entitlementMeetsAdminGates(e) && identityMatched;
    return {
      entitlementName: sanitizeEntitlementName(e.entitlementName, identityMatched),
      accessLevelRaw: e.accessLevel === undefined ? '(none)' : String(e.accessLevel),
      accessLevelKind,
      active: e.active === true,
      workspaceName: (e.workspaceName ?? '').trim() || '(blank)',
      losUserProfileName: sanitizeProfileLabel(e.losUserProfileName, upn),
      hasAdminName,
      hasAdminWorkspace,
      identityMatched,
      identityMatchReason: reason,
      finalEligible,
    };
  });

  let finalResult: AdminEntitlementDiagnostic['finalResult'];
  if (!input.entitlementQuerySuccess) {
    finalResult = 'failed';
  } else if (!input.platformUserFound || !input.platformUserUsable) {
    finalResult = 'not-entitled';
  } else {
    finalResult = rows.some((r) => r.finalEligible) ? 'entitled' : 'not-entitled';
  }

  return {
    platformUserFound: input.platformUserFound,
    platformUserUsable: input.platformUserUsable,
    // Own identity — already shown in the app shell; safe to surface here.
    platformUserFullName: (input.currentUser.fullName ?? '').trim() || '(unknown)',
    platformUserEmail: upn || '(none)',
    profileIdsCount: input.profileIdsCount,
    entitlementQuerySuccess: input.entitlementQuerySuccess,
    entitlementRowsReturned: input.entitlements.length,
    rows,
    finalResult,
    failureSummary: input.failureSummary ?? '',
  };
}

/**
 * Phase 204G — TEMPORARY live, read-only diagnostic loader. Runs the SAME query
 * path as `loadAdminWorkspaceEntitlement` and returns the sanitized gate detail.
 * Fail-closed and side-effect-free (no writes). The SDK-bound services load via
 * dynamic import so the static graph stays SDK-free.
 */
export async function loadAdminWorkspaceEntitlementDiagnostic(
  upn: string,
): Promise<AdminEntitlementDiagnostic> {
  const trimmed = (upn ?? '').trim();
  const emptyUser: AdminCurrentUser = { upn: trimmed };
  if (trimmed.length === 0) {
    return buildAdminEntitlementDiagnostic({
      currentUser: emptyUser,
      platformUserFound: false,
      platformUserUsable: false,
      entitlementQuerySuccess: true,
      profileIdsCount: 0,
      entitlements: [],
      failureSummary: 'No UPN in context.',
    });
  }
  try {
    const [{ Cr664_platformusersService }, { Cr664_losuserprofilesService }, { Cr664_workspaceentitlementsesService }] =
      await Promise.all([
        import('../generated/services/Cr664_platformusersService'),
        import('../generated/services/Cr664_losuserprofilesService'),
        import('../generated/services/Cr664_workspaceentitlementsesService'),
      ]);

    const userRes = await Cr664_platformusersService.getAll({
      select: [
        'cr664_platformuserid',
        'cr664_email',
        'cr664_fullname',
        'cr664_activestatus',
        'cr664_identitystatus',
        'statecode',
        '_cr664_coreuser_value',
      ],
      filter: `cr664_email eq '${escapeOData(trimmed)}'`,
      top: 1,
    });
    if (!userRes.success) {
      return buildAdminEntitlementDiagnostic({
        currentUser: emptyUser,
        platformUserFound: false,
        platformUserUsable: false,
        entitlementQuerySuccess: false,
        profileIdsCount: 0,
        entitlements: [],
        failureSummary: userRes.error?.message ?? 'Failed to load platform user.',
      });
    }
    const user = userRes.data?.[0];
    const platformUserFound = !!user;
    const platformUserUsable = resolvePlatformUserUsableForAdminProbe(user);
    const currentUser: AdminCurrentUser = {
      upn: trimmed,
      platformUserId: user?.cr664_platformuserid,
      fullName: user?.cr664_fullname,
      losUserProfileIds: [],
    };
    if (!platformUserFound || !platformUserUsable) {
      return buildAdminEntitlementDiagnostic({
        currentUser,
        platformUserFound,
        platformUserUsable,
        entitlementQuerySuccess: true,
        profileIdsCount: 0,
        entitlements: [],
        failureSummary: platformUserFound ? 'PlatformUser is explicitly deactivated.' : 'No PlatformUser row for UPN.',
      });
    }

    let profileIds: string[] = [];
    const coreUserId = user!._cr664_coreuser_value;
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
    const currentUserWithProfiles: AdminCurrentUser = { ...currentUser, losUserProfileIds: profileIds };

    const entRes = await Cr664_workspaceentitlementsesService.getAll({
      select: [
        'cr664_entitlementname',
        'cr664_accesslevel',
        'cr664_workspacename',
        '_cr664_losuserprofile_value',
        'cr664_losuserprofilename',
        'statecode',
      ],
      filter: 'statecode eq 0 and (cr664_accesslevel eq 788190002 or cr664_accesslevel eq 788190000)',
      top: 200,
    });
    if (!entRes.success) {
      return buildAdminEntitlementDiagnostic({
        currentUser: currentUserWithProfiles,
        platformUserFound,
        platformUserUsable,
        entitlementQuerySuccess: false,
        profileIdsCount: profileIds.length,
        entitlements: [],
        failureSummary: entRes.error?.message ?? 'Failed to load workspace entitlements.',
      });
    }
    const entitlements: AdminEntitlementCandidate[] = (entRes.data ?? []).map((r) => ({
      entitlementName: r.cr664_entitlementname,
      accessLevel: r.cr664_accesslevel,
      workspaceName: r.cr664_workspacename,
      losUserProfileId: r._cr664_losuserprofile_value,
      losUserProfileName: r.cr664_losuserprofilename,
      active: r.statecode === 0,
    }));
    return buildAdminEntitlementDiagnostic({
      currentUser: currentUserWithProfiles,
      platformUserFound,
      platformUserUsable,
      entitlementQuerySuccess: true,
      profileIdsCount: profileIds.length,
      entitlements,
    });
  } catch (err: unknown) {
    return buildAdminEntitlementDiagnostic({
      currentUser: emptyUser,
      platformUserFound: false,
      platformUserUsable: false,
      entitlementQuerySuccess: false,
      profileIdsCount: 0,
      entitlements: [],
      failureSummary: err instanceof Error ? err.message : String(err),
    });
  }
}

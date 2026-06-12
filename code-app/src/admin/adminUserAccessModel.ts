/**
 * Phase 169B -- User & Access Management model (preview-only).
 *
 * Investigation outcome: CASE B (read path exists; no safe governed
 * write path proven). See docs/PHASE_169B_ADMIN_USER_ACCESS_MANAGEMENT.md.
 *
 * Why Case B and not Case A, even though the generated SDK exposes
 * create()/update() for cr664_platformusers and
 * cr664_workspaceentitlementses:
 *
 *   1. Access is driven by `cr664_platformuser.cr664_PrimaryWorkspace`
 *      (Phase 115 single-workspace-per-user bootstrap), NOT by the
 *      cr664_workspaceentitlements table. Writing an entitlement record
 *      would therefore NOT grant a user access -- a misleading write.
 *   2. Creating a platform user requires a non-optional
 *      `cr664_PrimaryWorkspace@odata.bind` plus ownerid/owneridtype,
 *      cr664_identitystatus, and cr664_createdat -- a high-impact
 *      identity-provisioning operation the codebase deliberately routes
 *      through governed operator seed scripts (Phase 115 / 121), not the
 *      app runtime.
 *   3. No governed, audited app-level entitlement write adapter exists
 *      (every GOVERNED_WRITES entry today is deal/document/memo/activity).
 *
 * This module is therefore preview-only and side-effect-free. It builds
 * an honest plan of the app-level fields a FUTURE governed write would
 * set, with no Dataverse GUIDs, no network, and no record creation.
 */

/** Always-visible scope disclaimer (app-level vs platform security). */
export const USER_ACCESS_SCOPE_DISCLAIMER =
  'This manages LOS app-level entitlements only. It does not grant Microsoft tenant access or Dataverse security roles. Microsoft / Dataverse security roles must be managed in the Power Platform admin center.';

/** The exact blocker that keeps the grant action preview-only. */
export const USER_ACCESS_WRITE_BLOCKER =
  'No governed app-level entitlement write adapter exists yet. App access is driven by cr664_platformuser.cr664_PrimaryWorkspace (Phase 115), not the entitlements table, and creating a platform user requires a resolved PrimaryWorkspace bind plus identity fields that are provisioned through governed operator seed scripts (Phase 115 / 121). A live grant must wait for a dedicated, audited governed-write phase.';

/** Whether this phase enables a live app-level write. Always false. */
export const USER_ACCESS_LIVE_WRITE_ENABLED = false as const;

export interface GrantAccessPreviewInput {
  /** Target user email / UPN. */
  readonly email: string;
  /** Optional display name. */
  readonly fullName?: string;
  /** Workspace to grant (stable name, e.g. "Banker Workspace"). */
  readonly workspaceName: string;
  /** App-level access level. */
  readonly accessLevel: AdminAccessLevel;
}

export type AdminAccessLevel = 'Full' | 'ReadOnly' | 'Admin';

export const ADMIN_ACCESS_LEVELS: readonly AdminAccessLevel[] = Object.freeze([
  'Full',
  'ReadOnly',
  'Admin',
]);

/** A single app-level field a future governed write would set. */
export interface PlannedField {
  readonly label: string;
  readonly value: string;
}

export interface GrantAccessPreview {
  /** True only when the input is well-formed enough to preview. */
  readonly ok: boolean;
  /** Human-readable validation errors (blank/invalid input). */
  readonly errors: readonly string[];
  /** App-level fields a future governed write would set (no GUIDs). */
  readonly plannedFields: readonly PlannedField[];
  /**
   * Binds that a future governed write must resolve server-side from a
   * stable identifier (never a hardcoded GUID). Listed for transparency.
   */
  readonly requiresServerSideResolution: readonly string[];
  /** Always false in Phase 169B -- nothing is written. */
  readonly liveWriteEnabled: false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Build an honest, side-effect-free preview of the app-level grant. It
 * never writes, never resolves or emits a GUID, and only ever names the
 * allowed app-level fields. Blank email or workspace fails validation so
 * the UI cannot present an empty/meaningless grant.
 */
export function buildGrantAccessPreview(
  input: GrantAccessPreviewInput,
): GrantAccessPreview {
  const errors: string[] = [];
  const email = input.email.trim();
  const workspaceName = input.workspaceName.trim();
  const fullName = (input.fullName ?? '').trim();

  if (email.length === 0) {
    errors.push('Email / UPN is required.');
  } else if (!EMAIL_RE.test(email)) {
    errors.push('Email / UPN must be a valid email address.');
  }
  if (workspaceName.length === 0) {
    errors.push('Workspace to grant is required.');
  }
  if (!ADMIN_ACCESS_LEVELS.includes(input.accessLevel)) {
    errors.push('Access level must be one of: Full, ReadOnly, Admin.');
  }

  // Only allowed app-level fields. No GUIDs. Binds are described by the
  // stable identifier a future governed write would resolve, never a raw
  // record id.
  const plannedFields: PlannedField[] = [
    { label: 'cr664_email', value: email },
    { label: 'cr664_fullname', value: fullName || '(not provided)' },
    { label: 'cr664_entitlementname', value: entitlementName(workspaceName, input.accessLevel) },
    { label: 'cr664_accesslevel', value: input.accessLevel },
  ];

  return {
    ok: errors.length === 0,
    errors,
    plannedFields,
    requiresServerSideResolution: [
      `cr664_PrimaryWorkspace -> resolve "${workspaceName}" to a cr664_platformworkspace by stable name (no hardcoded GUID)`,
      `cr664_LOSUserProfile -> resolve "${email}" to a cr664_losuserprofile by email (no hardcoded GUID)`,
    ],
    liveWriteEnabled: USER_ACCESS_LIVE_WRITE_ENABLED,
  };
}

function entitlementName(workspaceName: string, level: AdminAccessLevel): string {
  return `${workspaceName} (${level})`;
}

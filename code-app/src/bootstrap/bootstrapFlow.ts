import { getContext } from '@microsoft/power-apps/app';
import { Cr664_platformusersService } from '../generated/services/Cr664_platformusersService';
import { Cr664_platformworkspacesService } from '../generated/services/Cr664_platformworkspacesService';
import { NotProvisionedError, UnresolvedWorkspaceError } from './errors';
import { resolveWorkspaceRoute } from './workspaceRoutes';

/**
 * Phase 115: identity entry point is `cr664_platformuser`, not the
 * legacy `cr664_user` table.
 *
 * History:
 *   The original chain (Phases 4 / 8 / 32) was:
 *     UPN
 *       → cr664_user           (by cr664_email)
 *       → cr664_losuserprofile (by _cr664_user_value)
 *       → cr664_workspaceentitlements (by _cr664_losuserprofile_value,
 *                                       picked the default)
 *       → cr664_platformworkspace
 *       → resolveWorkspaceRoute
 *
 *   In the deployed environment landed by Phase 113, three facts
 *   surfaced that broke that chain:
 *     1. `cr664_user` is empty — the bank's identity-seed workflow
 *        populated `cr664_platformuser` instead.
 *     2. `cr664_platformuser` carries the canonical fields
 *        (email, fullname, identity status, primary workspace FK,
 *        created/updated audit timestamps, provisioning source).
 *     3. `cr664_user.PrimaryWorkspace` cannot be set in the maker
 *        portal because that relationship's lookup target was never
 *        re-pointed at `cr664_platformworkspace` — manual creation
 *        of a `cr664_user` row is unsalvageable from the portal.
 *
 *   The model also confirms the pattern: `cr664_platformuser` has an
 *   optional `cr664_CoreUser@odata.bind` field pointing BACK to
 *   `cr664_user`, i.e. PlatformUser is the modern wrapper and
 *   CoreUser is the legacy thin record. The bootstrap reads the
 *   modern table; the legacy table is no longer in the resolution
 *   path.
 *
 * New chain:
 *     UPN
 *       → cr664_platformuser (by cr664_email)
 *       → _cr664_primaryworkspace_value
 *       → cr664_platformworkspace (by id)
 *       → resolveWorkspaceRoute
 *
 *   `cr664_losuserprofile` and `cr664_workspaceentitlements` are no
 *   longer queried by bootstrap. They remain in the generated SDK
 *   for any future phase that wants to surface a richer profile,
 *   but the live env doesn't populate them and PlatformUser has
 *   everything needed for first-launch routing.
 *
 * Fail-closed contract (unchanged):
 *   - No UPN in context  → NotProvisionedError.
 *   - No PlatformUser    → NotProvisionedError.
 *   - PlatformUser with no PrimaryWorkspace → UnresolvedWorkspaceError(undefined).
 *   - Workspace name not in `workspaceRoutes` → UnresolvedWorkspaceError(name).
 *   Every failure renders AuthGate's ErrorState. No default
 *   workspace, no fallback dashboard, no silent demotion.
 */

export interface BootstrapResult {
  upn: string;
  fullName: string;
  /** Entra Object ID for the authenticated user. Surfaced so admin
   *  writes can resolve to a Dataverse systemuserid. */
  entraObjectId: string | undefined;
  /** Phase 115: `cr664_platformuserid` of the row matched by UPN.
   *  Field name retained for backward compatibility with downstream
   *  consumers (AdminProvider, etc.); semantic is now "identity
   *  row id" — the PlatformUser id is the canonical identifier in
   *  the live environment. */
  profileId: string;
  /** Phase 115: `cr664_fullname` from the matched PlatformUser row.
   *  Pre-Phase-115 this came from the LOSUserProfile; PlatformUser
   *  is the canonical seeded surface and carries the display name
   *  directly. */
  profileName: string;
  /** Resolved cr664_PlatformWorkspace.id for the user's primary
   *  workspace. Surfaced so governed writes that need to stamp
   *  cr664_workspaceid (e.g. credit memo draft save) can read it
   *  without duplicating the lookup. */
  workspaceId: string;
  workspaceName: string;
  route: string;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

export async function runBootstrap(): Promise<BootstrapResult> {
  const ctx = await getContext();
  const upn = ctx.user.userPrincipalName;
  const fullName = ctx.user.fullName ?? upn ?? 'Unknown user';
  if (!upn) throw new NotProvisionedError('(no UPN in context)');

  const platformUsers = await Cr664_platformusersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });
  const platformUser = platformUsers.data?.[0];
  if (!platformUser) throw new NotProvisionedError(upn);

  const workspaceId = platformUser._cr664_primaryworkspace_value;
  if (!workspaceId) throw new UnresolvedWorkspaceError(undefined);

  const workspace = await Cr664_platformworkspacesService.get(workspaceId);
  const workspaceName = workspace.data?.cr664_workspacename;
  const route = resolveWorkspaceRoute(workspaceName);
  if (!route) throw new UnresolvedWorkspaceError(workspaceName);

  return {
    upn,
    fullName,
    entraObjectId: ctx.user.objectId,
    profileId: platformUser.cr664_platformuserid,
    profileName: platformUser.cr664_fullname,
    workspaceId,
    workspaceName: workspaceName ?? '',
    route,
  };
}

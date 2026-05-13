import { getContext } from '@microsoft/power-apps/app';
import { Cr664_usersService } from '../generated/services/Cr664_usersService';
import { Cr664_losuserprofilesService } from '../generated/services/Cr664_losuserprofilesService';
import { Cr664_workspaceentitlementsesService } from '../generated/services/Cr664_workspaceentitlementsesService';
import { Cr664_platformworkspacesService } from '../generated/services/Cr664_platformworkspacesService';
import { NotProvisionedError, UnresolvedWorkspaceError } from './errors';
import { resolveWorkspaceRoute } from './workspaceRoutes';

export interface BootstrapResult {
  upn: string;
  fullName: string;
  profileId: string;
  profileName: string;
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

  const users = await Cr664_usersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });
  const userId = users.data?.[0]?.cr664_userid;
  if (!userId) throw new NotProvisionedError(upn);

  const profiles = await Cr664_losuserprofilesService.getAll({
    filter: `_cr664_user_value eq ${userId}`,
    top: 1,
  });
  const profile = profiles.data?.[0];
  if (!profile) throw new NotProvisionedError(upn);

  const entitlements = await Cr664_workspaceentitlementsesService.getAll({
    filter: `_cr664_losuserprofile_value eq ${profile.cr664_losuserprofileid}`,
    orderBy: ['cr664_isdefault desc'],
  });

  const defaultEntitlement =
    entitlements.data?.find((e) => e.cr664_isdefault === true) ?? entitlements.data?.[0];
  const workspaceId =
    defaultEntitlement?._cr664_workspace_value ?? profile.cr664_primaryworkspace;
  if (!workspaceId) throw new UnresolvedWorkspaceError(undefined);

  const workspace = await Cr664_platformworkspacesService.get(workspaceId);
  const workspaceName = workspace.data?.cr664_workspacename;
  const route = resolveWorkspaceRoute(workspaceName);
  if (!route) throw new UnresolvedWorkspaceError(workspaceName);

  return {
    upn,
    fullName,
    profileId: profile.cr664_losuserprofileid,
    profileName: profile.cr664_profilename,
    workspaceName: workspaceName ?? '',
    route,
  };
}

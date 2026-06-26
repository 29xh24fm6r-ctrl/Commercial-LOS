/**
 * Phase 257 — governed read for workspace-entitlement management.
 *
 * Loads the real app-level users (id, name, email, current primary workspace
 * id, active flag) and the real workspace records (id + name) used as the
 * dropdown options for the governed primary-workspace change. Both reads are
 * least-privilege: only the lookup VALUE field (`_cr664_primaryworkspace_value`,
 * a GUID — not a formatted display name) is selected on the user, honouring the
 * safe-read contract that keeps formatted/display-name fields unselected.
 *
 * Read-only and SDK-free in its static graph (the data client + manifest load
 * via dynamic import, exactly as the other governed reads do).
 */

const USER_ROW_CAP = 200;
const WORKSPACE_ROW_CAP = 50;

export interface EntitlementUserRow {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  /** cr664_platformworkspaceid of the user's current primary workspace. */
  readonly currentWorkspaceId: string | undefined;
  readonly active: boolean;
}

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface WorkspaceEntitlementData {
  readonly users: readonly EntitlementUserRow[];
  readonly workspaces: readonly WorkspaceOption[];
}

interface RawUser {
  cr664_platformuserid?: string;
  cr664_fullname?: string;
  cr664_email?: string;
  cr664_activestatus?: boolean;
  _cr664_primaryworkspace_value?: string;
}

interface RawWorkspace {
  cr664_platformworkspaceid?: string;
  cr664_workspacename?: string;
  statecode?: number;
}

export async function loadWorkspaceEntitlementData(): Promise<WorkspaceEntitlementData> {
  const [{ Cr664_platformusersService }, { Cr664_platformworkspacesService }] = await Promise.all([
    import('../generated/services/Cr664_platformusersService'),
    import('../generated/services/Cr664_platformworkspacesService'),
  ]);

  const [usersRes, workspacesRes] = await Promise.all([
    Cr664_platformusersService.getAll({
      select: [
        'cr664_platformuserid',
        'cr664_fullname',
        'cr664_email',
        'cr664_activestatus',
        '_cr664_primaryworkspace_value',
      ],
      top: USER_ROW_CAP,
    }),
    Cr664_platformworkspacesService.getAll({
      select: ['cr664_platformworkspaceid', 'cr664_workspacename', 'statecode'],
      top: WORKSPACE_ROW_CAP,
    }),
  ]);

  if (!usersRes.success) {
    throw new Error(`platform-user read failed: ${usersRes.error?.message ?? 'non-success'}`);
  }
  if (!workspacesRes.success) {
    throw new Error(`workspace read failed: ${workspacesRes.error?.message ?? 'non-success'}`);
  }

  const users: EntitlementUserRow[] = (usersRes.data ?? []).map((r: RawUser) => ({
    id: r.cr664_platformuserid ?? '',
    fullName: r.cr664_fullname ?? '(unnamed)',
    email: r.cr664_email ?? '',
    currentWorkspaceId:
      typeof r._cr664_primaryworkspace_value === 'string' && r._cr664_primaryworkspace_value.length > 0
        ? r._cr664_primaryworkspace_value
        : undefined,
    active: r.cr664_activestatus === true,
  }));

  const workspaces: WorkspaceOption[] = (workspacesRes.data ?? [])
    .filter((w: RawWorkspace) => w.statecode === undefined || w.statecode === 0)
    .map((w: RawWorkspace) => ({
      id: w.cr664_platformworkspaceid ?? '',
      name: w.cr664_workspacename ?? '(unnamed workspace)',
    }))
    .filter((w) => w.id.length > 0);

  return { users, workspaces };
}

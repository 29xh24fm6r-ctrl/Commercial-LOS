/**
 * WF-1A — assignable users for the "Add Task" assignee picker.
 *
 * Loads enabled, interactive Dataverse `systemuser` rows so a banker can assign
 * a deal task to a teammate (cr664_AssignedTo is a systemuser lookup). The
 * acting banker is always self-assignable from BankerContext without this read;
 * this loader supplies the OTHER assignable users. Read-only; pure over an
 * injected reader (SDK-free static graph) + a live default. Fails closed
 * (throws) rather than fabricating a user list.
 */

const OPTION_CAP = 200;

/** A pickable assignee (a real Dataverse systemuser row). */
export interface AssignableUser {
  /** systemuserid — bound via cr664_AssignedTo@odata.bind. */
  readonly id: string;
  readonly name: string;
  readonly email: string | undefined;
}

interface RawSystemUser {
  systemuserid?: string;
  fullname?: string;
  internalemailaddress?: string;
  isdisabled?: boolean;
  applicationid?: string;
}

export const ASSIGNABLE_USER_SELECT: readonly string[] = [
  'systemuserid',
  'fullname',
  'internalemailaddress',
  'isdisabled',
  'applicationid',
];

/** Enabled, non-application (non-service) users only. */
export const ASSIGNABLE_USER_FILTER = 'isdisabled eq false and applicationid eq null';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Map one raw systemuser row → an assignee option (or null when unusable). */
export function mapAssignableUser(r: RawSystemUser): AssignableUser | null {
  const id = str(r.systemuserid);
  if (!id) return null;
  if (r.isdisabled === true) return null;
  if (str(r.applicationid)) return null;
  const email = str(r.internalemailaddress);
  return { id, name: str(r.fullname) ?? email ?? id, email };
}

export interface SystemUserReadResponse {
  readonly success: boolean;
  readonly data?: readonly RawSystemUser[] | null;
  readonly error?: { readonly message?: string } | null;
}

export type SystemUserReader = (select: readonly string[]) => Promise<SystemUserReadResponse>;

/** Pure loader. Fails closed: a non-success read throws (no fabricated list). */
export async function loadAssignableUsersWith(read: SystemUserReader): Promise<readonly AssignableUser[]> {
  const res = await read(ASSIGNABLE_USER_SELECT);
  if (!res.success) {
    throw new Error(`Assignable-users read failed: ${res.error?.message ?? 'non-success'}`);
  }
  return (res.data ?? [])
    .map(mapAssignableUser)
    .filter((o): o is AssignableUser => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Live loader — wires the generated SystemusersService via dynamic import. */
export function loadAssignableUsers(): Promise<readonly AssignableUser[]> {
  return loadAssignableUsersWith(async (select) => {
    const { SystemusersService } = await import('../generated/services/SystemusersService');
    const res = await SystemusersService.getAll({
      select: [...select],
      filter: ASSIGNABLE_USER_FILTER,
      orderBy: ['fullname'],
      top: OPTION_CAP,
    });
    return {
      success: res.success,
      data: res.data as readonly RawSystemUser[] | undefined,
      error: res.error,
    };
  });
}

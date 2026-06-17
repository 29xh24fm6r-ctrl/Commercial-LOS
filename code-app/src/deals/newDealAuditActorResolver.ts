/**
 * BUGFIX (banker create audit ChangedBy) -- fail-closed resolver mapping the
 * acting banker's email to a cr664_user row id for the audit's REQUIRED
 * cr664_ChangedBy lookup.
 *
 * Why this exists: cr664_auditevents.cr664_ChangedBy is a REQUIRED lookup that
 * targets the custom cr664_user table -- NOT systemuser. The live New Deal audit
 * POST proved it: with ONLY cr664_ChangedBy bound to /systemusers(<actor>) (no
 * cr664_ActorUser), Dataverse still rejected it as
 *   "Entity 'cr664_User' With Id = <actor systemuser id> Does Not Exist".
 * So a systemuser id can NEVER be bound into cr664_ChangedBy; a cr664_user row
 * id must be.
 *
 * cr664_users is NOT a registered runtime data source, so it cannot be read
 * directly. But the REGISTERED `cr664_platformusers` bridge table carries both
 * the actor's email (cr664_email / cr664_normalizedemail) AND a `cr664_CoreUser`
 * lookup whose value (`_cr664_coreuser_value`) is a cr664_user row id. An
 * @odata.bind only needs a valid id + entity-set path (validated Dataverse-side
 * at write time), so reading the bridge is sufficient to bind
 * `/cr664_users(<id>)` WITHOUT cr664_users being a registered data source.
 *
 * Fail-closed: a bind is returned ONLY for exactly one ACTIVE platform-user row
 * whose email matches the actor and that carries a CoreUser id. Zero matches,
 * multiple distinct CoreUser ids, an inactive row, a missing CoreUser link, a
 * missing actor email, or a read error all return `ok: false` with a clear,
 * id-free reason. The caller then records `audit_failed_partial` -- never a fake
 * success, and never a /systemusers id bound into the cr664_user lookup.
 *
 * The resolver NEVER writes, NEVER hardcodes a cr664_user GUID, and resolves
 * nothing on its own -- the bound id is always read live from the bridge.
 */

const PLATFORM_USERS_DATA_SOURCE = 'cr664_platformusers';

/** Least-privilege read: only the match keys + the CoreUser lookup value. */
const PLATFORM_USERS_SELECT = [
  'cr664_platformuserid',
  'cr664_email',
  'cr664_normalizedemail',
  'cr664_activestatus',
  'statecode',
  '_cr664_coreuser_value',
] as const;

/** Raw platform-user row as read from the bridge table. */
export interface RawPlatformUserRow {
  cr664_platformuserid?: string;
  cr664_email?: string;
  cr664_normalizedemail?: string;
  cr664_activestatus?: boolean;
  statecode?: number;
  /** The cr664_CoreUser lookup value -- a cr664_user row id. */
  _cr664_coreuser_value?: string;
  [key: string]: unknown;
}

/** Result of a least-privilege read of the platform-user bridge. */
export interface PlatformUserRetrieveResult {
  readonly success: boolean;
  readonly data?: readonly RawPlatformUserRow[];
  readonly error?: { readonly message?: string };
}

/** Injected read -- (dataSourceName, options) -> rows. */
export type PlatformUserRetrieve = (
  dataSourceName: string,
  options: { select: readonly string[]; filter?: string },
) => Promise<PlatformUserRetrieveResult>;

/** Outcome of resolving the actor's cr664_ChangedBy bind. */
export interface ActorChangedByResolution {
  readonly ok: boolean;
  /** `/cr664_users(<cr664_userid>)` when `ok`. */
  readonly changedByBind?: string;
  /** Fail-closed reason (no record ids / secrets) when not `ok`. */
  readonly reason?: string;
}

/** Resolve the actor's email to a cr664_ChangedBy bind value. */
export type ResolveActorChangedBy = (
  actorEmail: string | undefined,
) => Promise<ActorChangedByResolution>;

function normalizeEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function rowIsActive(row: RawPlatformUserRow): boolean {
  // Active = explicit active flag true AND (no statecode, or statecode Active=0).
  const flagOk = row.cr664_activestatus === true;
  const stateOk = row.statecode === undefined || row.statecode === 0;
  return flagOk && stateOk;
}

function rowCoreUserId(row: RawPlatformUserRow): string {
  const v = row._cr664_coreuser_value;
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Pure resolver over an injected `retrieve`. SDK-free, so the fail-closed
 * behaviour is fully unit-testable without the live data client.
 */
export function buildActorChangedByResolver(
  retrieve: PlatformUserRetrieve,
): ResolveActorChangedBy {
  return async (actorEmail) => {
    const norm = normalizeEmail(actorEmail);
    if (norm.length === 0) {
      return { ok: false, reason: 'no actor email available to resolve a cr664_user identity' };
    }

    let res: PlatformUserRetrieveResult;
    try {
      const literal = escapeODataLiteral(norm);
      res = await retrieve(PLATFORM_USERS_DATA_SOURCE, {
        select: PLATFORM_USERS_SELECT,
        // Coarse server-side narrow; the precise match is re-checked in memory
        // (handles a server that ignores $filter or an unpopulated normalized
        // column) so correctness never depends on the filter being honoured.
        filter: `cr664_normalizedemail eq '${literal}' or cr664_email eq '${literal}'`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `platform-user lookup threw: ${msg}` };
    }

    if (!res.success) {
      return {
        ok: false,
        reason: `platform-user lookup failed: ${res.error?.message ?? 'non-success'}`,
      };
    }

    const rows = res.data ?? [];
    const emailMatched = rows.filter(
      (r) =>
        normalizeEmail(r.cr664_normalizedemail) === norm ||
        normalizeEmail(r.cr664_email) === norm,
    );
    if (emailMatched.length === 0) {
      return { ok: false, reason: 'no platform-user identity matched the actor email' };
    }

    const usable = emailMatched.filter((r) => rowIsActive(r) && rowCoreUserId(r).length > 0);
    if (usable.length === 0) {
      const noCore = emailMatched.some((r) => rowCoreUserId(r).length === 0);
      const inactive = emailMatched.some((r) => !rowIsActive(r));
      const reason = noCore
        ? 'matched platform-user has no linked cr664_user (CoreUser is empty)'
        : inactive
          ? 'matched platform-user is inactive'
          : 'matched platform-user is not usable for the audit actor';
      return { ok: false, reason };
    }

    const distinctCoreIds = Array.from(new Set(usable.map(rowCoreUserId)));
    if (distinctCoreIds.length > 1) {
      return {
        ok: false,
        reason: `multiple distinct cr664_user identities matched the actor (${distinctCoreIds.length})`,
      };
    }

    return { ok: true, changedByBind: `/cr664_users(${distinctCoreIds[0]})` };
  };
}

/**
 * Live `retrieve` over the Power Apps data client (by data-source name). The SDK
 * + gitignored data-source manifest load via dynamic import so this module's
 * static graph stays SDK-free (importing the resolver never pulls the SDK; only
 * a real read does).
 */
function liveRetrieve(): PlatformUserRetrieve {
  return async (dataSourceName, options) => {
    const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
      import('@microsoft/power-apps/data'),
      import('../../.power/schemas/appschemas/dataSourcesInfo'),
    ]);
    const client = getClient(dataSourcesInfo);
    const res = await client.retrieveMultipleRecordsAsync<RawPlatformUserRow>(dataSourceName, {
      select: options.select as string[],
      filter: options.filter,
    });
    return { success: res.success, data: res.data ?? undefined, error: res.error ?? undefined };
  };
}

/** The live resolver used by the governed audit emit. */
export function createActorChangedByResolver(): ResolveActorChangedBy {
  return buildActorChangedByResolver(liveRetrieve());
}

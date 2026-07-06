/**
 * PM-1 (Portfolio Manager Assignment) — assignable-user options for the manual
 * boarding form's portfolio-manager picker.
 *
 * Portfolio manager is a real Dataverse `systemuser` lookup
 * (cr664_PortfolioManager), NOT free text. This loader surfaces the pickable
 * users so the boarding form can capture a manager's `systemuserid` and bind it
 * through `cr664_PortfolioManager@odata.bind` (see existingLoanEntryAdapter.ts).
 *
 * Read-only; pure over an injected reader (SDK-free static graph) + a live
 * loader that wires the generated SystemusersService via dynamic import. No
 * fabrication: if the read fails, the caller shows an honest "could not load
 * managers" state and boards without a manager rather than inventing one.
 */

const OPTION_CAP = 200;

/** A pickable portfolio-manager user (a real Dataverse systemuser row). */
export interface PortfolioManagerOption {
  /** systemuserid — the value bound through cr664_PortfolioManager@odata.bind. */
  readonly id: string;
  /** Display name for the picker (fullname, falling back to email, then the id). */
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

/**
 * Columns for the picker. `applicationid` and `isdisabled` are selected so we
 * can defensively drop service/app/disabled users even if the environment
 * ignores the server-side `$filter`.
 */
export const PORTFOLIO_MANAGER_SELECT: readonly string[] = [
  'systemuserid',
  'fullname',
  'internalemailaddress',
  'isdisabled',
  'applicationid',
];

/**
 * Only real, enabled, interactive users are assignable: exclude disabled users
 * and application (service-principal) users. The operator picks the right
 * person from the resulting list.
 */
export const PORTFOLIO_MANAGER_FILTER = 'isdisabled eq false and applicationid eq null';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** Map one raw systemuser row → a picker option (or null when unusable). */
export function mapPortfolioManagerOption(r: RawSystemUser): PortfolioManagerOption | null {
  const id = str(r.systemuserid);
  if (!id) return null;
  // Belt-and-suspenders: never surface disabled or application users even if the
  // server-side filter was not honored.
  if (r.isdisabled === true) return null;
  if (str(r.applicationid)) return null;
  const email = str(r.internalemailaddress);
  return { id, name: str(r.fullname) ?? email ?? id, email };
}

/** Minimal shape of a systemusers read response (subset of IOperationResult). */
export interface SystemUserReadResponse {
  readonly success: boolean;
  readonly data?: readonly RawSystemUser[] | null;
  readonly error?: { readonly message?: string } | null;
}

/** Reader injected for testability: given a `$select`, returns the raw response. */
export type SystemUserReader = (select: readonly string[]) => Promise<SystemUserReadResponse>;

/**
 * Load assignable portfolio-manager options. Pure over `read`. Fails closed:
 * throws on a non-success read (the caller renders an honest error and lets the
 * operator board without a manager) rather than returning a fabricated list.
 */
export async function loadPortfolioManagerOptionsWith(
  read: SystemUserReader,
): Promise<readonly PortfolioManagerOption[]> {
  const res = await read(PORTFOLIO_MANAGER_SELECT);
  if (!res.success) {
    throw new Error(`Portfolio-manager options read failed: ${res.error?.message ?? 'non-success'}`);
  }
  return (res.data ?? [])
    .map(mapPortfolioManagerOption)
    .filter((o): o is PortfolioManagerOption => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Live loader — wires the generated SystemusersService via dynamic import. */
export function loadPortfolioManagerOptions(): Promise<readonly PortfolioManagerOption[]> {
  return loadPortfolioManagerOptionsWith(async (select) => {
    const { SystemusersService } = await import('../generated/services/SystemusersService');
    const res = await SystemusersService.getAll({
      select: [...select],
      filter: PORTFOLIO_MANAGER_FILTER,
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

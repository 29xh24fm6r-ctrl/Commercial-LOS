/**
 * Search-and-select options for linking a canonical CRM entity to a deal.
 *
 * Reads EXISTING Dataverse records the banker can choose from — it never
 * creates anything:
 *   - client relationships (cr664_clientrelationships) for the Deal → Client
 *     lookup, and
 *   - teams (cr664_teams) for the Deal → Team lookup.
 *
 * SDK-free static graph: the generated services are pulled in via dynamic
 * import inside each live loader (mirrors `buildLiveCrmWriteDeps`). Callers /
 * tests can inject a fake `() => Promise<CrmLinkOption[]>` instead.
 */

/** One selectable existing CRM record. */
export interface CrmLinkOption {
  /** GUID bound into the deal lookup. */
  readonly id: string;
  readonly name: string;
  /** Secondary line (e.g. borrower type · industry, or team description). */
  readonly sublabel?: string;
  /** statecode Active(0). Inactive rows are shown but flagged. */
  readonly active: boolean;
}

const OPTION_CAP = 200;

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Read a Dataverse formatted-value annotation off a raw record. */
function formattedValue(raw: Record<string, unknown>, attr: string): string | undefined {
  const v = raw[`${attr}@OData.Community.Display.V1.FormattedValue`];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Existing canonical client relationships (cr664_clientrelationships), the
 * target of the deal's cr664_Client lookup. Active rows first, then by name.
 */
export async function loadClientRelationshipOptions(): Promise<CrmLinkOption[]> {
  const { Cr664_clientrelationshipsService: s } = await import(
    '../generated/services/Cr664_clientrelationshipsService'
  );
  const r = await s.getAll({ orderBy: ['cr664_clientname asc'], top: OPTION_CAP });
  if (!r.success) {
    throw new Error(r.error?.message ?? 'Failed to load CRM client relationships.');
  }
  return (r.data ?? []).map((c): CrmLinkOption => {
    const raw = c as unknown as Record<string, unknown>;
    const borrowerType = firstString(
      formattedValue(raw, 'cr664_borrowertype'),
      c.cr664_borrowertypename,
    );
    const sublabel = [borrowerType, firstString(c.cr664_industry)]
      .filter((p): p is string => !!p)
      .join(' · ');
    return {
      id: c.cr664_clientrelationshipid,
      name: firstString(c.cr664_clientname) ?? '(unnamed client)',
      sublabel: sublabel.length > 0 ? sublabel : undefined,
      active: c.statecode === 0,
    };
  });
}

/**
 * Existing teams (cr664_teams), the target of the deal's cr664_Team lookup.
 */
export async function loadTeamOptions(): Promise<CrmLinkOption[]> {
  const { Cr664_teamsService: s } = await import(
    '../generated/services/Cr664_teamsService'
  );
  const r = await s.getAll({ orderBy: ['cr664_teamname asc'], top: OPTION_CAP });
  if (!r.success) {
    throw new Error(r.error?.message ?? 'Failed to load teams.');
  }
  return (r.data ?? []).map((t): CrmLinkOption => ({
    id: t.cr664_teamid,
    name: firstString(t.cr664_teamname) ?? '(unnamed team)',
    sublabel: firstString(t.cr664_description),
    active: t.statecode === 0,
  }));
}

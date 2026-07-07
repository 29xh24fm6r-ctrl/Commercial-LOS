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

import { isDealLinkableOrgType } from './orgClientBridgeEligibility';

/** One selectable existing CRM record. */
export interface CrmLinkOption {
  /** GUID bound into the deal lookup. For an `organization` option this is the
   *  cr664_crmorganization id (the governed bridge resolves it to a client). */
  readonly id: string;
  readonly name: string;
  /** Secondary line (e.g. borrower type · industry, or team description). */
  readonly sublabel?: string;
  /** statecode Active(0). Inactive rows are shown but flagged. */
  readonly active: boolean;
  /**
   * Where this option resolves to. `clientrelationship` (default) links the
   * deal directly. `organization` is a CRM Hub company with NO client mirror
   * yet — selecting it runs the governed bridge to create/find the canonical
   * client, then links the deal to that client.
   */
  readonly sourceKind?: 'clientrelationship' | 'organization';
  /** For `organization` options: fields the governed bridge needs. */
  readonly organizationType?: string;
  readonly website?: string;
  readonly taxIdPresent?: boolean;
}

/** Clear label for a CRM-company option in the Link CRM client modal. */
export const CRM_COMPANY_OPTION_SUBLABEL = 'CRM Company — will create/link borrower client record';

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
 * Eligible CRM Hub companies (cr664_crmorganizations of a Borrower/Client type)
 * that a banker can pick to link. These are NOT yet client relationships — a
 * governed bridge mirrors the selected one into cr664_clientrelationships before
 * the deal is linked. Contacts / non-borrower companies are excluded here so
 * they never appear as deal-linkable clients.
 */
export async function loadDealLinkableOrganizationOptions(): Promise<CrmLinkOption[]> {
  const { Cr664_crmorganizationsService: s } = await import(
    '../generated/services/Cr664_crmorganizationsService'
  );
  const r = await s.getAll({ orderBy: ['cr664_name asc'], top: OPTION_CAP });
  if (!r.success) {
    throw new Error(r.error?.message ?? 'Failed to load CRM companies.');
  }
  return (r.data ?? [])
    .filter((o) => isDealLinkableOrgType(o.cr664_organizationtype))
    .map((o): CrmLinkOption => ({
      id: o.cr664_crmorganizationid,
      name: firstString(o.cr664_name, o.cr664_displayname) ?? '(unnamed company)',
      sublabel: CRM_COMPANY_OPTION_SUBLABEL,
      active: o.statecode === 0,
      sourceKind: 'organization',
      organizationType: firstString(o.cr664_organizationtype),
      website: firstString(o.cr664_website),
      taxIdPresent: o.cr664_taxidpresent === true,
    }));
}

/**
 * The full set of options for the Link CRM client modal:
 *   1. existing cr664_clientrelationships (link directly), then
 *   2. eligible CRM Hub companies that do NOT yet have a client relationship
 *      bridge (selecting one runs the governed bridge, then links the client).
 *
 * A company is considered already-bridged when a client relationship shares its
 * name (exact, case-insensitive) — so OmniCare 365 appears once: as its client
 * relationship if bridged, otherwise as the linkable CRM company.
 */
export async function loadClientLinkTargetOptions(): Promise<CrmLinkOption[]> {
  const [clients, orgs] = await Promise.all([
    loadClientRelationshipOptions(),
    loadDealLinkableOrganizationOptions().catch(() => [] as CrmLinkOption[]),
  ]);
  const bridgedNames = new Set(clients.map((c) => c.name.trim().toLowerCase()));
  const unbridgedOrgs = orgs.filter((o) => !bridgedNames.has(o.name.trim().toLowerCase()));
  return [...clients, ...unbridgedOrgs];
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

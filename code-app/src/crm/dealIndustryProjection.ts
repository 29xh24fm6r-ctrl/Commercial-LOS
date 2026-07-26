/**
 * Phase 4B — Deal Industry projection from the linked CRM organization's NAICS.
 *
 * Resolves, for a deal, the industry implied by its CRM client:
 *   deal → cr664_Client (client relationship) → cr664_Organization (CRM org) →
 *   cr664_naicscode → NAICS sector → mapped deal industry (cr664_naicsindustrymap).
 *
 * Every hop is a GOVERNED read: only the client-relationship→organization link
 * drives Industry (never a contact-only record, an unbridged org, or free text).
 * Any missing hop is an honest state (`no-org-link`, `no-naics`, `no-sector`,
 * `no-mapping`) — never a fabricated industry. A failed read is `unavailable`.
 *
 * Pure over injected deps (SDK-free static graph); a live factory wires the reads
 * via dynamic import. The mapping table is read through the generic data client
 * by data-source name (its generated service does not exist until the maker adds
 * the table + regenerates — until then this reads `unavailable`, honestly).
 */

import {
  resolveDealIndustryFromNaics,
  type NaicsIndustryMapRow,
} from './naics/naicsIndustryMap';

export type DealIndustryProjection =
  | { kind: 'no-crm-link' }
  | { kind: 'no-org-link' }
  // organizationId is carried once the CRM org is resolved, so a deal-side remediation can open the
  // governed CRM NAICS editor for exactly that company.
  | { kind: 'no-naics'; organizationId: string }
  // N-22/N-23 remediation (Production Remediation Factory Arc Phase 7) — naicsTitle is the EXACT
  // reference-table title for this code (e.g. "Full-Service Restaurants"), looked up separately from
  // the sector title. Undefined when the reference table isn't provisioned or the lookup fails —
  // never fabricated; the code/sector facts below are unaffected by a missing title.
  | { kind: 'no-sector'; organizationId: string; naicsCode: string; naicsTitle?: string }
  | { kind: 'no-mapping'; organizationId: string; naicsCode: string; naicsTitle?: string; sectorCode: string; sectorTitle: string }
  | { kind: 'derived'; organizationId: string; naicsCode: string; naicsTitle?: string; sectorCode: string; sectorTitle: string; dealIndustry: string }
  | { kind: 'unavailable'; reason: string };

export interface DealIndustryProjectionDeps {
  /** Read the client relationship's linked CRM organization id (or none). */
  readonly readClientOrganizationId: (
    clientRelationshipId: string,
  ) => Promise<{ success: boolean; organizationId?: string; error?: string }>;
  /** Read the CRM organization's NAICS code (or none). */
  readonly readOrganizationNaics: (
    organizationId: string,
  ) => Promise<{ success: boolean; naicsCode?: string; error?: string }>;
  /** Read the active NAICS→industry mapping rows. */
  readonly fetchMappingRows: () => Promise<{ success: boolean; rows?: readonly NaicsIndustryMapRow[]; error?: string }>;
  /**
   * N-22/N-23 remediation — the EXACT reference-table title for a 6-digit NAICS code (distinct from
   * the sector title). Best-effort: a failed/unavailable lookup returns `undefined`, never a
   * fabricated title, and never blocks the rest of the projection.
   */
  readonly readNaicsTitle: (naicsCode: string) => Promise<string | undefined>;
}

const UNAVAILABLE_REASON =
  'The CRM/NAICS industry derivation could not be loaded. The client→organization link or the ' +
  'cr664_naicsindustrymap datasource may not be deployed yet (see docs/DEAL_INDUSTRY_CRM_NAICS_SETUP.md).';

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

function unavailable(detail: string): DealIndustryProjection {
  return { kind: 'unavailable', reason: `${UNAVAILABLE_REASON}${detail ? ` (${detail})` : ''}` };
}

/**
 * Resolve the CRM/NAICS-derived industry for a deal's client relationship. Pure
 * given its injected reads.
 */
export async function loadDealIndustryProjection(
  clientRelationshipId: string | undefined,
  deps: DealIndustryProjectionDeps,
): Promise<DealIndustryProjection> {
  const clientId = trimmed(clientRelationshipId);
  if (clientId.length === 0) return { kind: 'no-crm-link' };

  // 1. client relationship → organization id.
  let orgRes: { success: boolean; organizationId?: string; error?: string };
  try {
    orgRes = await deps.readClientOrganizationId(clientId);
  } catch (err: unknown) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }
  if (!orgRes.success) return unavailable(orgRes.error ?? 'client read failed');
  const organizationId = trimmed(orgRes.organizationId);
  if (organizationId.length === 0) return { kind: 'no-org-link' };

  // 2. organization → NAICS code.
  let naicsRes: { success: boolean; naicsCode?: string; error?: string };
  try {
    naicsRes = await deps.readOrganizationNaics(organizationId);
  } catch (err: unknown) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }
  if (!naicsRes.success) return unavailable(naicsRes.error ?? 'organization read failed');
  const naicsCode = trimmed(naicsRes.naicsCode);
  if (naicsCode.length === 0) return { kind: 'no-naics', organizationId };

  // 3. mapping rows → resolve sector → industry.
  let mapRes: { success: boolean; rows?: readonly NaicsIndustryMapRow[]; error?: string };
  try {
    mapRes = await deps.fetchMappingRows();
  } catch (err: unknown) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }
  if (!mapRes.success) return unavailable(mapRes.error ?? 'mapping read failed');

  // Best-effort exact-title lookup — never blocks or fails the projection; a lookup failure simply
  // means the title is omitted (undefined), same "never fabricate" discipline as everything above.
  let naicsTitle: string | undefined;
  try {
    naicsTitle = await deps.readNaicsTitle(naicsCode);
  } catch {
    naicsTitle = undefined;
  }

  const resolution = resolveDealIndustryFromNaics(naicsCode, mapRes.rows ?? []);
  switch (resolution.kind) {
    case 'no-sector':
      return { kind: 'no-sector', organizationId, naicsCode: resolution.naicsCode, naicsTitle };
    case 'no-mapping':
      return { kind: 'no-mapping', organizationId, naicsCode, naicsTitle, sectorCode: resolution.sector.sectorCode, sectorTitle: resolution.sector.sectorTitle };
    case 'mapped':
      return {
        kind: 'derived',
        organizationId,
        naicsCode,
        naicsTitle,
        sectorCode: resolution.sector.sectorCode,
        sectorTitle: resolution.sector.sectorTitle,
        dealIndustry: resolution.dealIndustry,
      };
  }
}

// ---------------------------------------------------------------------------
// Live dependency factory (dynamic imports keep the SDK out of the static graph)
// ---------------------------------------------------------------------------

export function buildLiveDealIndustryProjectionDeps(): DealIndustryProjectionDeps {
  return {
    readClientOrganizationId: async (clientRelationshipId) => {
      try {
        const { Cr664_clientrelationshipsService: s } = await import(
          '../generated/services/Cr664_clientrelationshipsService'
        );
        // _cr664_organization_value exists only after the maker adds the lookup;
        // pre-schema this read errors and we surface `unavailable` honestly.
        const r = await s.get(clientRelationshipId, { select: ['_cr664_organization_value'] });
        return {
          success: r.success,
          organizationId: (r.data as { _cr664_organization_value?: string } | undefined)?._cr664_organization_value,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    readOrganizationNaics: async (organizationId) => {
      try {
        const { Cr664_crmorganizationsService: s } = await import(
          '../generated/services/Cr664_crmorganizationsService'
        );
        const r = await s.get(organizationId, { select: ['cr664_naicscode'] });
        return {
          success: r.success,
          naicsCode: (r.data as { cr664_naicscode?: string } | undefined)?.cr664_naicscode,
          error: r.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    readNaicsTitle: async (naicsCode) => {
      try {
        const { findNaicsByCode } = await import('./naics/naicsSearch');
        const row = await findNaicsByCode(naicsCode);
        return row?.cr664_title;
      } catch {
        return undefined;
      }
    },
    fetchMappingRows: async () => {
      try {
        // Factory Arc Phase 8 — cr664_naicsindustrymaps now has a real generated service (the
        // generic-data-client workaround this replaced predates that regeneration).
        const { Cr664_naicsindustrymapsService } = await import(
          '../generated/services/Cr664_naicsindustrymapsService'
        );
        const res = await Cr664_naicsindustrymapsService.getAll({
          select: ['cr664_sectorcode', 'cr664_dealindustry', 'cr664_activeflag'],
          top: 200,
        });
        return {
          success: res.success,
          rows: (res.data ?? []).map((r) => ({
            sectorCode: r.cr664_sectorcode,
            dealIndustry: r.cr664_dealindustry,
            active: r.cr664_activeflag !== false,
          })),
          error: res.error?.message ?? undefined,
        };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function loadLiveDealIndustryProjection(
  clientRelationshipId: string | undefined,
): Promise<DealIndustryProjection> {
  return loadDealIndustryProjection(clientRelationshipId, buildLiveDealIndustryProjectionDeps());
}

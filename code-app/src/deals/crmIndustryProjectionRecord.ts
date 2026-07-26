import type { DealIndustryProjection } from '../crm/dealIndustryProjection';
import type { DealIndustrySource } from './dealIndustryHydration';

/**
 * N-22/N-23 remediation (Production Remediation Factory Arc Phase 7) — a durable, deal-scoped
 * record of the EXACT CRM-derived industry facts, persisted SEPARATELY from the deal's coarse
 * six-value `cr664_industry` choice column.
 *
 * The audit found two related gaps: (N-22) the exact NAICS code/title, sector, source CRM record,
 * and a last-verified timestamp were never persisted anywhere — only the coarse label was, and only
 * when it happened to map; (N-23) the six-value choice list cannot represent every real CRM
 * industry (e.g. NAICS 722511 / Full-Service Restaurants, sector 72, has no seeded mapping), so a
 * deal in an unmapped sector had NO durable industry fact at all, coarse or exact.
 *
 * This record closes both: it is built and persisted whenever the linked CRM organization has ANY
 * NAICS code — `derived`, `no-sector`, or `no-mapping` projections all carry one — independent of
 * whether that code happens to map to one of the six coarse labels. `dealIndustryApplied` records
 * the coarse label only when the projection actually resolved to one; it is '' otherwise. Nothing
 * here expands or replaces the six-value choice list itself (a maker/admin decision, N-23's other
 * two options) — it persists the exact facts as a parallel source of truth per N-23's third,
 * evidence-backed option.
 */
export interface CrmIndustryProjectionRecord {
  readonly organizationId: string;
  readonly naicsCode: string;
  /** The exact NAICS reference-table title (e.g. "Full-Service Restaurants"). '' if unavailable. */
  readonly naicsTitle: string;
  /** '' when the projection stopped at `no-sector` (an invalid/unclassifiable code). */
  readonly sectorCode: string;
  readonly sectorTitle: string;
  /** The coarse `cr664_industry` label this projection resolved to. '' when no mapping exists. */
  readonly dealIndustryApplied: string;
  readonly source: DealIndustrySource;
  readonly lastVerifiedAtIso: string;
}

export const EMPTY_CRM_INDUSTRY_PROJECTION_RECORD: CrmIndustryProjectionRecord = {
  organizationId: '',
  naicsCode: '',
  naicsTitle: '',
  sectorCode: '',
  sectorTitle: '',
  dealIndustryApplied: '',
  source: 'none',
  lastVerifiedAtIso: '',
};

const SOURCES: readonly DealIndustrySource[] = ['crm-derived', 'manual', 'none'];

export function serializeCrmIndustryProjectionRecord(record: CrmIndustryProjectionRecord): string {
  return JSON.stringify(record);
}

/** Fail-closed parse: missing, corrupt, or wrong-shaped JSON returns the empty record. */
export function parseCrmIndustryProjectionRecord(json: string | undefined): CrmIndustryProjectionRecord {
  if (!json || json.trim().length === 0) return EMPTY_CRM_INDUSTRY_PROJECTION_RECORD;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return EMPTY_CRM_INDUSTRY_PROJECTION_RECORD;
    const p = parsed as Partial<CrmIndustryProjectionRecord>;
    return {
      organizationId: typeof p.organizationId === 'string' ? p.organizationId : '',
      naicsCode: typeof p.naicsCode === 'string' ? p.naicsCode : '',
      naicsTitle: typeof p.naicsTitle === 'string' ? p.naicsTitle : '',
      sectorCode: typeof p.sectorCode === 'string' ? p.sectorCode : '',
      sectorTitle: typeof p.sectorTitle === 'string' ? p.sectorTitle : '',
      dealIndustryApplied: typeof p.dealIndustryApplied === 'string' ? p.dealIndustryApplied : '',
      source: SOURCES.includes(p.source as DealIndustrySource) ? (p.source as DealIndustrySource) : 'none',
      lastVerifiedAtIso: typeof p.lastVerifiedAtIso === 'string' ? p.lastVerifiedAtIso : '',
    };
  } catch {
    return EMPTY_CRM_INDUSTRY_PROJECTION_RECORD;
  }
}

/**
 * Build the durable record from a projection, IF it carries a NAICS fact worth recording. Returns
 * `undefined` for `no-naics` / `no-org-link` / `no-crm-link` / `unavailable` — there is no exact
 * fact to persist in those cases, so nothing is written (never a fabricated placeholder record).
 */
export function buildCrmIndustryProjectionRecord(
  projection: DealIndustryProjection,
  source: DealIndustrySource,
  nowIso: string,
): CrmIndustryProjectionRecord | undefined {
  switch (projection.kind) {
    case 'no-sector':
      return {
        organizationId: projection.organizationId,
        naicsCode: projection.naicsCode,
        naicsTitle: projection.naicsTitle ?? '',
        sectorCode: '',
        sectorTitle: '',
        dealIndustryApplied: '',
        source,
        lastVerifiedAtIso: nowIso,
      };
    case 'no-mapping':
      return {
        organizationId: projection.organizationId,
        naicsCode: projection.naicsCode,
        naicsTitle: projection.naicsTitle ?? '',
        sectorCode: projection.sectorCode,
        sectorTitle: projection.sectorTitle,
        dealIndustryApplied: '',
        source,
        lastVerifiedAtIso: nowIso,
      };
    case 'derived':
      return {
        organizationId: projection.organizationId,
        naicsCode: projection.naicsCode,
        naicsTitle: projection.naicsTitle ?? '',
        sectorCode: projection.sectorCode,
        sectorTitle: projection.sectorTitle,
        dealIndustryApplied: projection.dealIndustry,
        source,
        lastVerifiedAtIso: nowIso,
      };
    case 'no-naics':
    case 'no-org-link':
    case 'no-crm-link':
    case 'unavailable':
      return undefined;
  }
}

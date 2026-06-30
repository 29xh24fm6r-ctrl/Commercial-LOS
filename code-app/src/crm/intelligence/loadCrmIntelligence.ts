import { deriveAdvisorLinks, type AdvisorLink, type RelationshipRow } from '../advisors/advisorViewModel';
import type { ConcentrationCompany } from '../naics/concentrationViewModel';

/**
 * CRM Intelligence read (Phase 5) — READ-ONLY, fail-closed.
 *
 * Reads companies (for NAICS concentration) + advisor relationships (for the
 * advisor payoff views) via the generated CRM services. Uses guarded dynamic
 * imports so a missing/ungenerated service degrades to an honest `unavailable`
 * rather than throwing. No writes; no fabricated rows.
 */

export interface CrmIntelligenceData {
  readonly companies: readonly ConcentrationCompany[];
  readonly advisorLinks: readonly AdvisorLink[];
}

export type CrmIntelligenceLoadResult =
  | { readonly status: 'ready'; readonly data: CrmIntelligenceData }
  | { readonly status: 'unavailable'; readonly reason: string };

export type CrmIntelligenceLoader = () => Promise<CrmIntelligenceLoadResult>;

interface OrgRow {
  readonly cr664_naicscode?: string | null;
}

async function importService<T>(name: string): Promise<T | null> {
  try {
    const modPath = ['..', '..', 'generated', 'services', name].join('/');
    const mod = (await import(/* @vite-ignore */ modPath)) as Record<string, T>;
    return mod[name] ?? null;
  } catch {
    return null;
  }
}

export const loadCrmIntelligenceLive: CrmIntelligenceLoader = async () => {
  try {
    const orgService = await importService<{ getAll: (o?: unknown) => Promise<{ data?: OrgRow[] }> }>(
      'Cr664_crmorganizationsService',
    );
    const relService = await importService<{ getAll: (o?: unknown) => Promise<{ data?: RelationshipRow[] }> }>(
      'Cr664_crmrelationshipsService',
    );
    if (!orgService || !relService) {
      return { status: 'unavailable', reason: 'CRM services are not available in this environment yet.' };
    }
    const [orgs, rels] = await Promise.all([orgService.getAll({ top: 500 }), relService.getAll({ top: 500 })]);
    const companies: ConcentrationCompany[] = (orgs.data ?? []).map((o) => ({
      naicsCode: o.cr664_naicscode ?? undefined,
    }));
    const advisorLinks = deriveAdvisorLinks(rels.data ?? []);
    return { status: 'ready', data: { companies, advisorLinks } };
  } catch {
    return { status: 'unavailable', reason: 'CRM intelligence could not be loaded right now.' };
  }
};

import { deriveDealIndustryHydration, type DealIndustryHydration } from './dealIndustryHydration';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

/**
 * Orchestrates deal-Industry hydration from the linked CRM client (PURE over injected deps).
 *
 * Runs after a CRM client is linked OR the CRM NAICS changes: load the projection, decide via
 * deriveDealIndustryHydration, and — when a CRM NAICS provides a governed classification and the
 * deal has no manual Industry — persist it through the GOVERNED deal-profile write (validate → write
 * → readback → audit), returning the verified patch to merge into the cockpit (no reload).
 *
 * It never fabricates or overwrites: the write happens only when `industryToApply` is present (which
 * the pure decision sets only for a valid CRM NAICS AND no existing manual value).
 */

export interface HydrateDealIndustryDeps {
  /** Load the CRM/NAICS projection for the deal's linked client relationship. */
  readonly loadProjection: (clientRelationshipId: string | undefined) => Promise<DealIndustryProjection>;
  /**
   * Governed apply of the derived deal industry (delegates to updateDealProfile). Returns the
   * readback-verified deal patch on success, or ok:false (the link/refresh still proceeds honestly).
   */
  readonly applyDealIndustry: (industry: string) => Promise<{ ok: boolean; verified?: Record<string, unknown> }>;
}

export interface HydrateDealIndustryResult {
  readonly hydration: DealIndustryHydration;
  /** The verified deal patch to merge (present only when the derived industry was governed-applied). */
  readonly appliedPatch?: Record<string, unknown>;
}

export async function hydrateDealIndustryFromCrm(
  clientRelationshipId: string | undefined,
  currentDealIndustry: string | undefined,
  deps: HydrateDealIndustryDeps,
): Promise<HydrateDealIndustryResult> {
  const projection = await deps.loadProjection(clientRelationshipId);
  const hydration = deriveDealIndustryHydration(projection, currentDealIndustry);
  if (hydration.industryToApply !== undefined) {
    const res = await deps.applyDealIndustry(hydration.industryToApply);
    if (res.ok) return { hydration, appliedPatch: res.verified };
  }
  return { hydration };
}

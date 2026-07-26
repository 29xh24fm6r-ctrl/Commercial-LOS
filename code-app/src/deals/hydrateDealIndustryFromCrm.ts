import {
  deriveDealIndustryHydration,
  deriveDealIndustryRefresh,
  type DealIndustryHydration,
  type DealIndustryRefreshDecision,
  type DealIndustrySource,
} from './dealIndustryHydration';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';
import { buildCrmIndustryProjectionRecord, type CrmIndustryProjectionRecord } from './crmIndustryProjectionRecord';

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
 *
 * N-22/N-23 remediation (Production Remediation Factory Arc Phase 7) — independently of whether the
 * coarse industry label gets applied, a durable CrmIndustryProjectionRecord (exact NAICS code/title,
 * sector, source organization, provenance, timestamp) is persisted whenever the projection carries a
 * NAICS fact — including the `no-mapping`/`no-sector` honest states, where the coarse label is never
 * touched but the exact classification is still worth recording (see crmIndustryProjectionRecord.ts).
 */

export interface HydrateDealIndustryDeps {
  /** Load the CRM/NAICS projection for the deal's linked client relationship. */
  readonly loadProjection: (clientRelationshipId: string | undefined) => Promise<DealIndustryProjection>;
  /**
   * Governed apply of the derived deal industry (delegates to updateDealProfile). Returns the
   * readback-verified deal patch on success, or ok:false (the link/refresh still proceeds honestly).
   */
  readonly applyDealIndustry: (industry: string) => Promise<{ ok: boolean; verified?: Record<string, unknown> }>;
  /**
   * N-22/N-23 remediation — governed persistence of the durable CRM/NAICS projection record,
   * called whenever `buildCrmIndustryProjectionRecord` produces one (see that function for exactly
   * which projection states qualify). Returns the readback-verified deal patch on success.
   */
  readonly persistCrmIndustryProjection: (
    record: CrmIndustryProjectionRecord,
  ) => Promise<{ ok: boolean; verified?: Record<string, unknown> }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function applyProjectionRecord(
  projection: DealIndustryProjection,
  source: DealIndustrySource,
  deps: Pick<HydrateDealIndustryDeps, 'persistCrmIndustryProjection'>,
): Promise<Record<string, unknown> | undefined> {
  const record = buildCrmIndustryProjectionRecord(projection, source, nowIso());
  if (!record) return undefined;
  const res = await deps.persistCrmIndustryProjection(record);
  return res.ok ? res.verified : undefined;
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
  let appliedPatch: Record<string, unknown> | undefined;
  if (hydration.industryToApply !== undefined) {
    const res = await deps.applyDealIndustry(hydration.industryToApply);
    if (res.ok) appliedPatch = res.verified;
  }
  const projectionPatch = await applyProjectionRecord(projection, hydration.source, deps);
  if (projectionPatch) appliedPatch = { ...appliedPatch, ...projectionPatch };
  return appliedPatch ? { hydration, appliedPatch } : { hydration };
}

export interface RefreshDealIndustryResult {
  readonly decision: DealIndustryRefreshDecision;
  /** The verified deal patch to merge (present only when a refresh governed-applied a new industry). */
  readonly appliedPatch?: Record<string, unknown>;
}

/**
 * P1-7 — explicit "refresh Industry from CRM NAICS" for when the linked company's NAICS changed after
 * the deal was created. Provenance-aware: `priorSource` is the known source of the current stored
 * Industry (e.g. from the last hydration outcome / audit). A previously CRM-derived value is updated
 * when the derivation changed; an explicit manual override is preserved and never overwritten. The
 * apply goes through the same governed write, so both the refresh and a kept override are auditable.
 */
export async function refreshDealIndustryFromCrm(
  clientRelationshipId: string | undefined,
  currentDealIndustry: string | undefined,
  priorSource: DealIndustrySource,
  deps: HydrateDealIndustryDeps,
): Promise<RefreshDealIndustryResult> {
  const projection = await deps.loadProjection(clientRelationshipId);
  const decision = deriveDealIndustryRefresh(projection, currentDealIndustry, priorSource);
  let appliedPatch: Record<string, unknown> | undefined;
  if (decision.action === 'apply' && decision.industryToApply !== undefined) {
    const res = await deps.applyDealIndustry(decision.industryToApply);
    if (res.ok) appliedPatch = res.verified;
  }
  const projectionPatch = await applyProjectionRecord(projection, decision.source, deps);
  if (projectionPatch) appliedPatch = { ...appliedPatch, ...projectionPatch };
  return appliedPatch ? { decision, appliedPatch } : { decision };
}

import { describe, it, expect, vi } from 'vitest';
import { hydrateDealIndustryFromCrm, refreshDealIndustryFromCrm, type HydrateDealIndustryDeps } from './hydrateDealIndustryFromCrm';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';
import type { CrmIndustryProjectionRecord } from './crmIndustryProjectionRecord';

const derived: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '561110',
  sectorCode: '56',
  sectorTitle: 'Administrative and Support Services',
  dealIndustry: 'Other',
};

const derivedManufacturing: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '332710',
  sectorCode: '31-33',
  sectorTitle: 'Manufacturing',
  dealIndustry: 'Manufacturing',
};

// N-23's restaurant example — a real NAICS classification with no coarse mapping.
const noMappingRestaurant: DealIndustryProjection = {
  kind: 'no-mapping',
  organizationId: 'org-restaurant',
  naicsCode: '722511',
  naicsTitle: 'Full-Service Restaurants',
  sectorCode: '72',
  sectorTitle: 'Accommodation and Food Services',
};

/** Default: persist always "succeeds" but with no verified patch, so tests that don't care about the
 * projection persistence path don't need to assert on it. */
function baseDeps(over: Partial<HydrateDealIndustryDeps> = {}): HydrateDealIndustryDeps {
  return {
    loadProjection: async () => derived,
    applyDealIndustry: async () => ({ ok: true }),
    persistCrmIndustryProjection: async () => ({ ok: true }),
    ...over,
  };
}

describe('hydrateDealIndustryFromCrm — link/edit → governed apply', () => {
  it('valid NAICS + empty deal industry → governed-applies the derived industry and returns the verified patch', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'Other' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => derived,
      applyDealIndustry,
    }));
    expect(applyDealIndustry).toHaveBeenCalledWith('Other');
    expect(res.hydration.criterionSatisfied).toBe(true);
    expect(res.hydration.source).toBe('crm-derived');
    expect(res.appliedPatch).toMatchObject({ industry: 'Other' });
  });

  it('no NAICS → does NOT write the industry label; returns a blocked hydration with the CRM remediation', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => ({ kind: 'no-naics', organizationId: 'org-9' }),
      applyDealIndustry,
    }));
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.hydration.criterionSatisfied).toBe(false);
    expect(res.hydration.remediation).toEqual({ kind: 'edit-crm-naics', organizationId: 'org-9' });
    // no-naics carries no NAICS fact at all — nothing to persist either.
    expect(res.appliedPatch).toBeUndefined();
  });

  it('a manual deal industry is never overwritten (no industry write even when NAICS derives)', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'X' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', 'Manufacturing', baseDeps({
      loadProjection: async () => derived,
      applyDealIndustry,
    }));
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.hydration.source).toBe('manual');
  });

  it('a failed governed apply leaves the deal unpatched but still reports the hydration honestly', async () => {
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => derived,
      applyDealIndustry: async () => ({ ok: false }),
      persistCrmIndustryProjection: async () => ({ ok: false }),
    }));
    expect(res.appliedPatch).toBeUndefined();
    expect(res.hydration.source).toBe('crm-derived'); // decision unchanged; only the persist failed
  });

  // N-22/N-23 remediation
  it('N-22: persists the durable CRM/NAICS projection record alongside the industry label', async () => {
    const persistCrmIndustryProjection = vi.fn(async (_record: CrmIndustryProjectionRecord) => ({ ok: true, verified: { crmIndustryProjectionInputs: 'json' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => derived,
      applyDealIndustry: async () => ({ ok: true, verified: { industry: 'Other' } }),
      persistCrmIndustryProjection,
    }));
    expect(persistCrmIndustryProjection).toHaveBeenCalledTimes(1);
    const record = persistCrmIndustryProjection.mock.calls[0]![0];
    expect(record).toMatchObject({ naicsCode: '561110', organizationId: 'org-9', dealIndustryApplied: 'Other', source: 'crm-derived' });
    expect(res.appliedPatch).toMatchObject({ industry: 'Other', crmIndustryProjectionInputs: 'json' });
  });

  it('N-23: persists the exact NAICS/sector facts even in a no-mapping projection, though the coarse label is never touched', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const persistCrmIndustryProjection = vi.fn(async (_record: CrmIndustryProjectionRecord) => ({ ok: true, verified: { crmIndustryProjectionInputs: 'json' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => noMappingRestaurant,
      applyDealIndustry,
      persistCrmIndustryProjection,
    }));
    expect(applyDealIndustry).not.toHaveBeenCalled(); // no coarse mapping exists — industry itself untouched
    expect(persistCrmIndustryProjection).toHaveBeenCalledTimes(1);
    const record = persistCrmIndustryProjection.mock.calls[0]![0];
    expect(record).toMatchObject({ naicsCode: '722511', naicsTitle: 'Full-Service Restaurants', sectorCode: '72', dealIndustryApplied: '' });
    expect(res.appliedPatch).toMatchObject({ crmIndustryProjectionInputs: 'json' });
  });

  it('does not attempt to persist a projection record when the projection carries no NAICS fact at all', async () => {
    const persistCrmIndustryProjection = vi.fn(async () => ({ ok: true }));
    await hydrateDealIndustryFromCrm('client-1', undefined, baseDeps({
      loadProjection: async () => ({ kind: 'no-crm-link' }),
      persistCrmIndustryProjection,
    }));
    expect(persistCrmIndustryProjection).not.toHaveBeenCalled();
  });
});

describe('refreshDealIndustryFromCrm — P1-7 explicit, provenance-aware refresh', () => {
  it('refreshes a previously CRM-derived industry after a later NAICS change (governed apply)', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'Manufacturing' } }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Other', 'crm-derived', baseDeps({
      loadProjection: async () => derivedManufacturing,
      applyDealIndustry,
    }));
    expect(applyDealIndustry).toHaveBeenCalledWith('Manufacturing');
    expect(res.decision.action).toBe('apply');
    expect(res.decision.previousIndustry).toBe('Other');
    expect(res.appliedPatch).toMatchObject({ industry: 'Manufacturing' });
  });

  it('preserves an explicit manual override — never writes the label even when the derivation differs', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Healthcare', 'manual', baseDeps({
      loadProjection: async () => derivedManufacturing,
      applyDealIndustry,
    }));
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.decision.action).toBe('keep-manual');
  });

  it('does not write the label when the derived value is already up to date', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Other', 'crm-derived', baseDeps({
      loadProjection: async () => derived,
      applyDealIndustry,
    }));
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.decision.action).toBe('up-to-date');
  });

  // N-22 remediation — refresh behavior, no stale blind overwrite
  it('N-22: a manual override still gets its NAICS facts re-verified (source recorded as manual, label never touched)', async () => {
    const persistCrmIndustryProjection = vi.fn(async (_record: CrmIndustryProjectionRecord) => ({ ok: true, verified: {} }));
    await refreshDealIndustryFromCrm('client-1', 'Healthcare', 'manual', baseDeps({
      loadProjection: async () => derivedManufacturing,
      persistCrmIndustryProjection,
    }));
    expect(persistCrmIndustryProjection).toHaveBeenCalledTimes(1);
    expect(persistCrmIndustryProjection.mock.calls[0]![0]).toMatchObject({ source: 'manual', dealIndustryApplied: 'Manufacturing' });
  });

  it('N-22: re-persists an up-to-date record with a fresh lastVerifiedAtIso on every explicit refresh', async () => {
    const persistCrmIndustryProjection = vi.fn(async (_record: CrmIndustryProjectionRecord) => ({ ok: true }));
    await refreshDealIndustryFromCrm('client-1', 'Other', 'crm-derived', baseDeps({
      loadProjection: async () => derived,
      persistCrmIndustryProjection,
    }));
    expect(persistCrmIndustryProjection).toHaveBeenCalledTimes(1);
    expect(persistCrmIndustryProjection.mock.calls[0]![0].lastVerifiedAtIso.length).toBeGreaterThan(0);
  });
});

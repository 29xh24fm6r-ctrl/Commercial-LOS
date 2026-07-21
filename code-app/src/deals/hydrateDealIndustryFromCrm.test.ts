import { describe, it, expect, vi } from 'vitest';
import { hydrateDealIndustryFromCrm, refreshDealIndustryFromCrm } from './hydrateDealIndustryFromCrm';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

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

describe('hydrateDealIndustryFromCrm — link/edit → governed apply', () => {
  it('valid NAICS + empty deal industry → governed-applies the derived industry and returns the verified patch', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'Other' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, {
      loadProjection: async () => derived,
      applyDealIndustry,
    });
    expect(applyDealIndustry).toHaveBeenCalledWith('Other');
    expect(res.hydration.criterionSatisfied).toBe(true);
    expect(res.hydration.source).toBe('crm-derived');
    expect(res.appliedPatch).toEqual({ industry: 'Other' });
  });

  it('no NAICS → does NOT write; returns a blocked hydration with the CRM remediation', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, {
      loadProjection: async () => ({ kind: 'no-naics', organizationId: 'org-9' }),
      applyDealIndustry,
    });
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.hydration.criterionSatisfied).toBe(false);
    expect(res.hydration.remediation).toEqual({ kind: 'edit-crm-naics', organizationId: 'org-9' });
    expect(res.appliedPatch).toBeUndefined();
  });

  it('a manual deal industry is never overwritten (no write even when NAICS derives)', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'X' } }));
    const res = await hydrateDealIndustryFromCrm('client-1', 'Manufacturing', {
      loadProjection: async () => derived,
      applyDealIndustry,
    });
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.hydration.source).toBe('manual');
    expect(res.appliedPatch).toBeUndefined();
  });

  it('a failed governed apply leaves the deal unpatched but still reports the hydration honestly', async () => {
    const res = await hydrateDealIndustryFromCrm('client-1', undefined, {
      loadProjection: async () => derived,
      applyDealIndustry: async () => ({ ok: false }),
    });
    expect(res.appliedPatch).toBeUndefined();
    expect(res.hydration.source).toBe('crm-derived'); // decision unchanged; only the persist failed
  });
});

describe('refreshDealIndustryFromCrm — P1-7 explicit, provenance-aware refresh', () => {
  it('refreshes a previously CRM-derived industry after a later NAICS change (governed apply)', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true, verified: { industry: 'Manufacturing' } }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Other', 'crm-derived', {
      loadProjection: async () => derivedManufacturing,
      applyDealIndustry,
    });
    expect(applyDealIndustry).toHaveBeenCalledWith('Manufacturing');
    expect(res.decision.action).toBe('apply');
    expect(res.decision.previousIndustry).toBe('Other');
    expect(res.appliedPatch).toEqual({ industry: 'Manufacturing' });
  });

  it('preserves an explicit manual override — never writes even when the derivation differs', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Healthcare', 'manual', {
      loadProjection: async () => derivedManufacturing,
      applyDealIndustry,
    });
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.decision.action).toBe('keep-manual');
    expect(res.appliedPatch).toBeUndefined();
  });

  it('does not write when the derived value is already up to date', async () => {
    const applyDealIndustry = vi.fn(async () => ({ ok: true }));
    const res = await refreshDealIndustryFromCrm('client-1', 'Other', 'crm-derived', {
      loadProjection: async () => derived,
      applyDealIndustry,
    });
    expect(applyDealIndustry).not.toHaveBeenCalled();
    expect(res.decision.action).toBe('up-to-date');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { hydrateDealIndustryFromCrm } from './hydrateDealIndustryFromCrm';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

const derived: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '561110',
  sectorCode: '56',
  sectorTitle: 'Administrative and Support Services',
  dealIndustry: 'Other',
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

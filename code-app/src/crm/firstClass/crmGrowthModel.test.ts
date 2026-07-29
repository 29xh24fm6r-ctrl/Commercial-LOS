import { describe, expect, it } from 'vitest';
import { CRM_OPPORTUNITY_STAGES, filterOpportunities, previewOpportunityConversion, type CrmOpportunity } from './crmGrowthModel';

const opportunity = (overrides: Partial<CrmOpportunity> = {}): CrmOpportunity => ({
  id:'o1', companyId:'c1', productNeed:'Working capital', assignedBankerId:'b1',
  stage:'Qualified', updatedAt:'2026-07-01T00:00:00Z', ...overrides,
});

describe('CRM-5 opportunity and conversion governance', () => {
  it('keeps CRM stages independent of LOS underwriting stages', () => {
    expect(CRM_OPPORTUNITY_STAGES).toContain('Discovery');
    expect(CRM_OPPORTUNITY_STAGES).not.toContain('Underwriting');
  });
  it('derives stale/no-next-action deterministically', () => {
    expect(filterOpportunities([opportunity()], 'stale', { nowIso:'2026-07-29T00:00:00Z' })).toHaveLength(1);
  });
  it('fails closed before schema verification and prevents duplicate deal conversion', () => {
    expect(previewOpportunityConversion(opportunity(), false).kind).toBe('blocked');
    expect(previewOpportunityConversion(opportunity({ linkedDealId:'d1' }), true)).toEqual({ kind:'already-converted', dealId:'d1' });
  });
  it('returns a preview, never an autonomous create command', () => {
    expect(previewOpportunityConversion(opportunity(), true)).toMatchObject({ kind:'preview', preservesProvenance:true });
  });
});

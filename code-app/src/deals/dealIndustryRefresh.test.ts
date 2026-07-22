import { describe, it, expect } from 'vitest';
import { deriveDealIndustryRefresh } from './dealIndustryHydration';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

/**
 * P1-7 — provenance-aware refresh of a deal's Industry after the linked company's NAICS changed.
 * Distinct from first-time hydration: a previously CRM-derived value tracks the new derivation, an
 * explicit manual override is preserved, and every apply/preserve stays honest and auditable.
 */

const derivedOther: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '561110',
  sectorCode: '56',
  sectorTitle: 'Administrative and Support Services',
  dealIndustry: 'Other',
};

// A later NAICS edit reclassifies the same company to Manufacturing.
const derivedManufacturing: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '332710',
  sectorCode: '31-33',
  sectorTitle: 'Manufacturing',
  dealIndustry: 'Manufacturing',
};

describe('deriveDealIndustryRefresh', () => {
  it('applies the derived industry when Industry is empty (source none)', () => {
    const d = deriveDealIndustryRefresh(derivedOther, undefined, 'none');
    expect(d.action).toBe('apply');
    expect(d.industryToApply).toBe('Other');
    expect(d.previousIndustry).toBeUndefined();
    expect(d.source).toBe('crm-derived');
  });

  it('is a no-op (up-to-date) when the previously CRM-derived value still matches', () => {
    const d = deriveDealIndustryRefresh(derivedOther, 'Other', 'crm-derived');
    expect(d.action).toBe('up-to-date');
    expect(d.industryToApply).toBeUndefined();
    expect(d.status).toMatch(/up to date/i);
  });

  it('REFRESHES a previously CRM-derived value when a later NAICS change reclassifies it', () => {
    const d = deriveDealIndustryRefresh(derivedManufacturing, 'Other', 'crm-derived');
    expect(d.action).toBe('apply');
    expect(d.industryToApply).toBe('Manufacturing');
    expect(d.previousIndustry).toBe('Other'); // records the swap for audit
    expect(d.status).toMatch(/was Other/);
  });

  it('PRESERVES an explicit manual override even when the CRM derivation differs', () => {
    const d = deriveDealIndustryRefresh(derivedManufacturing, 'Healthcare', 'manual');
    expect(d.action).toBe('keep-manual');
    expect(d.industryToApply).toBeUndefined();
    expect(d.source).toBe('manual');
    expect(d.status).toMatch(/manual override kept/i);
  });

  it('a manual override that happens to match the derivation is kept and labelled', () => {
    const d = deriveDealIndustryRefresh(derivedManufacturing, 'Manufacturing', 'manual');
    expect(d.action).toBe('keep-manual');
    expect(d.status).toMatch(/matches CRM-derived/i);
  });

  it('treats a non-empty value of unknown provenance as refreshable (not sticky-manual)', () => {
    // priorSource 'none' but a value is present (e.g. legacy value with no recorded provenance):
    // a refresh should track the CRM derivation rather than freeze the old value.
    const d = deriveDealIndustryRefresh(derivedManufacturing, 'Other', 'none');
    expect(d.action).toBe('apply');
    expect(d.industryToApply).toBe('Manufacturing');
    expect(d.previousIndustry).toBe('Other');
  });

  it('unresolved (no NAICS) surfaces the CRM remediation when there is no manual override', () => {
    const d = deriveDealIndustryRefresh({ kind: 'no-naics', organizationId: 'org-9' }, undefined, 'none');
    expect(d.action).toBe('unresolved');
    expect(d.remediation).toEqual({ kind: 'edit-crm-naics', organizationId: 'org-9' });
  });

  it('unresolved projection keeps an explicit manual override rather than blanking it', () => {
    const d = deriveDealIndustryRefresh({ kind: 'no-naics', organizationId: 'org-9' }, 'Technology', 'manual');
    expect(d.action).toBe('keep-manual');
    expect(d.source).toBe('manual');
  });

  it('unavailable schema is honest: unresolved+unavailable without a manual override', () => {
    const d = deriveDealIndustryRefresh({ kind: 'unavailable', reason: 'x' }, undefined, 'none');
    expect(d.action).toBe('unresolved');
    expect(d.unavailable).toBe(true);
  });
});

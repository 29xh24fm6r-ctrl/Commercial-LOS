import { describe, it, expect } from 'vitest';
import { deriveDealIndustryHydration } from './dealIndustryHydration';
import type { DealIndustryProjection } from '../crm/dealIndustryProjection';

const derived: DealIndustryProjection = {
  kind: 'derived',
  organizationId: 'org-9',
  naicsCode: '561110',
  sectorCode: '56',
  sectorTitle: 'Administrative and Support Services',
  dealIndustry: 'Other',
};

describe('deriveDealIndustryHydration — governed CRM/NAICS industry into the Intake criterion', () => {
  it('linking a client with valid NAICS SATISFIES the criterion and auto-applies the derived industry', () => {
    const h = deriveDealIndustryHydration(derived, undefined);
    expect(h.criterionSatisfied).toBe(true);
    expect(h.source).toBe('crm-derived');
    expect(h.industryToApply).toBe('Other'); // auto-hydrate — banker need not re-enter
    expect(h.remediation).toBeUndefined();
    expect(h.status).toMatch(/CRM-derived/);
    expect(h.status).toMatch(/561110/);
  });

  it('linking a client WITHOUT NAICS leaves the criterion BLOCKED and exposes a direct CRM remediation path', () => {
    const h = deriveDealIndustryHydration({ kind: 'no-naics', organizationId: 'org-9' }, undefined);
    expect(h.criterionSatisfied).toBe(false);
    expect(h.industryToApply).toBeUndefined();
    expect(h.remediation).toEqual({ kind: 'edit-crm-naics', organizationId: 'org-9' });
    expect(h.status).toMatch(/unresolved/i);
  });

  it('once CRM NAICS is edited to a valid code, the projection derives and the criterion clears (auto-apply)', () => {
    // Simulates the state transition after the banker fixes NAICS via the PR #79 editor and the
    // projection is re-run: blocked → derived → satisfied.
    const before = deriveDealIndustryHydration({ kind: 'no-naics', organizationId: 'org-9' }, undefined);
    expect(before.criterionSatisfied).toBe(false);
    const after = deriveDealIndustryHydration(derived, undefined);
    expect(after.criterionSatisfied).toBe(true);
    expect(after.industryToApply).toBe('Other');
  });

  it('a manual deal Industry is NEVER overwritten by the CRM-derived value', () => {
    const h = deriveDealIndustryHydration(derived, 'Manufacturing');
    expect(h.criterionSatisfied).toBe(true);
    expect(h.source).toBe('manual');
    expect(h.industryToApply).toBeUndefined(); // no auto-apply — manual wins
    expect(h.status).toMatch(/manual value kept/i);
  });

  it('an invalid / unmappable NAICS NEVER satisfies the criterion (no-sector)', () => {
    const h = deriveDealIndustryHydration(
      { kind: 'no-sector', organizationId: 'org-9', naicsCode: '999999' },
      undefined,
    );
    expect(h.criterionSatisfied).toBe(false);
    expect(h.industryToApply).toBeUndefined();
    expect(h.remediation).toEqual({ kind: 'edit-crm-naics', organizationId: 'org-9' });
  });

  it('no-mapping (sector resolves but no admin industry map) is unresolved with no banker NAICS remediation', () => {
    const h = deriveDealIndustryHydration(
      { kind: 'no-mapping', organizationId: 'org-9', naicsCode: '561110', sectorCode: '56', sectorTitle: 'Admin' },
      undefined,
    );
    expect(h.criterionSatisfied).toBe(false);
    expect(h.remediation).toBeUndefined(); // admin mapping gap, not a NAICS edit
  });

  it('no CRM client linked → unresolved with a link-client remediation', () => {
    const h = deriveDealIndustryHydration({ kind: 'no-crm-link' }, undefined);
    expect(h.criterionSatisfied).toBe(false);
    expect(h.remediation).toEqual({ kind: 'link-crm-client' });
  });

  it('unavailable (schema not deployed) is honest: unresolved + unavailable, unless a manual value exists', () => {
    const noManual = deriveDealIndustryHydration({ kind: 'unavailable', reason: 'x' }, undefined);
    expect(noManual.criterionSatisfied).toBe(false);
    expect(noManual.unavailable).toBe(true);
    const withManual = deriveDealIndustryHydration({ kind: 'unavailable', reason: 'x' }, 'Technology');
    expect(withManual.criterionSatisfied).toBe(true);
    expect(withManual.source).toBe('manual');
  });
});

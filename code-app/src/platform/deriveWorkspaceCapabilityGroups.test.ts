import { describe, it, expect } from 'vitest';
import { deriveWorkspaceCapabilityGroups } from './deriveWorkspaceCapabilityGroups';

/**
 * Phase 142B — workspace capability group pins.
 */

describe('Phase 142B — workspace capability groups', () => {
  const groups = deriveWorkspaceCapabilityGroups();
  const byKey = (k: string) => groups.find((g) => g.groupKey === k)!;

  it('groups annual review capabilities together', () => {
    const ar = byKey('annual_review');
    expect(ar.objects).toContain('annual_review');
    expect(ar.shippedCapabilities.join(' ')).toMatch(/annual review/i);
  });

  it('groups CRM capabilities together', () => {
    const crm = byKey('crm_relationship_master');
    expect(crm.objects).toContain('crm_organization');
    expect(crm.objects).toContain('crm_person');
  });

  it('groups portfolio boarding / FDIC capabilities', () => {
    expect(byKey('portfolio_boarding').objects).toContain('portfolio_boarded_loan');
    expect(byKey('fdic_examiner_packages').shippedCapabilities.join(' ')).toMatch(/FDIC|examiner/i);
  });

  it('shipped vs planned states are honest (both present, distinct)', () => {
    for (const g of groups) {
      expect(Array.isArray(g.shippedCapabilities)).toBe(true);
      expect(Array.isArray(g.plannedCapabilities)).toBe(true);
      // No capability appears as both shipped and planned.
      for (const p of g.plannedCapabilities) expect(g.shippedCapabilities).not.toContain(p);
    }
  });

  it('carries no fetch / write artifacts', () => {
    expect(JSON.stringify(groups)).not.toMatch(/createRecord|fetch\(|https?:\/\//);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveProductProcessProfile, deriveProductProcessRegistryIntegrity } from './deriveProductProcessProfile';
import { PRODUCT_PROCESS_REGISTRY } from './productProcessRegistry';

/**
 * Phase 142A — product / process profile pins.
 */

describe('Phase 142A — product / process profiles', () => {
  it('profiles include document / covenant / evidence requirements', () => {
    const sba = deriveProductProcessProfile('sba_7a');
    expect(sba.found).toBe(true);
    expect(sba.hasRequirements).toBe(true);
    expect(sba.profile?.documentRequirements.length).toBeGreaterThan(0);
  });

  it('annual review profiles integrate with the package / covenant outputs', () => {
    const ar = deriveProductProcessProfile('annual_review_standard');
    expect(ar.profile?.packageRequirements).toContain('annual_review_credit_memo');
    expect(ar.profile?.covenantRequirementTemplates.length).toBeGreaterThan(0);
    expect(ar.workflowRouteKnown).toBe(true);
  });

  it('every profile is a template (no fake live products) and keeps delivery disabled', () => {
    const integrity = deriveProductProcessRegistryIntegrity();
    expect(integrity.allTemplates).toBe(true);
    expect(integrity.allDeliveryDisabled).toBe(true);
    expect(integrity.allWorkflowRoutesKnown).toBe(true);
    for (const p of PRODUCT_PROCESS_REGISTRY) expect(p.isTemplate).toBe(true);
  });

  it('no live write / admin mutation surface', () => {
    const serialized = JSON.stringify(PRODUCT_PROCESS_REGISTRY);
    expect(serialized).not.toMatch(/createRecord|updateRecord|adminMutate|schemaMutate/);
  });
});

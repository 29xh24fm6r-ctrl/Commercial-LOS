import { describe, it, expect } from 'vitest';
import { COMPETITIVE_CAPABILITY_MATRIX, capabilityCell } from './competitiveCapabilityMatrix';
import { COMPETITIVE_PLATFORMS } from './competitiveCapabilityTypes';

/**
 * Phase 142A — competitive capability matrix pins.
 */

describe('Phase 142A — capability matrix', () => {
  it('includes all reference platforms', () => {
    expect(COMPETITIVE_CAPABILITY_MATRIX.platforms).toHaveLength(9);
    for (const p of ['salesforce', 'ncino', 'digifi_getsan4u_los', 'opencbs_los', 'frappe_lending', 'twenty_crm', 'corteza', 'ogb_los_current', 'ogb_los_target']) {
      expect(COMPETITIVE_PLATFORMS).toContain(p);
    }
  });

  it('includes all 30 capability categories', () => {
    expect(COMPETITIVE_CAPABILITY_MATRIX.categories).toHaveLength(30);
  });

  it('every cell covers every platform with a rationale and confidence', () => {
    for (const cat of COMPETITIVE_CAPABILITY_MATRIX.categories) {
      expect(cat.cells).toHaveLength(9);
      for (const cell of cat.cells) {
        expect(cell.rationale.length).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(cell.confidence);
        expect(cell.evidenceNote.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses unknown (preferred over overclaim) where evidence is insufficient', () => {
    const unknowns = COMPETITIVE_CAPABILITY_MATRIX.categories.flatMap((c) => c.cells).filter((c) => c.score === 'unknown');
    expect(unknowns.length).toBeGreaterThan(0);
    for (const u of unknowns) expect(u.confidence).toBe('low');
  });

  it('OGB current does not claim unshipped live sending / export / final approval', () => {
    const comms = capabilityCell('communications_outreach', 'ogb_los_current')!;
    expect(comms.score === 0 || comms.score === 1).toBe(true);
    expect(comms.rationale.toLowerCase()).toMatch(/preview|draft|disabled/);

    const credit = capabilityCell('credit_approval_routing', 'ogb_los_current')!;
    expect(credit.rationale.toLowerCase()).toMatch(/no final approval|findings/);

    const esign = capabilityCell('esign_closing', 'ogb_los_current')!;
    expect(esign.score === 0 || esign.score === 1).toBe(true);
  });

  it('contains no raw external URL in the matrix data', () => {
    expect(JSON.stringify(COMPETITIVE_CAPABILITY_MATRIX)).not.toMatch(/https?:\/\//);
  });
});

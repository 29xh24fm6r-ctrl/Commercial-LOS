import { describe, it, expect } from 'vitest';
import { deriveCompetitiveRoadmap } from './deriveCompetitiveRoadmap';

describe('Phase 142H — competitive roadmap', () => {
  const roadmap = deriveCompetitiveRoadmap();

  it('contains phases 142I through 142T', () => {
    const ids = roadmap.map((p) => p.phaseId);
    for (const id of ['142I', '142J', '142K', '142L', '142M', '142N', '142O', '142P', '142Q', '142R', '142S', '142T']) {
      expect(ids).toContain(id);
    }
  });

  it('gives every phase a risk class and prerequisites', () => {
    for (const p of roadmap) {
      expect(p.riskClass).toBeTruthy();
      expect(p.prerequisites.length).toBeGreaterThanOrEqual(1);
      expect(p.expectedDeliverables.length).toBeGreaterThanOrEqual(1);
      expect(p.readinessCriteria.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('no phase enables a final credit decision', () => {
    for (const p of roadmap) {
      expect(p.riskClass).not.toBe('credit_decision_final_forbidden');
      const text = JSON.stringify(p).toLowerCase();
      expect(text).not.toMatch(/enable final credit|automate final approval|final approval automation/);
    }
  });

  it('no integration phase bypasses disabled-by-default', () => {
    const integrationPhases = roadmap.filter((p) => p.riskClass === 'external_integration_disabled');
    for (const p of integrationPhases) {
      expect(p.forbiddenActions.join(' ').toLowerCase()).toMatch(/no live external integration|no real provider|no live/);
    }
  });

  it('keeps schema mutation operator-governed', () => {
    const k = roadmap.find((p) => p.phaseId === '142K');
    expect(k?.forbiddenActions.join(' ')).toMatch(/schema/i);
  });
});

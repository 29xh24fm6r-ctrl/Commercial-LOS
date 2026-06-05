import { describe, it, expect } from 'vitest';
import {
  FDIC_REMEDIATION_ROADMAP,
  FDIC_ROADMAP_IDS,
  getRoadmapItem,
} from './fdicRemediationRoadmap';
import {
  FDIC_WORKSPACES,
  getFdicControl,
} from './fdicRemediationOperatingModel';

/**
 * Phase 140A — FDIC remediation roadmap pins.
 *
 * Pins that the roadmap covers 140B–140K, that every item is still planned
 * (140A ships nothing), that controls/workspaces referenced are real, and
 * that dependency ids resolve to earlier roadmap items.
 */

describe('Phase 140A — roadmap coverage', () => {
  it('covers exactly 140B through 140K', () => {
    const ids = FDIC_REMEDIATION_ROADMAP.map((i) => i.id);
    expect(ids).toEqual([...FDIC_ROADMAP_IDS]);
    expect(ids).toEqual([
      '140B',
      '140C',
      '140D',
      '140E',
      '140F',
      '140G',
      '140H',
      '140I',
      '140J',
      '140K',
    ]);
  });

  it('every roadmap item is still planned (Phase 140A implements none of them)', () => {
    for (const item of FDIC_REMEDIATION_ROADMAP) {
      expect(item.status, `${item.id}`).toBe('planned');
    }
  });

  it('every item maps to a known workspace and addresses real controls', () => {
    for (const item of FDIC_REMEDIATION_ROADMAP) {
      expect(FDIC_WORKSPACES).toContain(item.primaryWorkspace);
      expect(item.controlsAddressed.length, `${item.id}`).toBeGreaterThan(0);
      for (const id of item.controlsAddressed) {
        expect(getFdicControl(id), `${item.id} → ${id}`).toBeDefined();
      }
    }
  });

  it('every item states why it is next', () => {
    for (const item of FDIC_REMEDIATION_ROADMAP) {
      expect(item.whyNext.length, `${item.id}`).toBeGreaterThan(10);
    }
  });

  it('every dependency id references an earlier roadmap item', () => {
    const order = FDIC_ROADMAP_IDS;
    for (const item of FDIC_REMEDIATION_ROADMAP) {
      const idx = order.indexOf(item.id);
      for (const dep of item.dependsOn) {
        const depItem = getRoadmapItem(dep);
        expect(depItem, `${item.id} depends on unknown ${dep}`).toBeDefined();
        expect(
          order.indexOf(dep),
          `${item.id} depends on ${dep} which is not earlier`,
        ).toBeLessThan(idx);
      }
    }
  });

  it('the control-tower (140B) and credit-admin exception queues (140C) lead the roadmap', () => {
    expect(getRoadmapItem('140B')?.primaryWorkspace).toBe(
      'portfolio_command_center',
    );
    expect(getRoadmapItem('140C')?.primaryWorkspace).toBe(
      'credit_administration_workspace',
    );
    expect(getRoadmapItem('140K')?.title).toMatch(/examiner evidence packet/i);
  });
});

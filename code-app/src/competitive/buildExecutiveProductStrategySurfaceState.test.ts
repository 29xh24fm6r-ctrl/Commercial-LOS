import { describe, it, expect } from 'vitest';
import { buildExecutiveProductStrategySurfaceState } from './buildExecutiveProductStrategySurfaceState';

const CLOCK = '2026-06-09T00:00:00.000Z';

describe('Phase 142I — executive product strategy surface state composer', () => {
  it('builds a complete strategy state from static registries', () => {
    const s = buildExecutiveProductStrategySurfaceState({ clock: CLOCK });
    expect(s.roadmap.length).toBe(12);
    expect(s.differentiators.length).toBeGreaterThan(0);
    expect(s.gaps.length).toBeGreaterThan(0);
    expect(s.generatedAt).toBe(CLOCK);
  });

  it('produces a caveat when an optional registry is missing', () => {
    const s = buildExecutiveProductStrategySurfaceState({ clock: CLOCK, includeIntegration: false });
    expect(s.caveats.length).toBeGreaterThan(0);
    expect(s.caveats.join(' ')).toMatch(/Integration readiness/i);
  });

  it('claims no live integration / final approval / final export', () => {
    const s = buildExecutiveProductStrategySurfaceState({ clock: CLOCK });
    expect(s.auditSummary.containsLiveIntegration).toBe(false);
    expect(s.auditSummary.containsFinalApproval).toBe(false);
    expect(s.safetyPosture.items.some((i) => i.category === 'Package final export' && i.status === 'disabled')).toBe(true);
  });

  it('fabricates no operational metrics', () => {
    const s = buildExecutiveProductStrategySurfaceState({ clock: CLOCK });
    expect(s.auditSummary.containsOperationalData).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/\$\s*\d/);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveExecutiveProductStrategyDashboard } from './deriveExecutiveProductStrategyDashboard';

const CLOCK = '2026-06-09T00:00:00.000Z';

describe('Phase 142H — executive product strategy dashboard deriver', () => {
  it('derives a dashboard from the matrix and backlog', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.roadmap.length).toBe(12);
    expect(s.kpis.length).toBeGreaterThanOrEqual(8);
    expect(s.capabilitySummaries.length).toBeGreaterThanOrEqual(20);
    expect(s.currentCapabilityScore).toBeLessThanOrEqual(s.targetCapabilityScore);
  });

  it('counts shipped capabilities excluding planned-only ones', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.shippedCapabilityCount).toBeGreaterThan(0);
    expect(s.shippedCapabilityCount).toBeLessThan(s.capabilitySummaries.length);
  });

  it('includes planned capabilities in the target count', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.plannedCapabilityCount).toBeGreaterThan(0);
    expect(s.targetCapabilityScore).toBeGreaterThanOrEqual(s.currentCapabilityScore);
  });

  it('does not count disabled integrations as live', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    const kpi = s.kpis.find((k) => k.key === 'integration_readiness_maturity');
    expect(kpi?.status).toBe('blocked_disabled');
    expect(s.safetyPosture.containsLiveIntegration).toBe(false);
  });

  it('keeps final credit approval forbidden', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.auditSummary.containsFinalApproval).toBe(false);
    expect(s.riskSummary.forbiddenCapabilities.some((f) => /approval|decline/i.test(f))).toBe(true);
  });

  it('keeps admin configuration apply review-only (not applied)', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    const adminApply = s.safetyPosture.items.find((i) => i.category === 'Admin apply');
    expect(adminApply?.status).toBe('review_only');
  });

  it('produces caveats when optional inputs are missing', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.caveats.length).toBeGreaterThan(0);
  });

  it('fabricates no operational data', () => {
    const s = deriveExecutiveProductStrategyDashboard({ generatedAt: CLOCK });
    expect(s.auditSummary.containsOperationalData).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/\$\s*\d/);
  });
});

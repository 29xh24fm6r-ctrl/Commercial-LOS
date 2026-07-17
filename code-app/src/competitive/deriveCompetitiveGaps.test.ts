import { describe, it, expect } from 'vitest';
import { deriveCompetitiveGaps } from './deriveCompetitiveGaps';

describe('Phase 142H — competitive gaps', () => {
  const gaps = deriveCompetitiveGaps();

  it('includes intentionally disabled integrations', () => {
    expect(gaps.some((g) => g.gapKey === 'live_integration_transport')).toBe(true);
    expect(gaps.some((g) => g.gapKey === 'credit_bureau_pull')).toBe(true);
  });

  it('includes admin apply disabled', () => {
    expect(gaps.some((g) => g.gapKey === 'live_admin_config_apply')).toBe(true);
  });

  it('includes live borrower outreach disabled', () => {
    expect(gaps.some((g) => g.gapKey === 'live_borrower_outreach')).toBe(true);
  });

  it('gives every gap a risk class, safety blocker, future phase, and prerequisite', () => {
    for (const g of gaps) {
      expect(g.riskClass).toBeTruthy();
      expect(g.safetyBlocker).toBeTruthy();
      expect(g.recommendedFuturePhase).toBeTruthy();
      // Factory Arc Phase 13 — recommendedFuturePhase is rendered verbatim to an
      // executive in ExecutiveProductStrategyPanel.tsx; it must read as a plain
      // roadmap item, never leak this codebase's internal phase-tracking vocabulary.
      expect(g.recommendedFuturePhase).not.toMatch(/Phase \d/i);
      expect(g.prerequisite).toBeTruthy();
    }
  });

  it('recommends no unsafe action (no enable-now / bypass language)', () => {
    const s = JSON.stringify(gaps).toLowerCase();
    expect(s).not.toMatch(/enable now|bypass|skip approval|without approval|go live immediately/);
  });
});

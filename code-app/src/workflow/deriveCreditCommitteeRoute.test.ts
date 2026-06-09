import { describe, it, expect } from 'vitest';
import { deriveCreditCommitteeRoute } from './deriveCreditCommitteeRoute';

/**
 * Phase 142C — credit committee route pins.
 */

describe('Phase 142C — credit committee route', () => {
  it('a high amount requires a credit committee', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 6000000 }, routeKey: 'credit_committee_required', committeePolicy: 'credit_committee', packageReadiness: 'review_ready', covenantStatus: 'in_compliance', evidenceComplete: true });
    expect(r.committeeRequired).toBe(true);
    expect(r.committeeType).toBe('credit_committee');
  });

  it('a higher amount requires a senior / executive committee', () => {
    expect(deriveCreditCommitteeRoute({ input: { amount: 16000000 }, routeKey: 'x', committeePolicy: 'none' }).committeeType).toBe('senior_credit_committee');
    expect(deriveCreditCommitteeRoute({ input: { amount: 60000000 }, routeKey: 'x', committeePolicy: 'none' }).committeeType).toBe('executive_credit_review');
  });

  it('a board-visibility policy produces board_visibility_only when configured', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 100000 }, routeKey: 'fdic_examiner_package_required', committeePolicy: 'board_visibility_only' });
    expect(r.committeeType).toBe('board_visibility_only');
  });

  it('a missing package blocks committee-ready', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 6000000 }, routeKey: 'x', committeePolicy: 'credit_committee', packageReadiness: 'blocked', evidenceComplete: false });
    expect(r.missingMaterials.length).toBeGreaterThan(0);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('a failed covenant adds a blocker', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 6000000 }, routeKey: 'x', committeePolicy: 'credit_committee', covenantStatus: 'breach', packageReadiness: 'review_ready', evidenceComplete: true });
    expect(r.blockers.some((b) => b.code === 'covenant_breach')).toBe(true);
  });

  it('voting and approval are always disabled (no final approval)', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 6000000 }, routeKey: 'x', committeePolicy: 'credit_committee' });
    expect(r.votingEnabled).toBe(false);
    expect(r.approvalEnabled).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/\bapproved\b|recordVote|finalApproval:\s*true/i);
  });

  it('no committee is required below the threshold with no policy', () => {
    const r = deriveCreditCommitteeRoute({ input: { amount: 100000 }, routeKey: 'small_business_standard', committeePolicy: 'none' });
    expect(r.committeeRequired).toBe(false);
    expect(r.committeeType).toBe('none');
  });
});

import { describe, it, expect } from 'vitest';
import {
  deriveCreditCommitteePackageQueue,
  type CreditCommitteePackageInput,
} from './creditCommitteePackageQueue';

function pkg(over: Partial<CreditCommitteePackageInput> = {}): CreditCommitteePackageInput {
  return { dealId: 'D1', dealName: 'Deal 1', clientName: 'Client A', bankerName: 'Banker B', ...over };
}

describe('Phase 142M — credit committee package queue deriver', () => {
  it('is unavailable (fail-closed) when no input is supplied', () => {
    expect(deriveCreditCommitteePackageQueue(undefined).available).toBe(false);
    expect(deriveCreditCommitteePackageQueue({}).available).toBe(false);
  });

  it('marks not_generated when no memo / package exists', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg()] });
    expect(q.rows[0].readinessStatus).toBe('not_generated');
  });

  it('marks blocked when committee readiness has remaining blockers', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', committeeReadiness: { remainingBlockers: ['covenant exception'], hasDecisionSupport: true, evidenceCount: 4 } })] });
    expect(q.rows[0].readinessStatus).toBe('blocked');
    expect(q.rows[0].remainingBlockerCount).toBe(1);
  });

  it('marks needs_evidence when evidence is zero or missing labels exist', () => {
    const zero = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', committeeReadiness: { evidenceCount: 0, hasDecisionSupport: true } })] });
    expect(zero.rows[0].readinessStatus).toBe('needs_evidence');
    const missing = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', committeeReadiness: { evidenceCount: 3, missingEvidenceLabels: ['tax returns'], hasDecisionSupport: true } })] });
    expect(missing.rows[0].readinessStatus).toBe('needs_evidence');
    expect(missing.rows[0].missingEvidenceCount).toBe(1);
  });

  it('marks ready_for_review with decision support and no blockers / missing evidence', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', committeeReadiness: { hasDecisionSupport: true, decisionSupportCount: 5, evidenceCount: 6, remainingBlockers: [], missingEvidenceLabels: [] } })] });
    expect(q.rows[0].readinessStatus).toBe('ready_for_review');
  });

  it('marks unknown when required readiness fields are missing / ambiguous', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoGeneratedAt: '2026-06-01', committeeReadiness: { evidenceCount: 3 } })] });
    expect(q.rows[0].readinessStatus).toBe('unknown');
    expect(q.rows[0].honestWarnings.length).toBeGreaterThan(0);
  });

  it('does not infer approval from general deal completeness and emits no approval/vote labels', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', status: 'complete', stage: 'committee', committeeReadiness: { hasDecisionSupport: true, evidenceCount: 4 } })] });
    expect(q.rows[0].readinessStatus).toBe('ready_for_review');
    const s = JSON.stringify(q).toLowerCase();
    for (const w of ['approved', 'voted', 'denied', 'recommended by committee', 'decisioned', 'committee-approved']) {
      expect(s).not.toContain(w);
    }
  });

  it('computes deterministic totals', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [
      pkg({ dealId: 'D1', memoId: 'M1', committeeReadiness: { hasDecisionSupport: true, evidenceCount: 4 } }),
      pkg({ dealId: 'D2', memoId: 'M2', committeeReadiness: { remainingBlockers: ['x'], evidenceCount: 4 } }),
      pkg({ dealId: 'D3', memoId: 'M3', committeeReadiness: { evidenceCount: 0 } }),
      pkg({ dealId: 'D4' }),
    ] });
    expect(q.totals).toEqual({ total: 4, readyForReview: 1, blocked: 1, needsEvidence: 1, notGeneratedOrUnknown: 1 });
  });

  it('flags a stale package when generated before the last review timestamp', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [pkg({ memoId: 'M1', packageGeneratedAt: '2026-05-01', lastReviewedAt: '2026-06-01', committeeReadiness: { hasDecisionSupport: true, evidenceCount: 4 } })] });
    expect(q.rows[0].stalePackage).toBe(true);
  });

  it('renders empty (available) rows for an empty package list with no sample data', () => {
    const q = deriveCreditCommitteePackageQueue({ packages: [] });
    expect(q.available).toBe(true);
    expect(q.rows).toEqual([]);
    expect(q.totals.total).toBe(0);
  });
});

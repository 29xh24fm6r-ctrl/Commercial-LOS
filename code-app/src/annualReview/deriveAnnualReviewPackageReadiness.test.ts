import { describe, it, expect } from 'vitest';
import { pipeline, completeFacts } from './packageTestFixtures';

/**
 * Phase 141P — package readiness pins.
 */

function without(metricKey: string) {
  return completeFacts().filter((f) => f.metricKey !== metricKey);
}

describe('Phase 141P — package readiness', () => {
  it('blocks missing financials', () => {
    expect(pipeline({ facts: [] }).pkgReadiness.memoStatus).toBe('blocked_missing_financials');
  });

  it('blocks unknown covenants', () => {
    const p = pipeline({ covenants: [{ covenantId: 'C', covenantType: 'dscr', active: true }] });
    expect(p.pkgReadiness.memoStatus).toBe('blocked_unknown_covenants');
  });

  it('blocks missing evidence (required metric absent)', () => {
    const p = pipeline({ facts: without('cash') });
    expect(p.pkgReadiness.memoStatus).toBe('blocked_missing_evidence');
    expect(p.pkgReadiness.evidenceComplete).toBe(false);
  });

  it('produces draft_ready_with_caveats when an optional metric is missing', () => {
    const p = pipeline({ facts: without('inventory') });
    expect(p.pkgReadiness.memoStatus).toBe('draft_ready_with_caveats');
    expect(p.pkgReadiness.caveats.length).toBeGreaterThan(0);
  });

  it('produces review_ready when all gates pass', () => {
    const p = pipeline();
    expect(p.pkgReadiness.memoStatus).toBe('review_ready');
    expect(p.pkgReadiness.reviewReady).toBe(true);
  });

  it('board readiness depends on memo readiness', () => {
    expect(pipeline().pkgReadiness.boardStatus).toBe('review_ready');
    // Caveated memo → board not ready unless policy allows draft board package.
    expect(pipeline({ facts: without('inventory') }).pkgReadiness.boardStatus).toBe('draft_not_ready');
    expect(pipeline({ facts: without('inventory'), allowDraftBoardPackage: true }).pkgReadiness.boardStatus).toBe('draft_ready_with_caveats');
  });

  it('FDIC readiness depends on the evidence index', () => {
    expect(pipeline().pkgReadiness.fdicStatus).toBe('review_ready');
    expect(pipeline({ facts: without('cash') }).pkgReadiness.fdicStatus).toBe('blocked_missing_evidence');
  });

  it('never produces an approved / submitted / sent state', () => {
    const serialized = JSON.stringify(pipeline().pkgReadiness);
    expect(serialized).not.toMatch(/\b(approved|submitted|filed|exported_final|sent)\b/);
  });
});

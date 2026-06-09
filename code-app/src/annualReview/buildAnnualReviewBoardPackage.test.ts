import { describe, it, expect } from 'vitest';
import { pipeline } from './packageTestFixtures';

/**
 * Phase 141P — board package pins.
 */

describe('Phase 141P — board package', () => {
  it('builds a draft board package from the memo (6 sections)', () => {
    const { board } = pipeline();
    expect(board.sections).toHaveLength(6);
    expect(board.sections.map((s) => s.key)).toContain('board_summary');
  });

  it('is blocked when readiness is blocked', () => {
    expect(pipeline({ facts: [] }).board.status).toBe('blocked_missing_financials');
  });

  it('includes caveats when caveated', () => {
    const p = pipeline({ facts: pipeline().facts.filter((f) => f.metricKey !== 'inventory') });
    expect(p.board.caveats.length).toBeGreaterThan(0);
  });

  it('shows a covenant failure as a finding', () => {
    const p = pipeline({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 99, active: true }] });
    const sec = p.board.sections.find((s) => s.key === 'covenant_exception_summary')!;
    expect(sec.lines.some((l) => /finding/i.test(l))).toBe(true);
  });

  it('uses no approval / ratification language and no final recommendation', () => {
    const { board } = pipeline();
    expect(board.finalCreditRecommendation).toBeNull();
    expect(JSON.stringify(board)).not.toMatch(/\b(ratif|approve credit|recommend approval)\b/i);
  });

  it('fabricates no values', () => {
    expect(JSON.stringify(pipeline().board)).not.toMatch(/\$\s*\d/);
  });
});

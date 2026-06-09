import { describe, it, expect } from 'vitest';
import { pipeline } from './packageTestFixtures';

/**
 * Phase 141P — FDIC / examiner package pins.
 */

describe('Phase 141P — FDIC / examiner package', () => {
  it('builds the examiner package with an evidence inventory (9 sections)', () => {
    const { fdic } = pipeline();
    expect(fdic.sections).toHaveLength(9);
    const inv = fdic.sections.find((s) => s.key === 'evidence_inventory')!;
    expect(inv.lines.length).toBeGreaterThan(0);
  });

  it('lists missing evidence explicitly', () => {
    const p = pipeline({ facts: pipeline().facts.filter((f) => f.metricKey !== 'cash') });
    const sec = p.fdic.sections.find((s) => s.key === 'exceptions_missing_items')!;
    expect(sec.lines.join(' ')).toMatch(/missing|cash/i);
  });

  it('includes covenant testing support', () => {
    const { fdic } = pipeline();
    expect(fdic.sections.map((s) => s.key)).toContain('covenant_testing_support');
  });

  it('includes caveats', () => {
    const { fdic } = pipeline();
    const sec = fdic.sections.find((s) => s.key === 'caveats_unresolved')!;
    expect(sec).toBeDefined();
    expect(sec.caveats.length).toBeGreaterThan(0);
  });

  it('has no filed / submitted / exported state', () => {
    const serialized = JSON.stringify(pipeline().fdic);
    expect(serialized).not.toMatch(/['"](filed|submitted|exported_final)['"]/);
  });

  it('invents no evidence (no dollar literals; sourced inventory)', () => {
    expect(JSON.stringify(pipeline().fdic)).not.toMatch(/\$\s*\d/);
  });
});

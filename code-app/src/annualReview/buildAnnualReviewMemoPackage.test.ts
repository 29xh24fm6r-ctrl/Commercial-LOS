import { describe, it, expect } from 'vitest';
import { pipeline } from './packageTestFixtures';

/**
 * Phase 141P — credit memo package pins.
 */

const REQUIRED_SECTION_KEYS = [
  'executive_summary', 'borrower_relationship_overview', 'loan_exposure_summary',
  'financial_performance', 'covenant_compliance', 'collateral_insurance_tickler',
  'borrower_request_collection_status', 'exceptions_missing_information',
  'servicing_monitoring_recommendations', 'evidence_caveats',
];

describe('Phase 141P — credit memo package', () => {
  it('builds all required sections', () => {
    const { memo } = pipeline();
    const keys = memo.sections.map((s) => s.key);
    for (const k of REQUIRED_SECTION_KEYS) expect(keys).toContain(k);
    expect(memo.sections).toHaveLength(10);
  });

  it('the financial section uses sourced metrics', () => {
    const { memo } = pipeline();
    const fin = memo.sections.find((s) => s.key === 'financial_performance')!;
    expect(fin.evidenceFactIds.length).toBeGreaterThan(0);
  });

  it('the covenant section includes pass/fail/unknown findings', () => {
    const fail = pipeline({ covenants: [{ covenantId: 'C', covenantType: 'dscr', operator: 'gte', thresholdValue: 99, active: true }] });
    const cov = fail.memo.sections.find((s) => s.key === 'covenant_compliance')!;
    expect(cov.lines.some((l) => /fail/.test(l))).toBe(true);
  });

  it('the missing-information section is honest', () => {
    const p = pipeline({ facts: pipeline().facts.filter((f) => f.metricKey !== 'cash') });
    const sec = p.memo.sections.find((s) => s.key === 'exceptions_missing_information')!;
    expect(sec.lines.join(' ')).toMatch(/missing|unknown/i);
  });

  it('preserves evidence references and makes no final credit recommendation / waiver', () => {
    const { memo } = pipeline();
    expect(memo.finalCreditRecommendation).toBeNull();
    const serialized = JSON.stringify(memo);
    expect(serialized).not.toMatch(/\b(approve credit|recommend approval|recommend decline)\b/i);
    expect(serialized).not.toMatch(/\bwaive covenant\b|grantWaiver/i);
  });

  it('fabricates no values (no dollar literals)', () => {
    expect(JSON.stringify(pipeline().memo)).not.toMatch(/\$\s*\d/);
  });
});

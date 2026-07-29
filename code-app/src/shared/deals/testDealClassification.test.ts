import { describe, it, expect } from 'vitest';
import {
  isTestOrSmokeDealName,
  isTestOrSmokeDeal,
  classifyDealRecord,
  partitionDealsByTestClassification,
  operationalDeals,
} from './testDealClassification';

describe('P1-11 — test/smoke deal classification', () => {
  it('classifies the smoke-test naming convention (bracketed tags + explicit phrases)', () => {
    for (const name of [
      '[SMOKE TEST - PHASE 170K] TEST - New Deal Smoke 170K',
      '[QA] Regression deal',
      '[DEMO] Sandbox loan',
      '[DO NOT USE] leftover',
      'Smoke Test Loan',
      'QA test loan',
      'Test Deal 42',
      'DO NOT USE - migration artifact',
      'TEST — Deal Phase 121',
      'STAGE ADVANCEMENT SMOKE',
      'V1 Banker Create Proof Smoke',
      'OGB Full Workflow Test 07172026',
      'SYSTEM TEST - FULL E2E - 2026-07-25',
    ]) {
      expect(isTestOrSmokeDealName(name)).toBe(true);
    }
  });

  it('final-seven-workstreams (2026-07-23) — classifies this repository\'s own controlled test-record convention, "SYSTEM TEST - <description>"', () => {
    for (const name of [
      'SYSTEM TEST - Runbook 1 Stage Advancement Demo',
      '  SYSTEM TEST - leading whitespace',
      'system test - lowercase variant',
      '[SYSTEM TEST] bracketed variant',
    ]) {
      expect(isTestOrSmokeDealName(name)).toBe(true);
    }
  });

  it('does NOT misclassify ordinary deal names (no false positives on the word "test")', () => {
    for (const name of [
      'Acme Expansion',
      'Latest Retail Working Capital',
      'Contest Holdings LLC', // contains "test" as a substring but is not a test deal
      'Greatest Manufacturing Inc',
      'Northwest Testing Labs Term Loan', // a real borrower that happens to do testing
      'System Solutions Testing Corp', // contains "System" and "Testing" but not the "SYSTEM TEST -" prefix
      'We passed the system test - great news', // "system test" appears, but not as the required NAME PREFIX
      undefined,
      null,
      '',
      '   ',
    ]) {
      expect(isTestOrSmokeDealName(name)).toBe(false);
    }
  });

  it('isTestOrSmokeDeal reads the record name', () => {
    expect(isTestOrSmokeDeal({ name: '[SMOKE TEST] x' })).toBe(true);
    expect(isTestOrSmokeDeal({ name: 'Acme' })).toBe(false);
    expect(isTestOrSmokeDeal(undefined)).toBe(false);
  });

  describe('N-17 remediation (Production Remediation Factory Arc Phase 11) — governed isTestRecord field', () => {
    it('an explicit isTestRecord: true wins even for an ordinary-looking name', () => {
      expect(isTestOrSmokeDeal({ name: 'Acme Expansion', isTestRecord: true })).toBe(true);
    });

    it('an explicit false plus a governed controlled name fails safe as a classification conflict', () => {
      const row = { name: '[QA] Regression deal', isTestRecord: false };
      expect(isTestOrSmokeDeal(row)).toBe(true);
      expect(classifyDealRecord(row)).toMatchObject({
        kind: 'classification-conflict',
        reason: 'explicit-false-conflicts-with-governed-name',
      });
    });

    it('an explicit false remains operational when the name has no controlled-record evidence', () => {
      expect(isTestOrSmokeDeal({ name: 'Acme Expansion', isTestRecord: false })).toBe(false);
    });

    it('undefined/null isTestRecord falls back to name matching exactly as before', () => {
      expect(isTestOrSmokeDeal({ name: '[SMOKE TEST] x', isTestRecord: undefined })).toBe(true);
      expect(isTestOrSmokeDeal({ name: '[SMOKE TEST] x', isTestRecord: null })).toBe(true);
      expect(isTestOrSmokeDeal({ name: 'Acme', isTestRecord: undefined })).toBe(false);
    });

    it('operationalDeals honors the governed field per-record, mixed with name-fallback records', () => {
      const deals = [
        { name: 'Acme', isTestRecord: undefined },
        { name: 'Governed Test Record', isTestRecord: true },
        { name: '[SMOKE TEST] name-only record' },
        { name: 'Governed Real Record', isTestRecord: false },
      ];
      expect(operationalDeals(deals).map((d) => d.name)).toEqual(['Acme', 'Governed Real Record']);
    });
  });

  it('keeps legitimate testing-related borrower names operational', () => {
    for (const name of [
      'Northwest Testing Labs Term Loan',
      'System Solutions Testing Corp',
      'Contest Holdings LLC',
      'Smokestack Manufacturing Expansion',
    ]) {
      expect(isTestOrSmokeDealName(name)).toBe(false);
    }
  });

  it('partitions a mixed list, preserving order and never dropping records', () => {
    const deals = [
      { name: 'Acme Expansion', id: 1 },
      { name: '[SMOKE TEST - PHASE 170K] deal', id: 2 },
      { name: 'Globex Term Loan', id: 3 },
      { name: 'Test Deal 9', id: 4 },
    ];
    const { operational, test, conflicts } = partitionDealsByTestClassification(deals);
    expect(operational.map((d) => d.id)).toEqual([1, 3]);
    expect(test.map((d) => d.id)).toEqual([2, 4]);
    // Nothing is deleted — the two partitions cover the whole input.
    expect(operational.length + test.length).toBe(deals.length);
    expect(conflicts).toHaveLength(0);
  });

  it('partitions explicit-false/name conflicts out of operational while preserving them in investigation', () => {
    const conflict = { name: 'SYSTEM TEST - controlled', isTestRecord: false, id: 1 };
    const result = partitionDealsByTestClassification([conflict, { name: 'Acme', id: 2 }]);
    expect(result.operational.map((d) => d.id)).toEqual([2]);
    expect(result.test.map((d) => d.id)).toEqual([1]);
    expect(result.conflicts.map((d) => d.id)).toEqual([1]);
  });

  it('operationalDeals excludes test/smoke by default, and includes them under the admin opt-in', () => {
    const deals = [{ name: 'Acme' }, { name: '[SMOKE TEST] x' }, { name: 'Globex' }];
    expect(operationalDeals(deals).map((d) => d.name)).toEqual(['Acme', 'Globex']);
    expect(operationalDeals(deals, { includeTest: false }).map((d) => d.name)).toEqual(['Acme', 'Globex']);
    // Admin visibility — the full set, evidence preserved.
    expect(operationalDeals(deals, { includeTest: true })).toHaveLength(3);
  });
});

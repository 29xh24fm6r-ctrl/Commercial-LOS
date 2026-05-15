import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  STAGE_AGING_AT_RISK_DAYS,
  CLOSING_SOON_DAYS,
  derivePerBankerActivity,
  summarizePipelineMix,
  summarizeStageAging,
  type AnalyticsDeal,
} from './derivedAnalytics';

/**
 * Phase 71 — shared analytics primitive tests. Pure functions, so
 * every test is a deterministic call against a synthetic deal set.
 * Covers:
 *   - empty input fallback
 *   - missing-field handling (no stage entry date / no amount / no
 *     assigned banker / unparseable date)
 *   - mathematical correctness (averages, medians, percentages)
 *   - sorting determinism
 *   - thresholds match the documented constants
 *   - no SDK import / no role-module import (static-source assertion)
 */

const NOW = new Date('2026-06-15T12:00:00Z');

function deal(overrides: Partial<AnalyticsDeal> = {}): AnalyticsDeal {
  return {
    id: 'd-' + Math.random().toString(36).slice(2, 8),
    name: 'Acme Working Capital',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    stageEntryDate: '2026-05-15T00:00:00Z',
    assignedBankerId: 'banker-1',
    assignedBankerName: 'M. Paller',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// summarizeStageAging
// ---------------------------------------------------------------------------

describe('Phase 71 — summarizeStageAging', () => {
  it('returns all-zero summary for an empty deal set', () => {
    const r = summarizeStageAging([], NOW);
    expect(r.countedDeals).toBe(0);
    expect(r.averageDaysInStage).toBe(0);
    expect(r.medianDaysInStage).toBe(0);
    expect(r.maxDaysInStage).toBe(0);
    expect(r.atRiskCount).toBe(0);
    expect(r.missingStageEntryDateCount).toBe(0);
  });

  it('counts and computes statistics correctly across multiple deals', () => {
    // 4 deals: 10, 30, 60, 90 days in stage.
    const deals = [
      deal({ stageEntryDate: daysAgo(10) }),
      deal({ stageEntryDate: daysAgo(30) }),
      deal({ stageEntryDate: daysAgo(60) }),
      deal({ stageEntryDate: daysAgo(90) }),
    ];
    const r = summarizeStageAging(deals, NOW);
    expect(r.countedDeals).toBe(4);
    // Average: (10 + 30 + 60 + 90) / 4 = 47.5 → rounded to 48.
    expect(r.averageDaysInStage).toBe(48);
    // Median (even N): ((30 + 60) / 2) = 45.
    expect(r.medianDaysInStage).toBe(45);
    expect(r.maxDaysInStage).toBe(90);
    // Deals at or past STAGE_AGING_AT_RISK_DAYS (30): three of four.
    expect(r.atRiskCount).toBe(3);
    expect(r.missingStageEntryDateCount).toBe(0);
  });

  it('counts missing stageEntryDate honestly without skewing averages', () => {
    const deals = [
      deal({ stageEntryDate: daysAgo(10) }),
      deal({ stageEntryDate: undefined }),
      deal({ stageEntryDate: 'not-a-date' }),
    ];
    const r = summarizeStageAging(deals, NOW);
    expect(r.countedDeals).toBe(1);
    expect(r.averageDaysInStage).toBe(10);
    expect(r.missingStageEntryDateCount).toBe(2);
  });

  it('treats stage-entry dates in the future as missing (defensive)', () => {
    const deals = [
      deal({ stageEntryDate: daysAgo(-7) /* 7 days in future */ }),
      deal({ stageEntryDate: daysAgo(20) }),
    ];
    const r = summarizeStageAging(deals, NOW);
    expect(r.countedDeals).toBe(1);
    expect(r.missingStageEntryDateCount).toBe(1);
  });

  it('STAGE_AGING_AT_RISK_DAYS constant is 30 (matches teamSignals + workQueue thresholds)', () => {
    expect(STAGE_AGING_AT_RISK_DAYS).toBe(30);
  });

  it('uses median = single middle value for odd N', () => {
    const deals = [
      deal({ stageEntryDate: daysAgo(5) }),
      deal({ stageEntryDate: daysAgo(20) }),
      deal({ stageEntryDate: daysAgo(50) }),
    ];
    const r = summarizeStageAging(deals, NOW);
    expect(r.medianDaysInStage).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// summarizePipelineMix
// ---------------------------------------------------------------------------

describe('Phase 71 — summarizePipelineMix', () => {
  it('returns zero summary for an empty deal set', () => {
    const r = summarizePipelineMix([]);
    expect(r.distinctStages).toBe(0);
    expect(r.distinctBankers).toBe(0);
    expect(r.unassignedDealCount).toBe(0);
    expect(r.missingStageCount).toBe(0);
    expect(r.topBankerPipelineSharePct).toBe(0);
    expect(r.topBankerDealCountSharePct).toBe(0);
  });

  it('counts distinct stages and bankers correctly', () => {
    const deals = [
      deal({ stage: 'Application', assignedBankerId: 'b-1' }),
      deal({ stage: 'Underwriting', assignedBankerId: 'b-1' }),
      deal({ stage: 'Underwriting', assignedBankerId: 'b-2' }),
      deal({ stage: 'Closing', assignedBankerId: 'b-2' }),
    ];
    const r = summarizePipelineMix(deals);
    expect(r.distinctStages).toBe(3);
    expect(r.distinctBankers).toBe(2);
  });

  it('surfaces unassigned and missing-stage counts honestly', () => {
    const deals = [
      deal({ stage: 'Application', assignedBankerId: 'b-1' }),
      deal({ stage: undefined, assignedBankerId: 'b-1' }),
      deal({ stage: '   ', assignedBankerId: undefined }),
      deal({ stage: 'Closing', assignedBankerId: '' }),
    ];
    const r = summarizePipelineMix(deals);
    expect(r.missingStageCount).toBe(2); // undefined + blank
    expect(r.unassignedDealCount).toBe(2); // undefined + empty string
  });

  it('top-banker pipeline share is the larger banker volume divided by total', () => {
    const deals = [
      deal({ assignedBankerId: 'b-1', amount: 1_000_000 }),
      deal({ assignedBankerId: 'b-1', amount: 2_000_000 }),
      deal({ assignedBankerId: 'b-2', amount: 1_000_000 }),
    ];
    const r = summarizePipelineMix(deals);
    // total = 4M; top-banker (b-1) = 3M → 75%
    expect(r.topBankerPipelineSharePct).toBe(75);
  });

  it('top-banker deal-count share excludes unassigned deals from the denominator', () => {
    const deals = [
      deal({ assignedBankerId: 'b-1' }),
      deal({ assignedBankerId: 'b-1' }),
      deal({ assignedBankerId: 'b-1' }),
      deal({ assignedBankerId: 'b-2' }),
      deal({ assignedBankerId: undefined }),
      deal({ assignedBankerId: '' }),
    ];
    const r = summarizePipelineMix(deals);
    // Assigned: 4 (3 to b-1, 1 to b-2). Top share = 3/4 = 75.
    expect(r.topBankerDealCountSharePct).toBe(75);
    expect(r.unassignedDealCount).toBe(2);
  });

  it('share returns 0 when no amount data is present (no NaN)', () => {
    const deals = [
      deal({ assignedBankerId: 'b-1', amount: undefined }),
      deal({ assignedBankerId: 'b-2', amount: undefined }),
    ];
    const r = summarizePipelineMix(deals);
    expect(r.topBankerPipelineSharePct).toBe(0);
    expect(Number.isFinite(r.topBankerPipelineSharePct)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// derivePerBankerActivity
// ---------------------------------------------------------------------------

describe('Phase 71 — derivePerBankerActivity', () => {
  it('returns empty array for empty deal set', () => {
    expect(derivePerBankerActivity([], NOW)).toEqual([]);
  });

  it('skips deals with no assignedBankerId (no synthetic "unassigned" row)', () => {
    const deals = [
      deal({ assignedBankerId: undefined }),
      deal({ assignedBankerId: '' }),
    ];
    expect(derivePerBankerActivity(deals, NOW)).toEqual([]);
  });

  it('groups deals by banker and totals deals + amount', () => {
    const deals = [
      deal({
        assignedBankerId: 'b-1',
        assignedBankerName: 'Alice',
        amount: 2_000_000,
        stageEntryDate: daysAgo(10),
      }),
      deal({
        assignedBankerId: 'b-1',
        assignedBankerName: 'Alice',
        amount: 1_000_000,
        stageEntryDate: daysAgo(40),
      }),
      deal({
        assignedBankerId: 'b-2',
        assignedBankerName: 'Bob',
        amount: 500_000,
        stageEntryDate: daysAgo(60),
      }),
    ];
    const rows = derivePerBankerActivity(deals, NOW);
    expect(rows).toHaveLength(2);
    // Alice goes first because she has more deals (2 vs 1).
    expect(rows[0]!.bankerId).toBe('b-1');
    expect(rows[0]!.bankerName).toBe('Alice');
    expect(rows[0]!.totalDeals).toBe(2);
    expect(rows[0]!.totalAmount).toBe(3_000_000);
    expect(rows[0]!.dealsMissingAmount).toBe(0);
    // Average days in stage: (10 + 40) / 2 = 25.
    expect(rows[0]!.averageDaysInStage).toBe(25);
    // Stage-at-risk count: 1 of Alice's deals is >= 30 days.
    expect(rows[0]!.stageAtRiskCount).toBe(1);
    expect(rows[1]!.bankerId).toBe('b-2');
    expect(rows[1]!.bankerName).toBe('Bob');
    expect(rows[1]!.totalDeals).toBe(1);
  });

  it('counts dealsMissingAmount honestly', () => {
    const deals = [
      deal({ assignedBankerId: 'b-1', amount: undefined }),
      deal({ assignedBankerId: 'b-1', amount: 500_000 }),
    ];
    const r = derivePerBankerActivity(deals, NOW)[0]!;
    expect(r.totalAmount).toBe(500_000);
    expect(r.dealsMissingAmount).toBe(1);
  });

  it('counts closing-soon when target close is within CLOSING_SOON_DAYS', () => {
    const deals = [
      // 10 days out → counted.
      deal({ assignedBankerId: 'b-1', targetCloseDate: daysFromNow(10) }),
      // 14 days out → boundary; counted (<=).
      deal({ assignedBankerId: 'b-1', targetCloseDate: daysFromNow(14) }),
      // 15 days out → not counted.
      deal({ assignedBankerId: 'b-1', targetCloseDate: daysFromNow(15) }),
      // Already past → not counted (closing-soon is upcoming only).
      deal({ assignedBankerId: 'b-1', targetCloseDate: daysAgo(3) }),
      // Missing target close → not counted.
      deal({ assignedBankerId: 'b-1', targetCloseDate: undefined }),
    ];
    const r = derivePerBankerActivity(deals, NOW)[0]!;
    expect(r.closingSoonCount).toBe(2);
  });

  it('sorts rows by totalDeals desc, then bankerName asc (deterministic)', () => {
    const deals = [
      deal({ assignedBankerId: 'b-zoe', assignedBankerName: 'Zoe' }),
      deal({ assignedBankerId: 'b-alice', assignedBankerName: 'Alice' }),
      deal({ assignedBankerId: 'b-alice', assignedBankerName: 'Alice' }),
      deal({ assignedBankerId: 'b-bob', assignedBankerName: 'Bob' }),
    ];
    const rows = derivePerBankerActivity(deals, NOW);
    expect(rows.map((r) => r.bankerName)).toEqual(['Alice', 'Bob', 'Zoe']);
  });

  it('CLOSING_SOON_DAYS constant is 14 (matches workQueue/primitives threshold)', () => {
    expect(CLOSING_SOON_DAYS).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Module hygiene — pure derivation; no SDK / role-module / power-apps imports.
// ---------------------------------------------------------------------------

describe('Phase 71 — derivedAnalytics module hygiene', () => {
  it('does NOT import any SDK service, role module, or @microsoft/power-apps', () => {
    const src = readFileSync(
      resolve(__dirname, 'derivedAnalytics.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/from\s+['"][^'"]*generated\/services/);
    expect(src).not.toMatch(
      /from\s+['"][^'"]*\/(?:admin|banker|deals|manager|team|executive)\//,
    );
    expect(src).not.toMatch(/from\s+['"]@microsoft\/power-apps/);
  });

  it('exposes only the three documented primitives + the threshold constants', () => {
    // Anchor: the module's public surface stays small. If a future
    // phase adds a public primitive, this assertion forces an
    // explicit update so the analytics surface doesn't drift.
    const src = readFileSync(
      resolve(__dirname, 'derivedAnalytics.ts'),
      'utf8',
    );
    const exportedNames = Array.from(
      src.matchAll(/^export\s+(?:async\s+)?(?:function|const|interface|type)\s+(\w+)/gm),
    ).map((m) => m[1]!);
    expect(exportedNames.sort()).toEqual(
      [
        'AnalyticsDeal',
        'CLOSING_SOON_DAYS',
        'PerBankerActivity',
        'PipelineMixSummary',
        'STAGE_AGING_AT_RISK_DAYS',
        'StageAgingSummary',
        'derivePerBankerActivity',
        'summarizePipelineMix',
        'summarizeStageAging',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

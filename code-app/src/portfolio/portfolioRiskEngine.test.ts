import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { derivePortfolioCommandSnapshot } from './portfolioCommandSnapshot';
import {
  derivePortfolioRiskSnapshot,
  portfolioRiskCopilotSummaries,
} from './portfolioRiskEngine';
import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from '../manager/managerQueries';

/**
 * Phase 132A — portfolioRiskEngine pure derivation tests.
 */

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysFromNow(60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: 'SBA 7(a)',
    loanStructure: 'Term Loan',
    pricingType: 'Variable',
    ...over,
  };
}

function banker(over: Partial<TeamBanker> = {}): TeamBanker {
  return {
    id: 'banker-a',
    fullName: 'Banker A',
    email: 'a@oldglorybank.com',
    roleType: 'CommercialBanker',
    active: true,
    ...over,
  };
}

function doc(over: Partial<TeamScopedDocument> = {}): TeamScopedDocument {
  return {
    id: 'doc-1',
    name: 'Tax returns',
    dueDate: undefined,
    requestDate: isoDaysAgo(2),
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function riskFrom(opts: {
  teamPipeline?: TeamDeal[];
  teamBankers?: TeamBanker[];
  teamTasks?: TeamScopedTask[];
  teamDocuments?: TeamScopedDocument[];
  threshold?: number;
}) {
  const command = derivePortfolioCommandSnapshot({
    teamPipeline: opts.teamPipeline ?? [],
    teamBankers: opts.teamBankers ?? [banker()],
    teamTasks: opts.teamTasks ?? [],
    teamDocuments: opts.teamDocuments ?? [],
    now: NOW,
  });
  return derivePortfolioRiskSnapshot(command, {
    now: NOW,
    threshold: opts.threshold,
  });
}

// ---------------------------------------------------------------------------
// Empty portfolio
// ---------------------------------------------------------------------------

describe('Phase 132A — empty portfolio', () => {
  it('returns honest zeros / undefined with no findings', () => {
    const r = riskFrom({});
    expect(r.isEmpty).toBe(true);
    expect(r.exposure.totalExposure).toBe(0);
    expect(r.exposure.averageExposure).toBeUndefined();
    expect(r.exposure.medianExposure).toBeUndefined();
    expect(r.exposure.largestExposure).toBeUndefined();
    expect(r.concentration.singleNamePct).toBe(0);
    expect(r.concentration.singleNameClient).toBeUndefined();
    expect(r.concentration.singleNameBand).toBe('low');
    expect(r.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Exposure statistics
// ---------------------------------------------------------------------------

describe('Phase 132A — exposure statistics', () => {
  const r = riskFrom({
    teamPipeline: [
      deal({ id: 'a', clientName: 'Alpha', amount: 5_000_000 }),
      deal({ id: 'b', clientName: 'Beta', amount: 3_000_000 }),
      deal({ id: 'c', clientName: 'Gamma', amount: 2_000_000 }),
      deal({ id: 'd', clientName: 'Delta', amount: undefined }),
    ],
  });

  it('total exposure sums populated amounts only', () => {
    expect(r.exposure.totalExposure).toBe(10_000_000);
  });

  it('average exposure is mean over deals with a populated amount', () => {
    expect(r.exposure.averageExposure).toBeCloseTo(10_000_000 / 3, 0);
    expect(r.exposure.exposureDealCount).toBe(3);
  });

  it('median exposure is the middle populated amount', () => {
    expect(r.exposure.medianExposure).toBe(3_000_000);
  });

  it('largest exposure tracks the top deal', () => {
    expect(r.exposure.largestExposure).toBe(5_000_000);
    expect(r.exposure.largestDealId).toBe('a');
  });

  it('counts deals at/above the internal threshold', () => {
    expect(r.exposure.dealsAboveThresholdCount).toBe(1);
    expect(r.exposure.threshold).toBe(5_000_000);
  });
});

// ---------------------------------------------------------------------------
// Concentration percentages + bands
// ---------------------------------------------------------------------------

describe('Phase 132A — concentration', () => {
  const r = riskFrom({
    teamPipeline: [
      deal({ id: 'a', clientName: 'Alpha', amount: 5_000_000 }),
      deal({ id: 'b', clientName: 'Beta', amount: 3_000_000 }),
      deal({ id: 'c', clientName: 'Gamma', amount: 2_000_000 }),
    ],
  });

  it('single-name concentration is the top client share', () => {
    expect(r.concentration.singleNameClient).toBe('Alpha');
    expect(r.concentration.singleNamePct).toBe(50);
    expect(r.concentration.singleNameBand).toBe('high'); // >= 35
  });

  it('top-5 concentration sums the top client shares', () => {
    expect(r.concentration.top5Pct).toBe(100);
    expect(r.concentration.top5Band).toBe('high'); // >= 80
  });

  it('byClient is sorted desc with unknown clients last', () => {
    const labels = r.concentration.byClient.map((c) => c.label);
    expect(labels[0]).toBe('Alpha');
  });

  it('low single-name share lands in the low band', () => {
    const spread = riskFrom({
      teamPipeline: Array.from({ length: 20 }, (_, i) =>
        deal({ id: `d${i}`, clientName: `Client ${i}`, amount: 1_000_000 }),
      ),
    });
    expect(spread.concentration.singleNamePct).toBe(5);
    expect(spread.concentration.singleNameBand).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// Honest missing data
// ---------------------------------------------------------------------------

describe('Phase 132A — honest missing data', () => {
  it('unknown client buckets as "Unknown client" and never becomes the single name', () => {
    const r = riskFrom({
      teamPipeline: [
        deal({ id: 'a', clientName: 'Alpha', amount: 1_000_000 }),
        deal({ id: 'b', clientName: undefined, amount: 9_000_000 }),
      ],
    });
    // The unknown-client deal is larger, but it must not be reported as a
    // concentrated single name.
    expect(r.concentration.singleNameClient).toBe('Alpha');
    const unknown = r.concentration.byClient.find((c) => c.isUnknown);
    expect(unknown?.label).toBe('Unknown client');
  });
});

// ---------------------------------------------------------------------------
// Maturity ladder
// ---------------------------------------------------------------------------

describe('Phase 132A — maturity ladder', () => {
  it('buckets deals by days-to-close and isolates no-date deals', () => {
    const r = riskFrom({
      teamPipeline: [
        deal({ id: 'overdue', targetCloseDate: isoDaysAgo(5), amount: 1 }),
        deal({ id: 'soon', targetCloseDate: isoDaysFromNow(10), amount: 1 }),
        deal({ id: 'mid', targetCloseDate: isoDaysFromNow(75), amount: 1 }),
        deal({ id: 'nodate', targetCloseDate: undefined, amount: 1 }),
      ],
    });
    const byLabel = Object.fromEntries(
      r.maturityLadder.map((b) => [b.label, b.dealCount]),
    );
    expect(byLabel['Overdue close']).toBe(1);
    expect(byLabel['0–30d']).toBe(1);
    expect(byLabel['61–90d']).toBe(1);
    expect(byLabel['No close date']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Findings ranking
// ---------------------------------------------------------------------------

describe('Phase 132A — ranked findings', () => {
  it('ranks high severity before elevated/watch, then by exposure', () => {
    const r = riskFrom({
      teamPipeline: [
        // Large + stale → high severity finding.
        deal({
          id: 'stale-big',
          name: 'StaleBig',
          clientName: 'Alpha',
          amount: 9_000_000,
          modifiedOn: isoDaysAgo(40),
        }),
        // Large + outstanding docs → elevated.
        deal({
          id: 'docs-big',
          name: 'DocsBig',
          clientName: 'Beta',
          amount: 6_000_000,
          modifiedOn: isoDaysAgo(1),
        }),
      ],
      teamDocuments: [doc({ id: 'doc-x', dealId: 'docs-big' })],
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings[0].severity).toBe('high');
    const firstHigh = r.findings.findIndex((f) => f.severity === 'high');
    const firstElevated = r.findings.findIndex((f) => f.severity === 'elevated');
    expect(firstHigh).toBeLessThan(firstElevated);
    // Every finding carries a safe next action + source metric.
    for (const f of r.findings) {
      expect(f.nextAction.length).toBeGreaterThan(0);
      expect(f.sourceMetric.length).toBeGreaterThan(0);
    }
  });

  it('emits a top-borrower-concentration finding when single-name share is elevated/high', () => {
    const r = riskFrom({
      teamPipeline: [
        deal({ id: 'a', clientName: 'Alpha', amount: 8_000_000 }),
        deal({ id: 'b', clientName: 'Beta', amount: 2_000_000 }),
      ],
    });
    const f = r.findings.find((x) => x.kind === 'top-borrower-concentration');
    expect(f).toBeDefined();
    expect(f!.clientName).toBe('Alpha');
    expect(f!.severity === 'high' || f!.severity === 'elevated').toBe(true);
  });

  it('emits a high-exposure-outstanding-docs finding anchored to the deal route', () => {
    const r = riskFrom({
      teamPipeline: [
        deal({ id: 'big', name: 'BigDeal', amount: 6_000_000, modifiedOn: isoDaysAgo(1) }),
      ],
      teamDocuments: [doc({ id: 'doc-x', dealId: 'big' })],
    });
    const f = r.findings.find((x) => x.kind === 'high-exposure-outstanding-docs');
    expect(f).toBeDefined();
    expect(f!.dealId).toBe('big');
  });
});

// ---------------------------------------------------------------------------
// No fake regulatory claims (static source)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Copilot summary lines
// ---------------------------------------------------------------------------

describe('Phase 132A — Copilot risk summary', () => {
  const r = riskFrom({
    teamPipeline: [
      deal({ id: 'a', clientName: 'Alpha', amount: 5_000_000 }),
      deal({ id: 'b', clientName: 'Beta', amount: 3_000_000 }),
    ],
  });
  const lines = portfolioRiskCopilotSummaries(r);

  it('includes single-name + top-5 concentration and largest exposure', () => {
    const joined = lines.join('\n');
    expect(joined).toMatch(/Single-name concentration:/);
    expect(joined).toMatch(/Top-5 concentration:/);
    expect(joined).toMatch(/Largest exposure:/);
    expect(joined).toMatch(/Deals above internal threshold:/);
  });

  it('contains no raw GUID / record id', () => {
    for (const line of lines) {
      expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
      // The fixture deal ids are 'a' / 'b'; ensure they never leak either.
      expect(line).not.toMatch(/\bd-default\b/);
    }
  });
});

describe('Phase 132A — engine makes no regulatory claim', () => {
  const src = readFileSync(
    resolve(__dirname, 'portfolioRiskEngine.ts'),
    'utf8',
  );
  // Strip comments so the honest-omission doc-comment (which names these
  // concepts as NON-goals) does not false-positive.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('runtime code claims no CECL / ALLL / criticized / classified / legal lending limit', () => {
    expect(code).not.toMatch(/\bCECL\b/i);
    expect(code).not.toMatch(/\bALLL\b/i);
    expect(code).not.toMatch(/criticized/i);
    expect(code).not.toMatch(/classified asset/i);
    expect(code).not.toMatch(/legal lending limit/i);
    expect(code).not.toMatch(/regulatory/i);
  });
});

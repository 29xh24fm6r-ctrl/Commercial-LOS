import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveManagerPipelineSnapshot,
  MANAGER_STALE_DEAL_DAYS,
} from './managerPipelineSnapshot';
import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from './managerQueries';

/**
 * Phase 124A — deriveManagerPipelineSnapshot tests.
 *
 * Pins:
 *   - command-strip counts (active / amount / missing / blocked-at-risk
 *     / outstanding docs / open tasks);
 *   - exception tape classification: blocked → at-risk → missing-fields
 *     → stale, mutually exclusive, in that priority;
 *   - banker workload: roster bankers retained even at zero load,
 *     aggregated bankers from deals merged in, unassigned bucket for
 *     deals with no banker, sort by total amount desc;
 *   - top deals sorted by amount desc, capped at topN, with
 *     blockerStatus + nextBestAction projected through the shared
 *     Phase-123A VM;
 *   - honest-empty when teamPipeline is [];
 *   - missing amounts contribute 0 (no fake substitution);
 *   - injectable `now` for deterministic staleness;
 *   - static-source discipline: no fake-fallback strings, no
 *     hardcoded sample data, projection routes through the shared
 *     deriveDealIntelligenceViewModel.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-02T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-default',
    name: 'Default deal',
    clientName: 'Default client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: isoDaysAgo(-60),
    stageEntryDate: isoDaysAgo(7),
    modifiedOn: isoDaysAgo(1),
    assignedBankerId: 'banker-a',
    assignedBankerName: 'Banker A',
    collateralSummary: undefined,
    productType: undefined,
    loanStructure: undefined,
    pricingType: undefined,
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

function task(over: Partial<TeamScopedTask> = {}): TeamScopedTask {
  return {
    id: 't-default',
    title: 'Task',
    completed: false,
    dueDate: isoDaysAgo(-3),
    assigneeName: undefined,
    modifiedOn: isoDaysAgo(1),
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function doc(over: Partial<TeamScopedDocument> = {}): TeamScopedDocument {
  return {
    id: 'doc-default',
    name: 'Document',
    dueDate: isoDaysAgo(-7),
    requestDate: isoDaysAgo(14),
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: isoDaysAgo(1),
    status: 'outstanding',
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function snapshot(opts: {
  teamPipeline?: TeamDeal[];
  teamBankers?: TeamBanker[];
  teamTasks?: TeamScopedTask[];
  teamDocuments?: TeamScopedDocument[];
  topN?: number;
}) {
  return deriveManagerPipelineSnapshot({
    teamPipeline: opts.teamPipeline ?? [],
    teamBankers: opts.teamBankers ?? [],
    teamTasks: opts.teamTasks ?? [],
    teamDocuments: opts.teamDocuments ?? [],
    now: NOW,
    topN: opts.topN,
  });
}

// ---------------------------------------------------------------------------
// Empty / honest absence
// ---------------------------------------------------------------------------

describe('Phase 124A — empty state', () => {
  it('returns isEmpty=true and zeroed strip when no team pipeline', () => {
    const s = snapshot({});
    expect(s.isEmpty).toBe(true);
    expect(s.commandStrip.activeDealCount).toBe(0);
    expect(s.commandStrip.totalPipelineAmount).toBe(0);
    expect(s.commandStrip.missingDataCount).toBe(0);
    expect(s.commandStrip.blockerAtRiskCount).toBe(0);
    expect(s.commandStrip.outstandingDocumentCount).toBe(0);
    expect(s.commandStrip.openTaskCount).toBe(0);
    expect(s.exceptionTape.blocked).toHaveLength(0);
    expect(s.exceptionTape.atRisk).toHaveLength(0);
    expect(s.exceptionTape.missingFields).toHaveLength(0);
    expect(s.exceptionTape.stale).toHaveLength(0);
    expect(s.topDeals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Command strip
// ---------------------------------------------------------------------------

describe('Phase 124A — command strip', () => {
  it('counts active deals from the pipeline length', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd1' }), deal({ id: 'd2' }), deal({ id: 'd3' })],
    });
    expect(s.commandStrip.activeDealCount).toBe(3);
  });

  it('sums populated amounts and treats undefined amounts as 0 (no fake substitution)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', amount: 1_000_000 }),
        deal({ id: 'd2', amount: 250_000 }),
        deal({ id: 'd3', amount: undefined }),
      ],
    });
    expect(s.commandStrip.totalPipelineAmount).toBe(1_250_000);
  });

  it('counts deals with missing required fields (uses shared blocker pipeline missing-required signal)', () => {
    const s = snapshot({
      teamPipeline: [
        // d1 missing amount → missing-required fires
        deal({ id: 'd1', amount: undefined }),
        // d2 fully populated → no missing-required
        deal({ id: 'd2' }),
      ],
    });
    expect(s.commandStrip.missingDataCount).toBe(1);
  });

  it('counts blocked + at-risk deals together', () => {
    const s = snapshot({
      teamPipeline: [
        // d1 — past target close > 7 days → blocked
        deal({ id: 'd1', targetCloseDate: isoDaysAgo(10) }),
        // d2 — past target close 1 day → at-risk
        deal({ id: 'd2', targetCloseDate: isoDaysAgo(1) }),
        // d3 — clear
        deal({ id: 'd3' }),
      ],
    });
    expect(s.commandStrip.blockerAtRiskCount).toBe(2);
  });

  it('sums outstanding documents across the team pipeline', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd1' }), deal({ id: 'd2' })],
      teamDocuments: [
        doc({ id: 'doc1', dealId: 'd1' }),
        doc({ id: 'doc2', dealId: 'd1' }),
        doc({ id: 'doc3', dealId: 'd2' }),
        doc({ id: 'doc4', dealId: 'd2', status: 'received' }),
      ],
    });
    expect(s.commandStrip.outstandingDocumentCount).toBe(3);
  });

  it('sums open (non-completed) tasks across the team pipeline', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd1' })],
      teamTasks: [
        task({ id: 't1', dealId: 'd1' }),
        task({ id: 't2', dealId: 'd1' }),
        task({ id: 't3', dealId: 'd1', completed: true }),
      ],
    });
    expect(s.commandStrip.openTaskCount).toBe(2);
  });

  // Phase 125A — new dense KPI fields.

  it('Phase 125A — splits blocked vs at-risk counts on the ribbon', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', targetCloseDate: isoDaysAgo(10) }), // blocked
        deal({ id: 'd2', targetCloseDate: isoDaysAgo(2) }), // at-risk
        deal({ id: 'd3', targetCloseDate: isoDaysAgo(8) }), // blocked
        deal({ id: 'd4' }), // clear
      ],
    });
    expect(s.commandStrip.blockedDealCount).toBe(2);
    expect(s.commandStrip.atRiskDealCount).toBe(1);
    expect(s.commandStrip.blockerAtRiskCount).toBe(3);
  });

  it('Phase 125A — overdueTaskCount = open tasks with dueDate past now', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd1' })],
      teamTasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(3) }), // overdue
        task({ id: 't2', dealId: 'd1', dueDate: isoDaysAgo(-5) }), // future
        task({ id: 't3', dealId: 'd1', completed: true, dueDate: isoDaysAgo(99) }), // completed
        task({ id: 't4', dealId: 'd1', dueDate: undefined }), // no date
      ],
    });
    expect(s.commandStrip.overdueTaskCount).toBe(1);
  });

  it('Phase 125A — staleDealCount counts deals whose modifiedOn ≥ 14 days', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd-stale', modifiedOn: isoDaysAgo(20) }),
        deal({ id: 'd-fresh', modifiedOn: isoDaysAgo(2) }),
        deal({ id: 'd-edge', modifiedOn: isoDaysAgo(14) }),
      ],
    });
    expect(s.commandStrip.staleDealCount).toBe(2);
  });

  it('Phase 125A — closingNext30DayCount + amount cover deals with targetCloseDate in [now, now+30d]', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', targetCloseDate: isoDaysAgo(-10), amount: 100_000 }), // in 10d → counts
        deal({ id: 'd2', targetCloseDate: isoDaysAgo(-25), amount: 200_000 }), // in 25d → counts
        deal({ id: 'd3', targetCloseDate: isoDaysAgo(-45), amount: 999_000 }), // in 45d → excluded
        deal({ id: 'd4', targetCloseDate: isoDaysAgo(2), amount: 555_000 }), // past → excluded
      ],
    });
    expect(s.commandStrip.closingNext30DayCount).toBe(2);
    expect(s.commandStrip.closingNext30DayAmount).toBe(300_000);
  });

  it('Phase 125A — avgDaysInStage is undefined when no deal has stageEntryDate (honest absence)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', stageEntryDate: undefined }),
        deal({ id: 'd2', stageEntryDate: undefined }),
      ],
    });
    expect(s.commandStrip.avgDaysInStage).toBeUndefined();
  });

  it('Phase 125A — avgDaysInStage is the rounded mean of days-in-stage across deals that have one', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', stageEntryDate: isoDaysAgo(5) }),
        deal({ id: 'd2', stageEntryDate: isoDaysAgo(15) }),
        deal({ id: 'd3', stageEntryDate: isoDaysAgo(25) }),
      ],
    });
    expect(s.commandStrip.avgDaysInStage).toBe(15);
  });

  it('Phase 125A — snapshot exposes vmRows for chart helpers (no IO duplication)', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd1' }), deal({ id: 'd2' })],
    });
    expect(s.vmRows).toHaveLength(2);
    expect(s.vmRows.map((r) => r.teamDeal.id)).toEqual(['d1', 'd2']);
  });
});

// ---------------------------------------------------------------------------
// Exception tape — mutually exclusive priority
// ---------------------------------------------------------------------------

describe('Phase 124A — exception tape', () => {
  it('classifies blocked deals first (target close > 7 days past)', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd-blocked', targetCloseDate: isoDaysAgo(10) })],
    });
    expect(s.exceptionTape.blocked).toHaveLength(1);
    expect(s.exceptionTape.blocked[0].dealId).toBe('d-blocked');
    expect(s.exceptionTape.blocked[0].severity).toBe('blocked');
    expect(s.exceptionTape.atRisk).toHaveLength(0);
    expect(s.exceptionTape.missingFields).toHaveLength(0);
    expect(s.exceptionTape.stale).toHaveLength(0);
  });

  it('classifies at-risk deals (past target close, < 7 days)', () => {
    const s = snapshot({
      teamPipeline: [deal({ id: 'd-atrisk', targetCloseDate: isoDaysAgo(2) })],
    });
    expect(s.exceptionTape.atRisk).toHaveLength(1);
    expect(s.exceptionTape.atRisk[0].dealId).toBe('d-atrisk');
    expect(s.exceptionTape.blocked).toHaveLength(0);
  });

  it('classifies missing-fields deals AFTER blocked / at-risk (mutually exclusive)', () => {
    const s = snapshot({
      teamPipeline: [
        // missing amount → missing-required signal fires, but no
        // blocker / at-risk signal → lands in the missing bucket
        deal({ id: 'd-missing', amount: undefined, modifiedOn: isoDaysAgo(1) }),
        // missing amount + past close 10 days → blocked wins, missing
        // does NOT also fire
        deal({
          id: 'd-blocked-and-missing',
          amount: undefined,
          targetCloseDate: isoDaysAgo(10),
        }),
      ],
    });
    expect(s.exceptionTape.missingFields).toHaveLength(1);
    expect(s.exceptionTape.missingFields[0].dealId).toBe('d-missing');
    expect(s.exceptionTape.blocked).toHaveLength(1);
    expect(s.exceptionTape.blocked[0].dealId).toBe('d-blocked-and-missing');
  });

  it('classifies stale deals (modifiedOn >= MANAGER_STALE_DEAL_DAYS) AFTER everything else', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-stale',
          modifiedOn: isoDaysAgo(MANAGER_STALE_DEAL_DAYS + 1),
        }),
        // Also stale but missing fields → missing bucket wins
        deal({
          id: 'd-stale-and-missing',
          amount: undefined,
          modifiedOn: isoDaysAgo(MANAGER_STALE_DEAL_DAYS + 1),
        }),
      ],
    });
    expect(s.exceptionTape.stale).toHaveLength(1);
    expect(s.exceptionTape.stale[0].dealId).toBe('d-stale');
    expect(s.exceptionTape.stale[0].reason).toMatch(/No record activity/);
    expect(s.exceptionTape.missingFields).toHaveLength(1);
    expect(s.exceptionTape.missingFields[0].dealId).toBe('d-stale-and-missing');
  });

  it('does NOT classify a deal as stale when it sits one day below the threshold', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd-fresh', modifiedOn: isoDaysAgo(MANAGER_STALE_DEAL_DAYS - 1) }),
      ],
    });
    expect(s.exceptionTape.stale).toHaveLength(0);
  });

  it('every exception row carries banker / amount / honest reason copy', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-blocked',
          targetCloseDate: isoDaysAgo(10),
          assignedBankerName: 'Banker X',
          amount: 750_000,
        }),
      ],
    });
    const row = s.exceptionTape.blocked[0];
    expect(row.bankerName).toBe('Banker X');
    expect(row.amount).toBe(750_000);
    expect(row.reason).not.toMatch(/^undefined$/);
    expect(row.reason).not.toMatch(/^Not set$/);
    expect(row.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Banker workload
// ---------------------------------------------------------------------------

describe('Phase 124A — banker workload', () => {
  it('retains roster bankers with zero deals (honest 0 of N)', () => {
    const s = snapshot({
      teamPipeline: [],
      teamBankers: [
        banker({ id: 'b1', fullName: 'Alice' }),
        banker({ id: 'b2', fullName: 'Bob' }),
      ],
    });
    // isEmpty=true short-circuits the cockpit render, but the snapshot
    // still carries the roster so the cockpit can show "0 deals" when
    // present-but-quiet teams are surfaced in a later phase.
    expect(s.bankerWorkload.map((r) => r.bankerId).sort()).toEqual(['b1', 'b2']);
    expect(s.bankerWorkload.every((r) => r.activeDealCount === 0)).toBe(true);
  });

  it('aggregates per-banker deal count + amount + work + at-risk', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', assignedBankerId: 'b1', assignedBankerName: 'Alice', amount: 500_000 }),
        deal({ id: 'd2', assignedBankerId: 'b1', assignedBankerName: 'Alice', amount: 300_000 }),
        deal({
          id: 'd3',
          assignedBankerId: 'b2',
          assignedBankerName: 'Bob',
          amount: 1_000_000,
          targetCloseDate: isoDaysAgo(10), // blocked
        }),
      ],
      teamBankers: [
        banker({ id: 'b1', fullName: 'Alice' }),
        banker({ id: 'b2', fullName: 'Bob' }),
      ],
      teamTasks: [task({ id: 't1', dealId: 'd1' }), task({ id: 't2', dealId: 'd3' })],
      teamDocuments: [doc({ id: 'doc1', dealId: 'd1' })],
    });
    // Sort: total amount desc → Bob (1M) then Alice (800k)
    expect(s.bankerWorkload.map((r) => r.bankerId)).toEqual(['b2', 'b1']);
    const bob = s.bankerWorkload[0];
    expect(bob.activeDealCount).toBe(1);
    expect(bob.totalAmount).toBe(1_000_000);
    expect(bob.openTaskCount).toBe(1);
    expect(bob.atRiskCount).toBe(1);
    const alice = s.bankerWorkload[1];
    expect(alice.activeDealCount).toBe(2);
    expect(alice.totalAmount).toBe(800_000);
    expect(alice.openTaskCount).toBe(1);
    expect(alice.outstandingDocumentCount).toBe(1);
  });

  it('synthesizes an Unassigned bucket for deals with no banker', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-orphan',
          assignedBankerId: undefined,
          assignedBankerName: undefined,
          amount: 200_000,
        }),
      ],
      teamBankers: [],
    });
    const unassigned = s.bankerWorkload.find((r) => r.bankerId === '__unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned?.bankerName).toBe('Unassigned');
    expect(unassigned?.activeDealCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Top deals — sorted, capped, VM-projected
// ---------------------------------------------------------------------------

describe('Phase 124A — top deals', () => {
  it('sorts by amount descending and caps at topN (default 5)', () => {
    const deals: TeamDeal[] = Array.from({ length: 7 }, (_, i) =>
      deal({ id: `d${i}`, name: `Deal ${i}`, amount: (i + 1) * 100_000 }),
    );
    const s = snapshot({ teamPipeline: deals });
    expect(s.topDeals).toHaveLength(5);
    expect(s.topDeals.map((r) => r.amount)).toEqual([
      700_000, 600_000, 500_000, 400_000, 300_000,
    ]);
  });

  it('honors a smaller topN override', () => {
    const deals = [
      deal({ id: 'd1', amount: 100 }),
      deal({ id: 'd2', amount: 200 }),
      deal({ id: 'd3', amount: 300 }),
    ];
    const s = snapshot({ teamPipeline: deals, topN: 2 });
    expect(s.topDeals.map((r) => r.amount)).toEqual([300, 200]);
  });

  it('deals with undefined amounts sort to the end', () => {
    const s = snapshot({
      teamPipeline: [
        deal({ id: 'd1', amount: undefined, name: 'Alpha' }),
        deal({ id: 'd2', amount: 500_000, name: 'Beta' }),
        deal({ id: 'd3', amount: undefined, name: 'Gamma' }),
      ],
    });
    expect(s.topDeals[0].dealId).toBe('d2');
    expect(s.topDeals.slice(1).map((r) => r.dealId).sort()).toEqual(['d1', 'd3']);
  });

  it('projects blocker status + next-best-action through the shared VM (mechanical signal)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-overdue-tasks',
          name: 'Has overdue tasks',
        }),
      ],
      teamTasks: [
        task({ id: 't1', dealId: 'd-overdue-tasks', dueDate: isoDaysAgo(2) }),
        task({ id: 't2', dealId: 'd-overdue-tasks', dueDate: isoDaysAgo(1) }),
      ],
    });
    const row = s.topDeals[0];
    expect(row.nextBestAction).toBeDefined();
    expect(row.nextBestAction?.id).toBe('open-overdue-tasks');
    expect(row.nextBestAction?.label).toMatch(/Open the 2 overdue tasks/);
  });

  it('honest absence — top-deal row carries undefined client/stage/status/banker when source is unset (no fake fallback)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-sparse',
          name: 'Sparse',
          clientName: undefined,
          stage: undefined,
          status: undefined,
          assignedBankerName: undefined,
          amount: 100,
        }),
      ],
    });
    const row = s.topDeals[0];
    expect(row.clientName).toBeUndefined();
    expect(row.stage).toBeUndefined();
    expect(row.status).toBeUndefined();
    expect(row.bankerName).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 125B — missing-field check honors hydrated TeamDeal fields
// ---------------------------------------------------------------------------

describe('Phase 125B — manager-scoped missing-fields catalog respects hydrated TeamDeal labels', () => {
  it('does NOT flag clientName / stage / status / banker as missing when the loader hydrated them via formatted values', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-hydrated',
          // All four manager-catalog string fields populated.
          clientName: 'Borrower Inc.',
          stage: 'Underwriting',
          status: 'Active',
          assignedBankerName: 'Hydrated Banker',
          amount: 1_000_000,
          targetCloseDate: isoDaysAgo(-30),
        }),
      ],
    });
    expect(s.commandStrip.missingDataCount).toBe(0);
    expect(s.exceptionTape.missingFields).toHaveLength(0);
  });

  it('still flags only the truly-absent manager-catalog fields (Loan amount / Banker etc.)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-partial',
          clientName: 'Borrower Inc.',
          stage: 'Underwriting',
          status: 'Active',
          // Banker truly absent.
          assignedBankerId: undefined,
          assignedBankerName: undefined,
          amount: 1_000_000,
          targetCloseDate: isoDaysAgo(-30),
        }),
      ],
    });
    expect(s.commandStrip.missingDataCount).toBe(1);
    expect(s.exceptionTape.missingFields).toHaveLength(1);
    expect(s.exceptionTape.missingFields[0].reason).toMatch(/Banker/);
  });

  it('top-deal row carries the hydrated product / loan-structure / pricing labels when populated', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-ref',
          amount: 500_000,
          productType: 'SBA 7(a)',
          loanStructure: 'Term Loan',
          pricingType: 'Variable',
        }),
      ],
    });
    expect(s.topDeals[0].productType).toBe('SBA 7(a)');
    expect(s.topDeals[0].loanStructure).toBe('Term Loan');
    expect(s.topDeals[0].pricingType).toBe('Variable');
  });

  it('top-deal row keeps product / loan / pricing undefined when the loader returned no display value (honest absence)', () => {
    const s = snapshot({
      teamPipeline: [
        deal({
          id: 'd-sparse-refs',
          amount: 500_000,
          productType: undefined,
          loanStructure: undefined,
          pricingType: undefined,
        }),
      ],
    });
    expect(s.topDeals[0].productType).toBeUndefined();
    expect(s.topDeals[0].loanStructure).toBeUndefined();
    expect(s.topDeals[0].pricingType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 124A — managerPipelineSnapshot.ts static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'managerPipelineSnapshot.ts'),
    'utf8',
  );
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports the shared Phase-123A view-model deriver (single source of truth pin)', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*deriveDealIntelligenceViewModel[^}]*\}\s+from\s+['"]\.\.\/shared\/dealIntelligenceViewModel['"]/,
    );
  });

  it('imports the existing deriveBlockers pipeline (manager + banker converge)', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*deriveBlockers[^}]*\}\s+from\s+['"]\.\.\/deals\/blockerRules['"]/,
    );
  });

  it('imports the existing deriveDealCockpitMetrics pipeline', () => {
    expect(source).toMatch(
      /from\s+['"]\.\.\/deals\/dealCockpitMetrics['"]/,
    );
  });

  it('does NOT import any banker write surface or Office365 / send-email action', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(source).not.toMatch(/SendEmailV2/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
  });

  it('does NOT introduce fake-fallback placeholders', () => {
    expect(sourceCode).not.toMatch(/['"]Not set['"]/);
    expect(sourceCode).not.toMatch(/['"]TBD['"]/);
    expect(sourceCode).not.toMatch(/['"]Unknown['"]/);
    expect(sourceCode).not.toMatch(/['"]N\/A['"]/);
  });

  it('does NOT hardcode sample borrower / sample deal names', () => {
    expect(sourceCode).not.toMatch(/\bAcme\b/);
    expect(sourceCode).not.toMatch(/\bContoso\b/);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });

  it('pins MANAGER_STALE_DEAL_DAYS = 14 (parity with banker cockpit STALE_ACTIVITY_DAYS)', () => {
    expect(sourceCode).toMatch(/MANAGER_STALE_DEAL_DAYS\s*=\s*14\b/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  deriveTeamOpsQueueSnapshot,
  DUE_SOON_DAYS,
  STALE_DEAL_DAYS,
  CLOSING_SOON_DAYS,
} from './teamOpsQueueSnapshot';
import type {
  TeamDealRow,
  TeamTaskRow,
  TeamDocumentRow,
  TeamDocumentStatus,
} from './teamQueries';

/**
 * Phase 127A — deriveTeamOpsQueueSnapshot tests.
 *
 * Pins:
 *   - command ribbon counts (active / open / overdue / due-soon /
 *     outstanding / pending review / blocked / at-risk / stale /
 *     closing-30);
 *   - lanes classify each work item honestly (no fake category
 *     coercion);
 *   - banker workload aggregates per-banker; unassigned bucket
 *     synthesized when banker absent;
 *   - execution board sorts by severity (blocked > atRisk > info)
 *     then urgency (overdue first, due-soon next);
 *   - isEmpty=true for zero-deal teams;
 *   - injectable `now` makes date-relative classifications
 *     deterministic;
 *   - static-source: imports shared VM, no banker write surface
 *     imports, no fake-fallback strings.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-06-03T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isoDaysAgo(d: number): string {
  return new Date(NOW.getTime() - d * MS_PER_DAY).toISOString();
}
function isoDaysFromNow(d: number): string {
  return new Date(NOW.getTime() + d * MS_PER_DAY).toISOString();
}

function deal(over: Partial<TeamDealRow> = {}): TeamDealRow {
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
    ...over,
  };
}

function task(over: Partial<TeamTaskRow> = {}): TeamTaskRow {
  return {
    id: 't-default',
    title: 'Default task',
    completed: false,
    dueDate: isoDaysFromNow(3),
    assigneeName: undefined,
    modifiedOn: undefined,
    dealId: 'd-default',
    dealName: 'Default deal',
    ...over,
  };
}

function doc(over: Partial<TeamDocumentRow> = {}): TeamDocumentRow {
  const base: TeamDocumentRow = {
    id: 'doc-default',
    name: 'Default doc',
    dueDate: isoDaysFromNow(5),
    requestDate: isoDaysAgo(2),
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding' as TeamDocumentStatus,
    dealId: 'd-default',
    dealName: 'Default deal',
  };
  return { ...base, ...over };
}

function snapshot(opts: {
  deals?: TeamDealRow[];
  tasks?: TeamTaskRow[];
  documents?: TeamDocumentRow[];
}) {
  return deriveTeamOpsQueueSnapshot({
    deals: opts.deals ?? [],
    tasks: opts.tasks ?? [],
    documents: opts.documents ?? [],
    now: NOW,
  });
}

// ---------------------------------------------------------------------------
// Empty / honest absence
// ---------------------------------------------------------------------------

describe('Phase 127A — empty state', () => {
  it('returns isEmpty=true and a zeroed ribbon when no deals are authorized', () => {
    const s = snapshot({});
    expect(s.isEmpty).toBe(true);
    expect(s.commandRibbon.activeDealCount).toBe(0);
    expect(s.commandRibbon.openTaskCount).toBe(0);
    expect(s.commandRibbon.overdueTaskCount).toBe(0);
    expect(s.lanes.overdueTasks).toHaveLength(0);
    expect(s.lanes.blockedAtRisk).toHaveLength(0);
    expect(s.executionBoard).toHaveLength(0);
    expect(s.bankerWorkload).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Command ribbon
// ---------------------------------------------------------------------------

describe('Phase 127A — command ribbon counts', () => {
  it('counts open / overdue / due-soon tasks honestly', () => {
    const s = snapshot({
      deals: [deal({ id: 'd1' })],
      tasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(2) }), // overdue
        task({ id: 't2', dealId: 'd1', dueDate: isoDaysFromNow(3) }), // due-soon
        task({ id: 't3', dealId: 'd1', dueDate: isoDaysFromNow(30) }), // open but not due-soon
        task({ id: 't4', dealId: 'd1', completed: true, dueDate: isoDaysAgo(5) }), // completed → excluded
        task({ id: 't5', dealId: 'd1', dueDate: undefined }), // open but no due date
      ],
    });
    expect(s.commandRibbon.openTaskCount).toBe(4);
    expect(s.commandRibbon.overdueTaskCount).toBe(1);
    expect(s.commandRibbon.dueSoonTaskCount).toBe(1);
  });

  it('counts outstanding + pending-review documents honestly', () => {
    const s = snapshot({
      deals: [deal({ id: 'd1' })],
      documents: [
        doc({ id: 'doc1', dealId: 'd1', status: 'outstanding' }),
        doc({ id: 'doc2', dealId: 'd1', status: 'outstanding' }),
        doc({ id: 'doc3', dealId: 'd1', status: 'received' }),
        doc({ id: 'doc4', dealId: 'd1', status: 'reviewed' }),
      ],
    });
    expect(s.commandRibbon.outstandingDocumentCount).toBe(2);
    expect(s.commandRibbon.docsPendingReviewCount).toBe(1);
  });

  it('splits blocked vs at-risk counts (shared blocker pipeline)', () => {
    const s = snapshot({
      deals: [
        deal({ id: 'd-blocked', targetCloseDate: isoDaysAgo(10) }), // past close >7d → blocked
        deal({ id: 'd-atrisk', targetCloseDate: isoDaysAgo(2) }), // past close <7d → at-risk
        deal({ id: 'd-clean' }),
      ],
    });
    expect(s.commandRibbon.blockedDealCount).toBe(1);
    expect(s.commandRibbon.atRiskDealCount).toBe(1);
  });

  it('flags stale deals via modifiedOn ≥ STALE_DEAL_DAYS', () => {
    const s = snapshot({
      deals: [
        deal({ id: 'd-stale', modifiedOn: isoDaysAgo(STALE_DEAL_DAYS + 5) }),
        deal({ id: 'd-fresh', modifiedOn: isoDaysAgo(1) }),
        deal({ id: 'd-no-modified', modifiedOn: undefined }),
      ],
    });
    expect(s.commandRibbon.staleDealCount).toBe(1);
  });

  it('counts closing-next-30 deals (excludes past dates)', () => {
    const s = snapshot({
      deals: [
        deal({ id: 'd1', targetCloseDate: isoDaysFromNow(10) }),
        deal({ id: 'd2', targetCloseDate: isoDaysFromNow(50) }), // outside 30d
        deal({ id: 'd3', targetCloseDate: isoDaysAgo(5) }), // past — excluded
      ],
    });
    expect(s.commandRibbon.closingNext30DayCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

describe('Phase 127A — work-queue lanes', () => {
  it('overdue tasks lane sorts by daysUntilDue ascending (most overdue first)', () => {
    const s = snapshot({
      deals: [deal({ id: 'd1' })],
      tasks: [
        task({ id: 't-old', dealId: 'd1', title: 'Older', dueDate: isoDaysAgo(20) }),
        task({ id: 't-recent', dealId: 'd1', title: 'Recent', dueDate: isoDaysAgo(2) }),
      ],
    });
    expect(s.lanes.overdueTasks.map((i) => i.title)).toEqual(['Older', 'Recent']);
  });

  it('due-soon tasks lane bounded by DUE_SOON_DAYS', () => {
    const s = snapshot({
      deals: [deal({ id: 'd1' })],
      tasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysFromNow(1) }), // within
        task({ id: 't2', dealId: 'd1', dueDate: isoDaysFromNow(DUE_SOON_DAYS) }), // boundary inclusive
        task({ id: 't3', dealId: 'd1', dueDate: isoDaysFromNow(DUE_SOON_DAYS + 1) }), // outside
      ],
    });
    expect(s.lanes.dueSoonTasks).toHaveLength(2);
  });

  it('blocked / at-risk lane orders blocked first then by deal name', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-atrisk',
          name: 'AtRiskDeal',
          targetCloseDate: isoDaysAgo(2),
        }),
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    expect(s.lanes.blockedAtRisk.map((i) => i.dealName)).toEqual([
      'BlockedDeal',
      'AtRiskDeal',
    ]);
  });

  it('missing-data lane flags deals with absent manager-catalog fields', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-missing',
          name: 'MissingDeal',
          // Banker absent — triggers the missing-data lane.
          assignedBankerId: undefined,
          assignedBankerName: undefined,
        }),
        deal({ id: 'd-clean', name: 'CleanDeal' }),
      ],
    });
    expect(s.lanes.missingData.map((i) => i.dealName)).toEqual(['MissingDeal']);
    expect(s.lanes.missingData[0].reason).toMatch(/Banker/);
  });

  it('stale-deals lane sorts by daysStale desc (most stale first)', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-most-stale',
          name: 'MostStale',
          modifiedOn: isoDaysAgo(40),
        }),
        deal({
          id: 'd-stale',
          name: 'Stale',
          modifiedOn: isoDaysAgo(STALE_DEAL_DAYS + 1),
        }),
      ],
    });
    expect(s.lanes.staleDeals.map((i) => i.dealName)).toEqual([
      'MostStale',
      'Stale',
    ]);
  });

  it('closing-soon lane bounded by CLOSING_SOON_DAYS', () => {
    const s = snapshot({
      deals: [
        deal({ id: 'd1', targetCloseDate: isoDaysFromNow(5) }),
        deal({
          id: 'd2',
          targetCloseDate: isoDaysFromNow(CLOSING_SOON_DAYS),
        }),
        deal({
          id: 'd3',
          targetCloseDate: isoDaysFromNow(CLOSING_SOON_DAYS + 1),
        }),
      ],
    });
    expect(s.lanes.closingSoon).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Banker workload matrix
// ---------------------------------------------------------------------------

describe('Phase 127A — banker workload matrix', () => {
  it('aggregates per banker; unassigned bucket synthesized', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd1',
          assignedBankerId: 'b-a',
          assignedBankerName: 'Alice',
        }),
        deal({
          id: 'd2',
          assignedBankerId: 'b-a',
          assignedBankerName: 'Alice',
          targetCloseDate: isoDaysAgo(10),
        }),
        deal({
          id: 'd3',
          assignedBankerId: undefined,
          assignedBankerName: undefined,
        }),
      ],
      tasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(3) }), // alice overdue
      ],
      documents: [
        doc({ id: 'doc1', dealId: 'd2' }), // alice outstanding
      ],
    });
    const alice = s.bankerWorkload.find((b) => b.bankerName === 'Alice')!;
    expect(alice).toBeDefined();
    expect(alice.activeDealCount).toBe(2);
    expect(alice.openTaskCount).toBe(1);
    expect(alice.overdueTaskCount).toBe(1);
    expect(alice.outstandingDocumentCount).toBe(1);
    // Both Alice deals are flagged: d1 at-risk (overdue task fires
    // the blocker signal), d2 blocked (past target close > 7 days).
    expect(alice.blockerAtRiskCount).toBe(2);
    const unassigned = s.bankerWorkload.find(
      (b) => b.bankerId === '__unassigned__',
    );
    expect(unassigned?.bankerName).toBe('Unassigned');
    expect(unassigned?.activeDealCount).toBe(1);
  });

  it('sorts by overdue desc, then by blocker/at-risk desc, then by name', () => {
    const s = snapshot({
      deals: [
        deal({ id: 'd1', assignedBankerId: 'b1', assignedBankerName: 'Charlie' }),
        deal({ id: 'd2', assignedBankerId: 'b2', assignedBankerName: 'Alice' }),
      ],
      tasks: [
        task({ id: 't1', dealId: 'd1', dueDate: isoDaysAgo(2) }),
        task({ id: 't2', dealId: 'd1', dueDate: isoDaysAgo(3) }),
      ],
    });
    expect(s.bankerWorkload[0].bankerName).toBe('Charlie');
  });
});

// ---------------------------------------------------------------------------
// Execution board
// ---------------------------------------------------------------------------

describe('Phase 127A — execution board sort', () => {
  it('orders blocked > atRisk > info, then by urgency', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-blocked',
          name: 'BlockedDeal',
          targetCloseDate: isoDaysAgo(15),
        }),
        deal({
          id: 'd-clean',
          name: 'CleanDeal',
          targetCloseDate: isoDaysFromNow(5),
        }),
      ],
      tasks: [
        task({ id: 't-overdue', title: 'OverdueTask', dueDate: isoDaysAgo(3) }),
        task({
          id: 't-due-soon',
          title: 'DueSoon',
          dueDate: isoDaysFromNow(2),
        }),
      ],
    });
    // Severities present:
    //   blocked-deal (BlockedDeal)             — severity 'blocked'
    //   overdue-task (OverdueTask)             — severity 'atRisk'
    //   due-soon-task (DueSoon)                — severity 'info'
    //   closing-soon (BlockedDeal — also closing today-ish)
    //   closing-soon (CleanDeal)               — severity 'info'
    const board = s.executionBoard;
    expect(board[0].severity).toBe('blocked');
    // First item is the BlockedDeal at the highest severity.
    expect(board[0].dealName).toBe('BlockedDeal');
    // At least one atRisk item ranks above any info item.
    const firstAtRiskIdx = board.findIndex((i) => i.severity === 'atRisk');
    const firstInfoIdx = board.findIndex((i) => i.severity === 'info');
    expect(firstAtRiskIdx).toBeLessThan(firstInfoIdx);
  });

  it('returns an empty execution board when nothing is actionable', () => {
    const s = snapshot({
      deals: [deal({ id: 'd-clean' })],
    });
    expect(s.executionBoard).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 127C — banker label hydration + stage/status on WorkItem
// ---------------------------------------------------------------------------

describe('Phase 127C — banker label hydration is honest (no GUID leak)', () => {
  it('falls back to "Unknown banker" when assignedBankerId is present but the name did not hydrate', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-bare-fk',
          assignedBankerId: 'banker-guid-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          assignedBankerName: undefined,
        }),
      ],
    });
    expect(s.bankerWorkload).toHaveLength(1);
    expect(s.bankerWorkload[0].bankerName).toBe('Unknown banker');
    // The raw GUID MUST NOT appear in the rendered banker name.
    expect(s.bankerWorkload[0].bankerName).not.toContain('banker-guid');
  });

  it('keeps "Unassigned" when no banker FK is set (honest absence, not "Unknown banker")', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-unassigned',
          assignedBankerId: undefined,
          assignedBankerName: undefined,
        }),
      ],
    });
    expect(s.bankerWorkload).toHaveLength(1);
    expect(s.bankerWorkload[0].bankerName).toBe('Unassigned');
  });

  it('uses the hydrated banker name when both id and name are present', () => {
    const s = snapshot({
      deals: [
        deal({
          assignedBankerId: 'banker-x',
          assignedBankerName: 'Banker X Real Name',
        }),
      ],
    });
    expect(s.bankerWorkload[0].bankerName).toBe('Banker X Real Name');
  });
});

describe('Phase 127C — WorkItem carries stage + status from the source deal', () => {
  it('blocked / at-risk lane items expose stage + status when present on the deal', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-blocked',
          stage: 'Underwriting',
          status: 'Pending review',
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    expect(s.lanes.blockedAtRisk.length).toBeGreaterThan(0);
    const item = s.lanes.blockedAtRisk[0];
    expect(item.stage).toBe('Underwriting');
    expect(item.status).toBe('Pending review');
  });

  it('overdue-task lane items expose the parent deal stage + status', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-ovr',
          stage: 'Sourcing',
          status: 'Active',
        }),
      ],
      tasks: [
        task({ id: 't-ovr', dealId: 'd-ovr', dueDate: isoDaysAgo(2) }),
      ],
    });
    const item = s.lanes.overdueTasks[0];
    expect(item.stage).toBe('Sourcing');
    expect(item.status).toBe('Active');
  });

  it('stage / status remain undefined when the source deal row has no value (honest absence)', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-no-stage-status',
          stage: undefined,
          status: undefined,
          targetCloseDate: isoDaysAgo(15),
        }),
      ],
    });
    const item = s.lanes.blockedAtRisk[0];
    expect(item.stage).toBeUndefined();
    expect(item.status).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 128B — Team Ops Queue data-hydration parity
// ---------------------------------------------------------------------------

describe('Phase 128B — work items hydrate labels from the matching TeamDeal row', () => {
  const HYDRATED = {
    clientName: 'TEST Client',
    stage: 'TEST · Stage Phase 121',
    status: 'TEST — Status Phase 121',
    assignedBankerId: 'banker-mp',
    assignedBankerName: 'Matthew Paller',
  } as const;

  it('task-derived work item hydrates client / stage / status / banker from the matching TeamDeal', () => {
    const s = snapshot({
      deals: [deal({ id: 'd-hyd', ...HYDRATED })],
      tasks: [task({ id: 't-ovr', dealId: 'd-hyd', dueDate: isoDaysAgo(2) })],
    });
    const item = s.lanes.overdueTasks[0];
    expect(item.clientName).toBe('TEST Client');
    expect(item.stage).toBe('TEST · Stage Phase 121');
    expect(item.status).toBe('TEST — Status Phase 121');
    expect(item.ownerName).toBe('Matthew Paller');
  });

  it('document-derived work item hydrates client / stage / status / banker from the matching TeamDeal', () => {
    const s = snapshot({
      deals: [deal({ id: 'd-hyd', ...HYDRATED })],
      documents: [
        doc({ id: 'doc-out', dealId: 'd-hyd', status: 'outstanding' }),
      ],
    });
    const item = s.lanes.outstandingDocuments[0];
    expect(item.clientName).toBe('TEST Client');
    expect(item.stage).toBe('TEST · Stage Phase 121');
    expect(item.status).toBe('TEST — Status Phase 121');
    expect(item.ownerName).toBe('Matthew Paller');
  });

  it('does NOT flag the missing-data lane when the hydrated deal row carries every required field', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-hyd',
          ...HYDRATED,
          amount: 1_000_000,
          targetCloseDate: isoDaysFromNow(45),
        }),
      ],
    });
    expect(s.lanes.missingData).toHaveLength(0);
  });

  it('banker workload uses the human assignedBankerName (no GUID, no "Unknown banker") when present', () => {
    const s = snapshot({
      deals: [deal({ id: 'd-hyd', ...HYDRATED })],
    });
    expect(s.bankerWorkload).toHaveLength(1);
    expect(s.bankerWorkload[0].bankerName).toBe('Matthew Paller');
    expect(s.bankerWorkload[0].bankerName).not.toMatch(/Unknown banker/);
  });

  it('surfaces "Unknown banker" only when a banker FK exists but no human display name does', () => {
    const s = snapshot({
      deals: [
        deal({
          id: 'd-fk-only',
          assignedBankerId: 'banker-guid',
          assignedBankerName: undefined,
        }),
        deal({
          id: 'd-named',
          assignedBankerId: 'banker-mp',
          assignedBankerName: 'Matthew Paller',
        }),
      ],
    });
    const unknown = s.bankerWorkload.find((b) => b.bankerId === 'banker-guid');
    const named = s.bankerWorkload.find((b) => b.bankerId === 'banker-mp');
    expect(unknown?.bankerName).toBe('Unknown banker');
    expect(named?.bankerName).toBe('Matthew Paller');
  });
});

// ---------------------------------------------------------------------------
// Static-source discipline
// ---------------------------------------------------------------------------

describe('Phase 127A — teamOpsQueueSnapshot.ts static-source discipline', () => {
  const source = readFileSync(
    resolve(__dirname, 'teamOpsQueueSnapshot.ts'),
    'utf8',
  );
  const sourceCode = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('imports the shared Phase-123A deal-intelligence VM (single source of truth)', () => {
    expect(source).toMatch(
      /from\s+['"]\.\.\/shared\/dealIntelligenceViewModel['"]/,
    );
  });

  it('imports deriveBlockers + deriveDealCockpitMetrics from /deals/ (no /manager/ import)', () => {
    expect(source).toMatch(
      /from\s+['"]\.\.\/deals\/blockerRules['"]/,
    );
    expect(source).toMatch(
      /from\s+['"]\.\.\/deals\/dealCockpitMetrics['"]/,
    );
    expect(source).not.toMatch(/from\s+['"]\.\.\/manager\//);
  });

  it('does NOT import any banker write surface or send-email action', () => {
    expect(source).not.toMatch(/from\s+['"][^'"]*Office365/);
    expect(source).not.toMatch(/SendEmailV2/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendDocumentRequestEmail['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*sendBorrowerUpdateEmail['"]/);
    expect(source).not.toMatch(/from\s+['"][^'"]*\/banker\//);
  });

  it('does NOT contain fake-fallback placeholders or sample data names', () => {
    expect(sourceCode).not.toMatch(/['"]TBD['"]/);
    expect(sourceCode).not.toMatch(/['"]N\/A['"]/);
    expect(sourceCode).not.toMatch(/\bAcme\b/);
    expect(sourceCode).not.toMatch(/\bContoso\b/);
    expect(sourceCode).not.toMatch(/sample\s+deal/i);
    expect(sourceCode).not.toMatch(/mock\s+deal/i);
  });

  it('does NOT contain predictive / weighted vocabulary', () => {
    expect(sourceCode).not.toMatch(/weighted\s+exposure/i);
    expect(sourceCode).not.toMatch(/approval\s+(odds|probability)/i);
    expect(sourceCode).not.toMatch(/win\s+rate/i);
    expect(sourceCode).not.toMatch(/AI[- ]generated/i);
  });
});

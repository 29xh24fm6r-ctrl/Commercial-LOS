import { describe, it, expect } from 'vitest';
import type { DealDetail } from './dealQueries';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import type {
  CreditMemoSummary,
  CreditMemoSectionItem,
} from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';
import { deriveCreditMemoFreshness } from './creditMemoFreshness';

const NOW = new Date('2026-05-13T12:00:00Z');

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, equipment.',
  createdOn: '2026-01-15T00:00:00Z',
  // 12 days before NOW — under the deriveBlockers stale-stage
  // threshold (30 days) so baseline tests don't pick up an
  // unintended at-risk signal from the underlying blocker rule.
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

function makeMemo(overrides: Partial<CreditMemoSummary>): CreditMemoSummary {
  return {
    id: 'memo-1',
    name: 'Memo v1',
    status: 'Draft',
    statusKey: 'draft',
    memoType: 'Banker draft',
    version: 1,
    generatedAt: '2026-05-10T00:00:00Z',
    modifiedOn: '2026-05-10T00:00:00Z',
    borrowerSafe: false,
    textPreview: undefined,
    ...overrides,
  };
}

function makeSection(overrides: Partial<CreditMemoSectionItem>): CreditMemoSectionItem {
  return {
    id: 'sect-1',
    sectionKey: 'executive-summary',
    sectionLabel: 'Executive Summary',
    reviewStatus: 'Pending',
    reviewStatusKey: 'Pending',
    lastGeneratedAt: '2026-05-10T00:00:00Z',
    modifiedOn: '2026-05-10T00:00:00Z',
    textPreview: undefined,
    ...overrides,
  };
}

function emptyTasks(): DealTasksResult {
  return { open: [], completed: [] };
}
function emptyDocs(): DealDocumentsResult {
  return { outstanding: [], received: [], reviewed: [] };
}

function task(overrides: Partial<DealTask>): DealTask {
  return {
    id: 't-x',
    title: 'Some task',
    completed: false,
    dueDate: undefined,
    assigneeName: undefined,
    modifiedOn: undefined,
    ...overrides,
  };
}

function doc(overrides: Partial<DealDocument>): DealDocument {
  return {
    id: 'd-x',
    name: 'Some doc',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
    ...overrides,
  };
}

describe('deriveCreditMemoFreshness', () => {
  it('returns no-memo when neither memos nor sections exist', () => {
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('no-memo');
    expect(r.reasons).toEqual([]);
    expect(r.latestSavedAt).toBeUndefined();
    expect(r.ctaText).toMatch(/no memo on file/i);
  });

  it('returns no-memo when creditMemo is undefined (e.g. still loading not finished)', () => {
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: undefined,
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('no-memo');
  });

  it('returns fresh when a memo exists, no overdue items, and no blockers fire', () => {
    // baseDeal stageEntryDate is 2026-04-01, memo generatedAt is
    // 2026-05-10 (after stage entry). No overdue tasks/docs.
    const memo = makeMemo({});
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('fresh');
    expect(r.reasons).toEqual([]);
    expect(r.latestSavedAt).toBe('2026-05-10T00:00:00Z');
    expect(r.ctaText).toMatch(/reflects the current deal record/i);
  });

  it('uses the most recent of memo.modifiedOn / generatedAt / section timestamps as latestSavedAt', () => {
    // Set every timestamp explicitly so the assertion captures the
    // "max of all" rule without ambiguity from defaults.
    const memo = makeMemo({ generatedAt: '2026-04-01T00:00:00Z', modifiedOn: '2026-04-15T00:00:00Z' });
    const section = makeSection({
      modifiedOn: '2026-05-09T00:00:00Z',
      lastGeneratedAt: '2026-04-20T00:00:00Z',
    });
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [section] },
      activity: [],
      now: NOW,
    });
    expect(r.latestSavedAt).toBe('2026-05-09T00:00:00Z');
  });

  it('flags at-risk when the deal entered the current stage AFTER the memo was last saved', () => {
    // Memo saved 2026-04-15, deal entered current stage 2026-05-01.
    const dealMovedStage: DealDetail = {
      ...baseDeal,
      stageEntryDate: '2026-05-01T00:00:00Z',
    };
    const memo = makeMemo({
      generatedAt: '2026-04-15T00:00:00Z',
      modifiedOn: '2026-04-15T00:00:00Z',
    });
    const r = deriveCreditMemoFreshness({
      deal: dealMovedStage,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'stage-changed-since-memo')).toBe(true);
    expect(r.ctaText).toMatch(/may be stale/i);
    expect(r.ctaText).toMatch(/review recommended/i);
  });

  it('flags at-risk when overdue open tasks exist, regardless of when they were created', () => {
    const memo = makeMemo({});
    const tasks: DealTasksResult = {
      open: [task({ id: 't1', title: 'Confirm collateral', dueDate: '2026-04-01T00:00:00Z' })],
      completed: [],
    };
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks,
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'overdue-tasks')).toBe(true);
  });

  it('flags at-risk when outstanding overdue documents exist', () => {
    const memo = makeMemo({});
    const documents: DealDocumentsResult = {
      outstanding: [doc({ id: 'd1', name: 'PFS', dueDate: '2026-04-01T00:00:00Z' })],
      received: [],
      reviewed: [],
    };
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents,
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'overdue-documents')).toBe(true);
  });

  it('returns at-risk with schema-stale reason when any memo has statusKey="stale"', () => {
    const memo = makeMemo({
      status: 'Stale',
      statusKey: 'stale',
      name: 'Acme Memo v1',
    });
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('at-risk');
    const staleReason = r.reasons.find((reason) => reason.id === 'schema-stale');
    expect(staleReason).toBeDefined();
    expect(staleReason!.label).toContain('Acme Memo v1');
  });

  it('escalates to blocked when deriveBlockers reports the deal is blocked', () => {
    // Past-target-close > 7 days makes deriveBlockers return blocked.
    const dealOverdue: DealDetail = {
      ...baseDeal,
      targetCloseDate: '2026-05-01T00:00:00Z', // 12 days before NOW
    };
    const memo = makeMemo({});
    const r = deriveCreditMemoFreshness({
      deal: dealOverdue,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('blocked');
    expect(r.reasons.some((reason) => reason.id === 'deal-blocked')).toBe(true);
    expect(r.ctaText).toMatch(/may be stale/i);
  });

  it('final memo + newer deal/task/doc/activity flips at-risk with the final-but-newer reason', () => {
    const finalMemo = makeMemo({
      statusKey: 'final',
      status: 'Final',
      generatedAt: '2026-04-01T00:00:00Z',
      modifiedOn: '2026-04-01T00:00:00Z',
    });
    // Activity event AFTER the memo's saved date.
    const activity: TimelineEvent[] = [
      {
        id: 'e1',
        title: 'Doc requested',
        summary: 'Requested PFS',
        eventAt: '2026-05-01T00:00:00Z',
        eventType: 'DocumentRequested',
        eventTypeKey: 'DocumentRequested',
        eventSubType: undefined,
        isSystemGenerated: false,
        actorName: undefined,
        relatedEntityType: undefined,
        relatedEntityId: undefined,
      },
    ];
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [finalMemo], sections: [] },
      activity,
      now: NOW,
    });
    expect(r.kind).toBe('at-risk');
    expect(
      r.reasons.some((reason) => reason.id === 'final-memo-but-newer-events'),
    ).toBe(true);
  });

  it('final memo with NO newer activity stays fresh', () => {
    const finalMemo = makeMemo({
      statusKey: 'final',
      status: 'Final',
      generatedAt: '2026-05-12T00:00:00Z',
      modifiedOn: '2026-05-12T00:00:00Z',
    });
    // Only an OLDER activity event.
    const activity: TimelineEvent[] = [
      {
        id: 'e1',
        title: 'Doc requested',
        summary: 'Requested PFS',
        eventAt: '2026-04-30T00:00:00Z',
        eventType: 'DocumentRequested',
        eventTypeKey: 'DocumentRequested',
        eventSubType: undefined,
        isSystemGenerated: false,
        actorName: undefined,
        relatedEntityType: undefined,
        relatedEntityId: undefined,
      },
    ];
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [finalMemo], sections: [] },
      activity,
      now: NOW,
    });
    expect(r.kind).toBe('fresh');
  });

  it('uses conservative copy in every non-fresh reason — no "is stale" / "is invalid"', () => {
    const dealOverdue: DealDetail = { ...baseDeal, targetCloseDate: '2026-05-01T00:00:00Z' };
    const documents: DealDocumentsResult = {
      outstanding: [doc({ id: 'd1', name: 'PFS', dueDate: '2026-04-01T00:00:00Z' })],
      received: [],
      reviewed: [],
    };
    const tasks: DealTasksResult = {
      open: [task({ id: 't1', title: 'X', dueDate: '2026-04-01T00:00:00Z' })],
      completed: [],
    };
    const memo = makeMemo({ statusKey: 'stale', status: 'Stale' });
    const r = deriveCreditMemoFreshness({
      deal: dealOverdue,
      tasks,
      documents,
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.kind).toBe('blocked');
    const combined = r.reasons.map((reason) => reason.label).join(' ');
    expect(/\bis stale\b/i.test(combined)).toBe(false);
    expect(/\binvalid\b/i.test(combined)).toBe(false);
    // CTA must read as a recommendation, never a statement of fact.
    expect(r.ctaText).toMatch(/may be stale/i);
    expect(r.ctaText).toMatch(/review recommended/i);
  });

  it('does NOT double-list a generic at-risk reason when specific reasons (overdue tasks/docs) already fired', () => {
    const tasks: DealTasksResult = {
      open: [task({ id: 't1', title: 'X', dueDate: '2026-04-01T00:00:00Z' })],
      completed: [],
    };
    const memo = makeMemo({});
    const r = deriveCreditMemoFreshness({
      deal: baseDeal,
      tasks,
      documents: emptyDocs(),
      creditMemo: { memos: [memo], sections: [] },
      activity: [],
      now: NOW,
    });
    // The overdue-tasks signal already promotes deriveBlockers to
    // at-risk. We should see overdue-tasks but NOT a generic
    // deal-at-risk catch-all duplicating it.
    expect(r.reasons.some((reason) => reason.id === 'overdue-tasks')).toBe(true);
    expect(r.reasons.some((reason) => reason.id === 'deal-at-risk')).toBe(false);
  });
});

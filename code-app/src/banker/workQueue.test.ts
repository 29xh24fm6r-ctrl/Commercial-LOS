import { describe, it, expect } from 'vitest';
import type { PipelineDeal } from './dealQueries';
import type {
  BankerWorkQueueData,
  WorkQueueDocumentRow,
  WorkQueueMemoRow,
  WorkQueueTaskRow,
} from './workQueueQueries';
import { deriveBankerWorkQueue, type WorkQueueItem } from './workQueue';

const NOW = new Date('2026-05-13T12:00:00Z');

function deal(overrides: Partial<PipelineDeal>): PipelineDeal {
  return {
    id: 'deal-1',
    name: 'Sample Deal',
    clientName: 'Sample Client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    lastActivityOn: '2026-05-10T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z', // 12 days before NOW
    isClosed: false,
    collateralSummary: undefined,
    ...overrides,
  };
}

function task(overrides: Partial<WorkQueueTaskRow>): WorkQueueTaskRow {
  return {
    id: 't-1',
    dealId: 'deal-1',
    title: 'A task',
    dueDate: undefined,
    modifiedOn: undefined,
    completed: false,
    ...overrides,
  };
}

function doc(overrides: Partial<WorkQueueDocumentRow>): WorkQueueDocumentRow {
  return {
    id: 'd-1',
    dealId: 'deal-1',
    name: 'A document',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    ...overrides,
  };
}

function memo(overrides: Partial<WorkQueueMemoRow>): WorkQueueMemoRow {
  return {
    id: 'm-1',
    dealId: 'deal-1',
    name: 'Memo v1',
    statusKey: 'draft',
    generatedAt: '2026-05-10T00:00:00Z',
    modifiedOn: '2026-05-10T00:00:00Z',
    textPreview: undefined,
    ...overrides,
  };
}

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

function find(items: WorkQueueItem[], type: WorkQueueItem['type']) {
  return items.find((i) => i.type === type);
}

describe('deriveBankerWorkQueue — empty / no signals', () => {
  it('returns an empty array when there are no deals', () => {
    expect(deriveBankerWorkQueue({ data: emptyData(), now: NOW })).toEqual([]);
  });

  it('returns an empty array when a deal exists but has no signals', () => {
    // A deal with future close date, recent stage entry, no tasks,
    // no documents, no memos. Nothing should fire.
    const d = deal({});
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    expect(items).toEqual([]);
  });

  it('skips closed deals entirely', () => {
    // Even a closed deal that would otherwise have a blocked signal
    // (past target close) must not show up in the queue.
    const d = deal({
      isClosed: true,
      targetCloseDate: '2026-01-01T00:00:00Z',
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [task({ dueDate: '2026-01-01T00:00:00Z' })],
        outstandingDocuments: [doc({ dueDate: '2026-01-01T00:00:00Z' })],
        pendingReviewDocuments: [],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

describe('deriveBankerWorkQueue — individual signal types', () => {
  it('flags overdue tasks under the banker scope', () => {
    const d = deal({});
    const t = task({
      id: 't-pfs',
      dueDate: '2026-04-01T00:00:00Z',
      title: 'Confirm collateral',
    });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [t], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = find(items, 'overdue-task');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('overdue');
    expect(item!.title).toBe('Confirm collateral');
    expect(item!.dealId).toBe(d.id);
  });

  it('flags overdue outstanding documents', () => {
    const d = deal({});
    const od = doc({
      id: 'd-pfs',
      name: 'Personal Financial Statement',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [od], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = find(items, 'overdue-document');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('overdue');
    expect(item!.title).toBe('Personal Financial Statement');
  });

  it('flags a deal as blocked when past target close by 7+ days', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' }); // 12d before NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = find(items, 'blocked-deal');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('blocked');
    expect(item!.reason).toMatch(/12 days ago/i);
  });

  it('flags a deal as at-risk past close when within the blocked threshold', () => {
    const d = deal({ targetCloseDate: '2026-05-10T00:00:00Z' }); // 3d before NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = items.find(
      (i) => i.type === 'at-risk-deal' && i.id.endsWith('::at-risk-past-close'),
    );
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    // No blocked-deal item should fire on this deal yet.
    expect(find(items, 'blocked-deal')).toBeUndefined();
  });

  it('does NOT double-up: blocked deal does not also push the at-risk-past-close item', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    expect(items.filter((i) => i.id.endsWith('::blocked-deal')).length).toBe(1);
    expect(items.filter((i) => i.id.endsWith('::at-risk-past-close')).length).toBe(0);
  });

  it('flags at-risk on stale stage (in current stage > 30 days)', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' }); // 73d before NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = items.find(
      (i) => i.type === 'at-risk-deal' && i.id.endsWith('::stale-stage'),
    );
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/73 days/i);
  });

  it('flags memo review when a memo is marked stale in Dataverse', () => {
    const d = deal({});
    const m = memo({ statusKey: 'stale', name: 'Acme v1' });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [m], memoSections: [] },
      now: NOW,
    });
    const item = find(items, 'memo-review');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/Acme v1/);
    expect(item!.reason).toMatch(/marked stale/i);
  });

  it('flags memo review when a final memo exists AND overdue tasks/docs are open', () => {
    const d = deal({});
    const m = memo({ statusKey: 'final', name: 'Acme Final' });
    const t = task({ dueDate: '2026-04-01T00:00:00Z' });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [t], outstandingDocuments: [], pendingReviewDocuments: [], memos: [m], memoSections: [] },
      now: NOW,
    });
    const item = items.find((i) => i.id.endsWith('::memo-review-newer-events'));
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
  });

  it('does NOT flag memo review for a final memo when there are no overdue items', () => {
    const d = deal({});
    const m = memo({ statusKey: 'final' });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [m], memoSections: [] },
      now: NOW,
    });
    expect(items.find((i) => i.id.includes('memo-review'))).toBeUndefined();
  });

  it('flags closing soon for deals targeting close within 14 days', () => {
    const d = deal({ targetCloseDate: '2026-05-20T00:00:00Z' }); // 7d after NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const item = find(items, 'closing-soon');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('upcoming');
    expect(item!.reason).toMatch(/7 day/i);
  });

  it('does NOT flag closing soon for deals targeting close more than 14 days out', () => {
    const d = deal({ targetCloseDate: '2026-06-30T00:00:00Z' });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    expect(find(items, 'closing-soon')).toBeUndefined();
  });
});

describe('deriveBankerWorkQueue — sort order (severity tier wins)', () => {
  it('blocked-deal sits above overdue-task even if the task is far overdue', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' }); // blocked (12d past)
    const t = task({ dueDate: '2025-12-01T00:00:00Z' }); // ~160 days overdue
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [t], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    // The blocked-deal item must be first regardless of task age.
    expect(items[0]!.type).toBe('blocked-deal');
  });

  it('overdue items sit above at-risk items', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' }); // stale stage at-risk
    const t = task({ dueDate: '2026-05-10T00:00:00Z' }); // 3d overdue
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [t], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const firstOverdueIdx = items.findIndex((i) => i.severity === 'overdue');
    const firstAtRiskIdx = items.findIndex((i) => i.severity === 'at-risk');
    expect(firstOverdueIdx).toBeGreaterThanOrEqual(0);
    expect(firstAtRiskIdx).toBeGreaterThanOrEqual(0);
    expect(firstOverdueIdx).toBeLessThan(firstAtRiskIdx);
  });

  it('at-risk items sit above upcoming items', () => {
    const a = deal({
      id: 'd-stale',
      name: 'Stale Stage Deal',
      stageEntryDate: '2026-03-01T00:00:00Z',
    });
    const b = deal({
      id: 'd-soon',
      name: 'Closing Soon Deal',
      stageEntryDate: '2026-05-01T00:00:00Z',
      targetCloseDate: '2026-05-20T00:00:00Z',
    });
    const items = deriveBankerWorkQueue({
      data: { deals: [a, b], tasks: [], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const firstAtRisk = items.findIndex((i) => i.severity === 'at-risk');
    const firstUpcoming = items.findIndex((i) => i.severity === 'upcoming');
    expect(firstAtRisk).toBeLessThan(firstUpcoming);
  });

  it('within a tier, the more-overdue item sorts higher', () => {
    const d1 = deal({ id: 'd1', name: 'A Deal' });
    const d2 = deal({ id: 'd2', name: 'Z Deal' });
    const t1 = task({ id: 't1', dealId: 'd1', dueDate: '2026-05-01T00:00:00Z', title: 'A task' }); // 12d overdue
    const t2 = task({ id: 't2', dealId: 'd2', dueDate: '2026-05-10T00:00:00Z', title: 'Z task' }); // 3d overdue
    const items = deriveBankerWorkQueue({
      data: { deals: [d1, d2], tasks: [t1, t2], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    const idx1 = items.findIndex((i) => i.title === 'A task');
    const idx2 = items.findIndex((i) => i.title === 'Z task');
    expect(idx1).toBeLessThan(idx2);
  });
});

describe('deriveBankerWorkQueue — scoping integrity', () => {
  it('ignores tasks whose dealId is not in the deals list (banker-scoping safety)', () => {
    // A task referencing some deal id we did NOT fetch in the
    // banker pipeline (defensive guard against any future bug in
    // the scoping query). Such a task must NEVER surface — the
    // queue is banker-scoped first.
    const d = deal({ id: 'authorized-deal' });
    const orphan = task({
      id: 't-orphan',
      dealId: 'unauthorized-deal',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [orphan], outstandingDocuments: [], pendingReviewDocuments: [], memos: [], memoSections: [] },
      now: NOW,
    });
    expect(items).toEqual([]);
  });

  it('ignores documents whose dealId is not in the deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphanDoc = doc({
      id: 'd-orphan',
      dealId: 'unauthorized-deal',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [orphanDoc],
        pendingReviewDocuments: [],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 54 — pending-review-document derivation
// ---------------------------------------------------------------------------

describe('deriveBankerWorkQueue — pending-review-document (Phase 54)', () => {
  // Received-anchor dates relative to NOW (2026-05-13T12:00:00Z):
  //   2026-05-01 → 12 days ago (past threshold)
  //   2026-05-09 → 4 days ago (within threshold; should NOT surface)
  //   2026-05-13 → today (definitely within threshold)

  it('surfaces a received document past PENDING_REVIEW_AT_RISK_DAYS as at-risk', () => {
    const d = deal({});
    const pending = doc({
      id: 'd-pending',
      receivedDate: '2026-05-01T00:00:00Z', // 12 days ago
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [pending],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    const item = find(items, 'pending-review-document');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.title).toBe('A document');
    // Conservative copy assertions.
    expect(item!.reason).toMatch(/may require review/i);
    expect(item!.reason).not.toMatch(/overdue/i);
    expect(item!.reason).not.toMatch(/approv/i);
    expect(item!.reason).not.toMatch(/failed/i);
  });

  it('does NOT surface a received document within the threshold window', () => {
    const d = deal({});
    const recent = doc({
      id: 'd-recent',
      receivedDate: '2026-05-09T00:00:00Z', // 4 days ago — under 7d
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [recent],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(find(items, 'pending-review-document')).toBeUndefined();
  });

  it('does NOT surface a document that already has a reviewer (signal cleared)', () => {
    const d = deal({});
    const reviewed = doc({
      id: 'd-reviewed',
      receivedDate: '2026-04-01T00:00:00Z', // 42 days ago
      reviewer: 'M. Paller',
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        // A reviewed doc should never appear in pendingReviewDocuments
        // (loader filters it out), but the derivation must defend
        // against a malformed input too.
        pendingReviewDocuments: [reviewed],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(find(items, 'pending-review-document')).toBeUndefined();
  });

  it('does NOT surface a document with no receivedDate (still outstanding)', () => {
    const d = deal({});
    const outstanding = doc({
      id: 'd-outstanding',
      receivedDate: undefined,
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        // Same defensive case — shouldn't be in the bucket, but
        // the derivation must not surface it if it is.
        pendingReviewDocuments: [outstanding],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(find(items, 'pending-review-document')).toBeUndefined();
  });

  it('ignores pending-review documents on closed deals', () => {
    const d = deal({ isClosed: true });
    const pending = doc({
      receivedDate: '2026-05-01T00:00:00Z',
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [pending],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(find(items, 'pending-review-document')).toBeUndefined();
  });

  it('ignores pending-review documents whose dealId is not in the deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphan = doc({
      id: 'd-orphan-pending',
      dealId: 'unauthorized-deal',
      receivedDate: '2026-05-01T00:00:00Z',
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [orphan],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    expect(find(items, 'pending-review-document')).toBeUndefined();
  });

  it('older receivedDate sorts above newer receivedDate within the at-risk tier', () => {
    const d = deal({});
    const older = doc({
      id: 'd-older',
      name: 'Older receipt',
      receivedDate: '2026-04-01T00:00:00Z', // 42 days ago
      reviewer: undefined,
    });
    const newer = doc({
      id: 'd-newer',
      name: 'Newer receipt',
      receivedDate: '2026-05-01T00:00:00Z', // 12 days ago
      reviewer: undefined,
    });
    const items = deriveBankerWorkQueue({
      data: {
        deals: [d],
        tasks: [],
        outstandingDocuments: [],
        pendingReviewDocuments: [newer, older],
        memos: [],
        memoSections: [],
      },
      now: NOW,
    });
    const pendingItems = items.filter(
      (i) => i.type === 'pending-review-document',
    );
    expect(pendingItems[0]!.title).toBe('Older receipt');
    expect(pendingItems[1]!.title).toBe('Newer receipt');
  });
});

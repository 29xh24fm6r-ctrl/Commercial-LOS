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
    ...overrides,
  };
}

function emptyData(): BankerWorkQueueData {
  return { deals: [], tasks: [], outstandingDocuments: [], memos: [] };
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
        memos: [],
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
      data: { deals: [d], tasks: [t], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [od], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    expect(items.filter((i) => i.id.endsWith('::blocked-deal')).length).toBe(1);
    expect(items.filter((i) => i.id.endsWith('::at-risk-past-close')).length).toBe(0);
  });

  it('flags at-risk on stale stage (in current stage > 30 days)', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' }); // 73d before NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [m] },
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
      data: { deals: [d], tasks: [t], outstandingDocuments: [], memos: [m] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [m] },
      now: NOW,
    });
    expect(items.find((i) => i.id.includes('memo-review'))).toBeUndefined();
  });

  it('flags closing soon for deals targeting close within 14 days', () => {
    const d = deal({ targetCloseDate: '2026-05-20T00:00:00Z' }); // 7d after NOW
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [t], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    // The blocked-deal item must be first regardless of task age.
    expect(items[0]!.type).toBe('blocked-deal');
  });

  it('overdue items sit above at-risk items', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' }); // stale stage at-risk
    const t = task({ dueDate: '2026-05-10T00:00:00Z' }); // 3d overdue
    const items = deriveBankerWorkQueue({
      data: { deals: [d], tasks: [t], outstandingDocuments: [], memos: [] },
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
      data: { deals: [a, b], tasks: [], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d1, d2], tasks: [t1, t2], outstandingDocuments: [], memos: [] },
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
      data: { deals: [d], tasks: [orphan], outstandingDocuments: [], memos: [] },
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
        memos: [],
      },
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import type { TeamDeal } from './managerQueries';
import type {
  TeamWorkQueueChildren,
  TeamWorkQueueDocumentRow,
  TeamWorkQueueMemoRow,
  TeamWorkQueueTaskRow,
} from './teamWorkQueueQueries';
import {
  deriveTeamWorkQueue,
  type TeamWorkQueueItem,
} from './teamWorkQueueRules';

const NOW = new Date('2026-05-13T12:00:00Z');

function deal(overrides: Partial<TeamDeal>): TeamDeal {
  return {
    id: 'deal-1',
    name: 'Acme Inc — Working Capital',
    clientName: 'Acme Inc',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z', // 12d before NOW (under stale threshold)
    modifiedOn: '2026-05-10T00:00:00Z',
    assignedBankerId: 'banker-1',
    assignedBankerName: 'M. Paller',
    ...overrides,
  };
}

function task(overrides: Partial<TeamWorkQueueTaskRow>): TeamWorkQueueTaskRow {
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

function doc(overrides: Partial<TeamWorkQueueDocumentRow>): TeamWorkQueueDocumentRow {
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

function memo(overrides: Partial<TeamWorkQueueMemoRow>): TeamWorkQueueMemoRow {
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

function emptyChildren(): TeamWorkQueueChildren {
  return { tasks: [], outstandingDocuments: [], memos: [] };
}

function find(items: TeamWorkQueueItem[], type: TeamWorkQueueItem['type']) {
  return items.find((i) => i.type === type);
}

describe('deriveTeamWorkQueue — empty / no signals', () => {
  it('returns an empty array when there are no deals', () => {
    expect(
      deriveTeamWorkQueue({ deals: [], children: emptyChildren(), now: NOW }),
    ).toEqual([]);
  });

  it('returns an empty array when a clean deal has no signals', () => {
    const d = deal({});
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

describe('deriveTeamWorkQueue — manager-specific signals', () => {
  it('flags an unassigned banker as a BLOCKED signal', () => {
    const d = deal({ assignedBankerId: undefined, assignedBankerName: undefined });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    const item = find(items, 'unassigned-banker');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('blocked');
    expect(item!.bankerName).toBeUndefined();
    expect(item!.reason).toMatch(/no banker is currently assigned/i);
  });

  it('every item carries the assignedBanker name when one is on file', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' }); // blocked
    const t = task({
      id: 't-pfs',
      dueDate: '2026-04-01T00:00:00Z',
      title: 'Confirm collateral',
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [t], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.bankerName).toBe('M. Paller');
    }
  });
});

describe('deriveTeamWorkQueue — individual signal types', () => {
  it('flags overdue tasks', () => {
    const d = deal({});
    const t = task({
      id: 't-pfs',
      dueDate: '2026-04-01T00:00:00Z',
      title: 'Confirm collateral',
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [t], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    const item = find(items, 'overdue-task');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('overdue');
    expect(item!.title).toBe('Confirm collateral');
  });

  it('flags overdue outstanding documents', () => {
    const d = deal({});
    const od = doc({
      id: 'd-pfs',
      name: 'Personal Financial Statement',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [], outstandingDocuments: [od], memos: [] },
      now: NOW,
    });
    const item = find(items, 'overdue-document');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('overdue');
    expect(item!.title).toBe('Personal Financial Statement');
  });

  it('flags a deal as blocked when past target close by 7+ days', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' }); // 12d before NOW
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    const item = find(items, 'blocked-deal');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('blocked');
    expect(item!.reason).toMatch(/12 days ago/i);
  });

  it('flags a deal as at-risk past close when within the blocked threshold', () => {
    const d = deal({ targetCloseDate: '2026-05-10T00:00:00Z' }); // 3d before NOW
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    const arItem = items.find((i) => i.id.endsWith('::at-risk-past-close'));
    expect(arItem).toBeDefined();
    expect(arItem!.severity).toBe('at-risk');
    expect(find(items, 'blocked-deal')).toBeUndefined();
  });

  it('flags at-risk on stale stage (>30 days)', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' }); // 73 days
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    const item = items.find((i) => i.id.endsWith('::stale-stage'));
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/73 days/i);
  });

  it('flags memo review when a memo is marked stale', () => {
    const d = deal({});
    const m = memo({ statusKey: 'stale', name: 'Acme v1' });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [], outstandingDocuments: [], memos: [m] },
      now: NOW,
    });
    const item = find(items, 'memo-review');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/Acme v1/);
  });

  it('flags memo review when a final memo exists AND there are overdue items', () => {
    const d = deal({});
    const m = memo({ statusKey: 'final', name: 'Acme Final' });
    const t = task({ dueDate: '2026-04-01T00:00:00Z' });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [t], outstandingDocuments: [], memos: [m] },
      now: NOW,
    });
    expect(
      items.find((i) => i.id.endsWith('::memo-review-newer-events')),
    ).toBeDefined();
  });

  it('flags closing soon for deals targeting close within 14 days', () => {
    const d = deal({ targetCloseDate: '2026-05-20T00:00:00Z' }); // 7d from NOW
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    const item = find(items, 'closing-soon');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('upcoming');
    expect(item!.reason).toMatch(/7 day/i);
  });
});

describe('deriveTeamWorkQueue — sort order', () => {
  it('blocked beats overdue (even if overdue task is far overdue)', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' }); // blocked
    const t = task({ dueDate: '2025-12-01T00:00:00Z' }); // ~160d overdue
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [t], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    expect(items[0]!.severity).toBe('blocked');
  });

  it('unassigned-banker (blocked) is at the very top of its tier', () => {
    const d = deal({
      assignedBankerId: undefined,
      assignedBankerName: undefined,
      targetCloseDate: '2026-05-01T00:00:00Z', // also blocked
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: emptyChildren(),
      now: NOW,
    });
    // Both items are blocked; unassigned-banker carries a +500 sortKey
    // bump so the manager sees the routing gap above the past-close
    // blocker.
    expect(items[0]!.type).toBe('unassigned-banker');
    expect(items[1]!.type).toBe('blocked-deal');
  });

  it('overdue beats at-risk; at-risk beats upcoming', () => {
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
    const c = deal({
      id: 'd-task',
      name: 'Overdue Task Deal',
      stageEntryDate: '2026-05-01T00:00:00Z',
    });
    const t = task({ dealId: 'd-task', dueDate: '2026-05-10T00:00:00Z' });
    const items = deriveTeamWorkQueue({
      deals: [a, b, c],
      children: { tasks: [t], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    const overdueIdx = items.findIndex((i) => i.severity === 'overdue');
    const atRiskIdx = items.findIndex((i) => i.severity === 'at-risk');
    const upcomingIdx = items.findIndex((i) => i.severity === 'upcoming');
    expect(overdueIdx).toBeLessThan(atRiskIdx);
    expect(atRiskIdx).toBeLessThan(upcomingIdx);
  });
});

describe('deriveTeamWorkQueue — scoping integrity', () => {
  it('drops tasks whose dealId is not in the manager-authorized deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphan = task({
      id: 't-orphan',
      dealId: 'cross-team-deal',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [orphan], outstandingDocuments: [], memos: [] },
      now: NOW,
    });
    expect(items).toEqual([]);
  });

  it('drops documents whose dealId is not in the manager-authorized deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphanDoc = doc({
      id: 'd-orphan',
      dealId: 'cross-team-deal',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveTeamWorkQueue({
      deals: [d],
      children: { tasks: [], outstandingDocuments: [orphanDoc], memos: [] },
      now: NOW,
    });
    expect(items).toEqual([]);
  });
});

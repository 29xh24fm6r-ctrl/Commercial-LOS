import { describe, it, expect } from 'vitest';
import type {
  TeamDealRow,
  TeamDocumentRow,
  TeamMemoRow,
  TeamTaskRow,
} from './teamQueries';
import {
  deriveSharedWorkQueue,
  type SharedWorkQueueItem,
} from './sharedWorkQueueRules';

const NOW = new Date('2026-05-13T12:00:00Z');

function deal(overrides: Partial<TeamDealRow>): TeamDealRow {
  return {
    id: 'deal-1',
    name: 'Acme Inc — Working Capital',
    clientName: 'Acme Inc',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    targetCloseDate: '2026-09-30T00:00:00Z',
    stageEntryDate: '2026-05-01T00:00:00Z',
    modifiedOn: '2026-05-10T00:00:00Z',
    assignedBankerId: 'banker-1',
    assignedBankerName: 'M. Paller',
    ...overrides,
  };
}

function task(overrides: Partial<TeamTaskRow>): TeamTaskRow {
  return {
    id: 't-1',
    title: 'A task',
    completed: false,
    dueDate: undefined,
    assigneeName: 'M. Paller',
    modifiedOn: undefined,
    dealId: 'deal-1',
    dealName: 'Acme Inc — Working Capital',
    ...overrides,
  };
}

function docRow(overrides: Partial<TeamDocumentRow>): TeamDocumentRow {
  return {
    id: 'd-1',
    name: 'A document',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
    dealId: 'deal-1',
    dealName: 'Acme Inc — Working Capital',
    ...overrides,
  };
}

function memo(overrides: Partial<TeamMemoRow>): TeamMemoRow {
  return {
    id: 'm-1',
    name: 'Memo v1',
    statusKey: 'draft',
    generatedAt: '2026-05-10T00:00:00Z',
    modifiedOn: '2026-05-10T00:00:00Z',
    dealId: 'deal-1',
    dealName: 'Acme Inc — Working Capital',
    ...overrides,
  };
}

function emptyInput() {
  return { deals: [], tasks: [], documents: [], memos: [], now: NOW };
}

function find(items: SharedWorkQueueItem[], type: SharedWorkQueueItem['type']) {
  return items.find((i) => i.type === type);
}

describe('deriveSharedWorkQueue — empty / no signals', () => {
  it('returns an empty array when there are no deals or children', () => {
    expect(deriveSharedWorkQueue(emptyInput())).toEqual([]);
  });

  it('returns an empty array when a clean deal has no signals', () => {
    const d = deal({});
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
    });
    expect(items).toEqual([]);
  });
});

describe('deriveSharedWorkQueue — team-specific signals', () => {
  it('flags an unassigned open task as BLOCKED severity', () => {
    const d = deal({});
    const t = task({ assigneeName: undefined, title: 'Confirm collateral' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
    });
    const item = find(items, 'unassigned-task');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('blocked');
    expect(item!.ownerName).toBeUndefined();
    expect(item!.reason).toMatch(/no assignee/i);
  });

  it('does NOT flag a completed task as unassigned even if no assignee', () => {
    const d = deal({});
    const t = task({ assigneeName: undefined, completed: true });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
    });
    expect(items).toEqual([]);
  });

  it('every item carries an owner when one is on file', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' });
    const t = task({
      id: 't-pfs',
      dueDate: '2026-04-01T00:00:00Z',
      assigneeName: 'A. Banker',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
    });
    const blocked = items.find((i) => i.type === 'blocked-deal');
    const overdue = items.find((i) => i.type === 'overdue-task');
    expect(blocked!.ownerName).toBe('M. Paller');
    expect(overdue!.ownerName).toBe('A. Banker');
  });
});

describe('deriveSharedWorkQueue — individual signal types', () => {
  it('flags overdue tasks', () => {
    const d = deal({});
    const t = task({
      id: 't-pfs',
      dueDate: '2026-04-01T00:00:00Z',
      title: 'Confirm collateral',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
    });
    const item = find(items, 'overdue-task');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('overdue');
    expect(item!.title).toBe('Confirm collateral');
  });

  it('flags overdue outstanding documents (and ignores non-outstanding)', () => {
    const d = deal({});
    const od = docRow({
      id: 'd-pfs',
      name: 'Personal Financial Statement',
      dueDate: '2026-04-01T00:00:00Z',
      status: 'outstanding',
    });
    const receivedDoc = docRow({
      id: 'd-received',
      name: 'Received Doc',
      dueDate: '2026-04-01T00:00:00Z',
      status: 'received',
      receivedDate: '2026-04-15T00:00:00Z',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      documents: [od, receivedDoc],
    });
    expect(items.filter((i) => i.type === 'overdue-document').length).toBe(1);
    expect(find(items, 'overdue-document')!.title).toBe('Personal Financial Statement');
  });

  it('flags a deal as blocked when past target close by 7+ days', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
    });
    const item = find(items, 'blocked-deal');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('blocked');
    expect(item!.reason).toMatch(/12 days ago/i);
  });

  it('flags at-risk past close when within the blocked threshold', () => {
    const d = deal({ targetCloseDate: '2026-05-10T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
    });
    expect(items.find((i) => i.id.endsWith('::at-risk-past-close'))).toBeDefined();
    expect(find(items, 'blocked-deal')).toBeUndefined();
  });

  it('flags at-risk on stale stage (>30 days)', () => {
    const d = deal({ stageEntryDate: '2026-03-01T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
    });
    const item = items.find((i) => i.id.endsWith('::stale-stage'));
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/73 days/i);
  });

  it('flags memo review when a memo is marked stale', () => {
    const d = deal({});
    const m = memo({ statusKey: 'stale', name: 'Acme v1' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      memos: [m],
    });
    const item = find(items, 'memo-review');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('at-risk');
    expect(item!.reason).toMatch(/Acme v1/);
  });

  it('flags memo review when a final memo exists AND overdue items remain', () => {
    const d = deal({});
    const m = memo({ statusKey: 'final', name: 'Acme Final' });
    const t = task({ dueDate: '2026-04-01T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
      memos: [m],
    });
    expect(items.find((i) => i.id.endsWith('::memo-review-newer-events'))).toBeDefined();
  });

  it('flags closing soon for deals targeting close within 14 days', () => {
    const d = deal({ targetCloseDate: '2026-05-20T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
    });
    const item = find(items, 'closing-soon');
    expect(item).toBeDefined();
    expect(item!.severity).toBe('upcoming');
    expect(item!.reason).toMatch(/7 day/i);
  });
});

describe('deriveSharedWorkQueue — sort order', () => {
  it('blocked beats overdue even when overdue is days-old', () => {
    const d = deal({ targetCloseDate: '2026-05-01T00:00:00Z' });
    const t = task({ dueDate: '2025-12-01T00:00:00Z' });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [t],
    });
    expect(items[0]!.severity).toBe('blocked');
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
    const t = task({
      dealId: 'd-task',
      dealName: 'Overdue Task Deal',
      dueDate: '2026-05-10T00:00:00Z',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [a, b, c],
      tasks: [t],
    });
    const overdueIdx = items.findIndex((i) => i.severity === 'overdue');
    const atRiskIdx = items.findIndex((i) => i.severity === 'at-risk');
    const upcomingIdx = items.findIndex((i) => i.severity === 'upcoming');
    expect(overdueIdx).toBeLessThan(atRiskIdx);
    expect(atRiskIdx).toBeLessThan(upcomingIdx);
  });
});

describe('deriveSharedWorkQueue — scoping integrity', () => {
  it('drops tasks whose dealId is not in the team deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphan = task({
      id: 't-orphan',
      dealId: 'cross-team-deal',
      dealName: 'Other Team Deal',
      dueDate: '2026-04-01T00:00:00Z',
      assigneeName: undefined,
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      tasks: [orphan],
    });
    expect(items).toEqual([]);
  });

  it('drops documents whose dealId is not in the team deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphan = docRow({
      id: 'd-orphan',
      dealId: 'cross-team-deal',
      dueDate: '2026-04-01T00:00:00Z',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      documents: [orphan],
    });
    expect(items).toEqual([]);
  });

  it('drops memo-driven signals whose dealId is not in the team deals list', () => {
    const d = deal({ id: 'authorized-deal' });
    const orphan = memo({
      id: 'm-orphan',
      dealId: 'cross-team-deal',
      statusKey: 'stale',
    });
    const items = deriveSharedWorkQueue({
      ...emptyInput(),
      deals: [d],
      memos: [orphan],
    });
    expect(items).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveLoanWorkbench, rowsForSection } from './loanWorkbenchModel';
import type { PipelineDeal } from './dealQueries';
import type { WorkQueueTaskRow } from './workQueueQueries';

/**
 * Phase 258 — Loan Workflow workbench derivation.
 */

const NOW = new Date('2026-06-26T12:00:00Z');

function deal(over: Partial<PipelineDeal> & Pick<PipelineDeal, 'id' | 'name'>): PipelineDeal {
  return {
    clientName: undefined,
    stage: undefined,
    status: undefined,
    amount: undefined,
    targetCloseDate: undefined,
    lastActivityOn: undefined,
    stageEntryDate: undefined,
    createdOn: undefined,
    isClosed: false,
    collateralSummary: undefined,
    ...over,
  };
}

function task(over: Partial<WorkQueueTaskRow> & Pick<WorkQueueTaskRow, 'id' | 'dealId' | 'title'>): WorkQueueTaskRow {
  return { dueDate: undefined, modifiedOn: undefined, completed: false, ...over };
}

describe('Phase 258 — deriveLoanWorkbench', () => {
  it('maps each deal to a workbench row with owner, borrower, stage, status, amount', () => {
    const model = deriveLoanWorkbench(
      [deal({ id: 'd1', name: 'Acme WC', clientName: 'Acme Holdings', stage: 'Intake', status: 'Open', amount: 250000 })],
      [],
      'Dana Banker',
      NOW,
    );
    const r = model.rows[0]!;
    expect(r.name).toBe('Acme WC');
    expect(r.borrower).toBe('Acme Holdings');
    expect(r.stage).toBe('Intake');
    expect(r.status).toBe('Open');
    expect(r.amount).toBe(250000);
    expect(r.owner).toBe('Dana Banker');
  });

  it('derives next action from the earliest-due open task, else "Open workflow"', () => {
    const model = deriveLoanWorkbench(
      [deal({ id: 'd1', name: 'Acme' }), deal({ id: 'd2', name: 'Globex' })],
      [
        task({ id: 't1', dealId: 'd1', title: 'Collect tax returns', dueDate: '2026-07-10T00:00:00Z' }),
        task({ id: 't2', dealId: 'd1', title: 'Order appraisal', dueDate: '2026-07-01T00:00:00Z' }),
      ],
      'Dana',
      NOW,
    );
    const byId = new Map(model.rows.map((r) => [r.id, r]));
    expect(byId.get('d1')!.nextAction).toBe('Order appraisal'); // earliest due
    expect(byId.get('d2')!.nextAction).toBe('Open workflow'); // no tasks
  });

  it('puts a freshly-created deal in My Active Deals AND Recently Created', () => {
    const model = deriveLoanWorkbench(
      [deal({ id: 'd1', name: 'Just Created', createdOn: '2026-06-26T11:00:00Z' })],
      [],
      'Dana',
      NOW,
    );
    expect(model.counts.active).toBe(1);
    expect(model.counts.recent).toBe(1);
    const recent = rowsForSection(model, 'recent');
    expect(recent.map((r) => r.id)).toContain('d1');
  });

  it('flags Closing Soon (target close within 14 days) and Needs Attention (stale / past close / overdue task)', () => {
    const model = deriveLoanWorkbench(
      [
        deal({ id: 'closing', name: 'Closing', targetCloseDate: '2026-06-30T00:00:00Z' }),
        deal({ id: 'stale', name: 'Stale', lastActivityOn: '2026-05-01T00:00:00Z' }),
        deal({ id: 'overdue', name: 'Overdue', lastActivityOn: '2026-06-26T00:00:00Z' }),
      ],
      [task({ id: 't1', dealId: 'overdue', title: 'Late task', dueDate: '2026-06-01T00:00:00Z' })],
      'Dana',
      NOW,
    );
    const byId = new Map(model.rows.map((r) => [r.id, r]));
    expect(byId.get('closing')!.sections).toContain('closing');
    expect(byId.get('stale')!.sections).toContain('attention');
    expect(byId.get('overdue')!.sections).toContain('attention');
  });

  it('orders Recently Created newest-first', () => {
    const model = deriveLoanWorkbench(
      [
        deal({ id: 'older', name: 'Older', createdOn: '2026-06-10T00:00:00Z' }),
        deal({ id: 'newer', name: 'Newer', createdOn: '2026-06-25T00:00:00Z' }),
      ],
      [],
      'Dana',
      NOW,
    );
    expect(rowsForSection(model, 'recent').map((r) => r.id)).toEqual(['newer', 'older']);
  });
});

describe('D-01 — a classified test/smoke deal is a full row (findable) but excluded from queue-card counts', () => {
  it('a test-flagged deal still belongs to its sections (findable via rowsForSection / search) but does not increment counts.active', () => {
    const model = deriveLoanWorkbench(
      [
        deal({ id: 'real-1', name: 'Acme WC' }),
        deal({
          id: '310da4b3-cb86-f111-ab10-70a8a59b1fe2',
          name: 'SYSTEM TEST - Read Path Forensic Deal',
          stage: 'Underwriting',
          isTestRecord: true,
        }),
      ],
      [],
      'Dana',
      NOW,
    );

    // The count is an operational-only KPI: only the real deal contributes.
    expect(model.counts.active).toBe(1);

    // But the test row is still present and section-browsable/searchable —
    // it is never dropped from `rows`, only excluded from the tally.
    const active = rowsForSection(model, 'active');
    expect(active.map((r) => r.id)).toContain('310da4b3-cb86-f111-ab10-70a8a59b1fe2');
    const testRow = model.rows.find((r) => r.id === '310da4b3-cb86-f111-ab10-70a8a59b1fe2')!;
    expect(testRow.isTestRecord).toBe(true);
    expect(testRow.stage).toBe('Underwriting');
  });

  it('a deal with isTestRecord omitted (an ordinary handwritten fixture) is treated as a real deal and counted', () => {
    const model = deriveLoanWorkbench([deal({ id: 'd1', name: 'No flag set' })], [], 'Dana', NOW);
    expect(model.counts.active).toBe(1);
    expect(model.rows[0]!.isTestRecord).toBeUndefined();
  });
});

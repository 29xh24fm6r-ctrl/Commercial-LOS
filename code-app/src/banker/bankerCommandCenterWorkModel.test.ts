// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  deriveBankerWorkQueue,
  deriveBankerPipelineByStage,
} from './bankerCommandCenterWorkModel';
import type { BankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import type { PipelineDeal } from './dealQueries';

function kpis(over: Partial<BankerPersonalActivity> = {}): BankerPersonalActivity {
  return {
    activeDeals: 0, totalAmount: 0, dealsMissingAmount: 0,
    closingSoonCount: 0, pastTargetCloseCount: 0, stageAtRiskCount: 0, missingStageEntryDateCount: 0,
    openTaskCount: 0, overdueTaskCount: 0,
    outstandingDocumentCount: 0, pendingReviewDocumentCount: 0,
    draftMemoCount: 0, inUnderwritingCount: 0, staleActivityCount: 0, urgentItemCount: 0,
    ...over,
  };
}

function deal(over: Partial<PipelineDeal> = {}): PipelineDeal {
  return {
    id: 'd', name: 'Deal', clientName: undefined, stage: 'Intake', status: 'Open',
    amount: 0, targetCloseDate: undefined, lastActivityOn: undefined, stageEntryDate: undefined,
    isClosed: false,
    ...over,
  } as PipelineDeal;
}

describe('deriveBankerWorkQueue', () => {
  it('is empty (honest "you\'re clear") when nothing needs attention', () => {
    expect(deriveBankerWorkQueue(kpis())).toEqual([]);
  });

  it('leads with urgent (the one Seal-Red tone) and routes each bucket to its real tab', () => {
    const q = deriveBankerWorkQueue(
      kpis({ urgentItemCount: 1, outstandingDocumentCount: 3, pendingReviewDocumentCount: 1, staleActivityCount: 2 }),
    );
    expect(q[0]).toMatchObject({ id: 'urgent', tone: 'urgent', target: 'my-alerts', count: 1 });
    expect(q[0].label).toMatch(/1 urgent item /); // singular
    const dd = q.find((i) => i.id === 'due-diligence')!;
    expect(dd).toMatchObject({ count: 4, target: 'due-diligence' }); // 3 + 1
    expect(q.find((i) => i.id === 'stale')).toMatchObject({ count: 2, target: 'active-deals' });
  });

  it('pluralizes honestly', () => {
    const q = deriveBankerWorkQueue(kpis({ urgentItemCount: 2 }));
    expect(q[0].label).toMatch(/2 urgent items /);
  });

  it('does not double-list tasks: open tasks only show when there are no overdue tasks', () => {
    const overdue = deriveBankerWorkQueue(kpis({ overdueTaskCount: 2, openTaskCount: 5 }));
    expect(overdue.map((i) => i.id)).toContain('overdue-tasks');
    expect(overdue.map((i) => i.id)).not.toContain('open-tasks');

    const openOnly = deriveBankerWorkQueue(kpis({ openTaskCount: 5 }));
    expect(openOnly.map((i) => i.id)).toContain('open-tasks');
  });

  it('fabricates nothing — a zero count never appears as a work item', () => {
    const q = deriveBankerWorkQueue(kpis({ urgentItemCount: 1 }));
    expect(q.every((i) => i.count > 0)).toBe(true);
    expect(q).toHaveLength(1);
  });
});

describe('deriveBankerPipelineByStage', () => {
  it('groups ACTIVE deals by their real stage (no faked distribution) and sums amounts', () => {
    const snap = deriveBankerPipelineByStage([
      deal({ id: '1', stage: 'Intake', amount: 100 }),
      deal({ id: '2', stage: 'Intake', amount: 200 }),
      deal({ id: '3', stage: 'Underwriting', amount: 50 }),
      deal({ id: '4', stage: 'Intake', amount: undefined }),
      deal({ id: '5', stage: 'Closed', amount: 999, isClosed: true }), // excluded
    ]);
    expect(snap.totalActive).toBe(4);
    expect(snap.totalAmount).toBe(350);
    expect(snap.groups[0]).toEqual({ stage: 'Intake', count: 3, amount: 300 }); // most by count, first
    expect(snap.groups.find((g) => g.stage === 'Underwriting')).toEqual({ stage: 'Underwriting', count: 1, amount: 50 });
  });

  it('shows the honest single bucket when stages are unseeded (all at one stage)', () => {
    const snap = deriveBankerPipelineByStage([deal({ id: '1' }), deal({ id: '2' }), deal({ id: '3' })]);
    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0]).toMatchObject({ stage: 'Intake', count: 3 });
  });

  it('labels deals with no stage as "Unstaged" rather than inventing one', () => {
    const snap = deriveBankerPipelineByStage([deal({ id: '1', stage: undefined }), deal({ id: '2', stage: '  ' })]);
    expect(snap.groups).toEqual([{ stage: 'Unstaged', count: 2, amount: 0 }]);
  });

  it('speaks the canonical stage vocabulary: stored codes/legacy names display as ratified names', () => {
    // The reconciliation's canonical vocabulary — a stored CODE and a mixed-case name both collapse
    // to the one ratified display name, so a deal at "INTAKE" and one at "intake" group together.
    const snap = deriveBankerPipelineByStage([
      deal({ id: '1', stage: 'INTAKE' }),
      deal({ id: '2', stage: 'intake' }),
      deal({ id: '3', stage: 'CREDIT_APPROVAL' }),
    ]);
    expect(snap.groups.find((g) => g.stage === 'Intake')).toMatchObject({ count: 2 });
    expect(snap.groups.find((g) => g.stage === 'Credit Approval')).toMatchObject({ count: 1 });
    // The raw code is never shown once it maps to a canonical stage.
    expect(snap.groups.map((g) => g.stage)).not.toContain('INTAKE');
  });

  it('keeps a non-canonical stage raw (honest "unmapped"), never coerced to a canonical stage', () => {
    const snap = deriveBankerPipelineByStage([deal({ id: '1', stage: 'Prospecting' })]);
    expect(snap.groups).toEqual([{ stage: 'Prospecting', count: 1, amount: 0 }]);
  });
});

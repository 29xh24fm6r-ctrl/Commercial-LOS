import { describe, it, expect } from 'vitest';
import {
  deriveDealCockpitMetrics,
  PROFILE_COMPLETENESS_FIELDS,
  type DealCockpitMetricsInput,
} from './dealCockpitMetrics';
import type { DealDetail } from './dealQueries';

/**
 * Phase 125D — deriveDealCockpitMetrics() unit tests.
 *
 * Pins the deterministic shape and tonal values the cockpit
 * KPI deck + workstream bars + right-rail count badges render
 * against. Everything tested here flows from authorized-record
 * data via typed-field presence — no AI, no prediction, no
 * approval-odds.
 */

const NOW = new Date('2026-05-27T12:00:00Z');

function deal(over: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'd-1',
    name: 'Acme RLOC',
    clientName: 'Acme Manufacturing',
    stage: 'Underwriting',
    status: 'Active',
    amount: 4_500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-15T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'Two personal guarantors',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R, inventory, equipment',
    createdOn: '2026-01-15T00:00:00Z',
    stageEntryDate: '2026-05-10T00:00:00Z',
    isClosed: false,
    ...over,
  };
}

function input(over: Partial<DealCockpitMetricsInput> = {}): DealCockpitMetricsInput {
  return {
    deal: deal(),
    tasks: { open: [], completed: [] },
    documents: { outstanding: [], received: [], reviewed: [] },
    creditMemo: { memos: [], sections: [] },
    activity: [],
    ...over,
  };
}

describe('deriveDealCockpitMetrics — profile completeness', () => {
  it('returns the configured field-count denominator', () => {
    const m = deriveDealCockpitMetrics(input(), NOW);
    expect(m.totalFieldCount).toBe(PROFILE_COMPLETENESS_FIELDS.length);
  });

  it('returns 100% and zero missing labels when every tracked field is populated', () => {
    const m = deriveDealCockpitMetrics(input(), NOW);
    expect(m.profileCompletenessPct).toBe(100);
    expect(m.missingFieldLabels).toEqual([]);
  });

  it('returns 0% and lists every tracked field as missing for a fully sparse deal', () => {
    const sparse = deal({
      clientName: undefined,
      stage: undefined,
      status: undefined,
      amount: undefined,
      bankerName: undefined,
      targetCloseDate: undefined,
      productType: undefined,
      loanStructure: undefined,
      customerType: undefined,
      industry: undefined,
      guarantorStructure: undefined,
      pricingType: undefined,
      spreadIndex: undefined,
      spreadMargin: undefined,
      collateralSummary: undefined,
      createdOn: undefined,
      stageEntryDate: undefined,
    });
    const m = deriveDealCockpitMetrics(input({ deal: sparse }), NOW);
    expect(m.profileCompletenessPct).toBe(0);
    expect(m.missingFieldLabels.length).toBe(PROFILE_COMPLETENESS_FIELDS.length);
  });

  it('treats whitespace-only strings as missing (honest absence)', () => {
    const d = deal({ industry: '   ' });
    const m = deriveDealCockpitMetrics(input({ deal: d }), NOW);
    expect(m.missingFieldLabels).toContain('Industry');
  });
});

describe('deriveDealCockpitMetrics — days arithmetic', () => {
  it('computes days-to-close as a forward delta when the target is in the future', () => {
    const d = deal({ targetCloseDate: '2026-06-10T00:00:00Z' }); // ~14d from NOW
    const m = deriveDealCockpitMetrics(input({ deal: d }), NOW);
    expect(m.daysToClose).toBe(14);
  });

  it('returns a negative days-to-close when the target is past', () => {
    const d = deal({ targetCloseDate: '2026-05-10T00:00:00Z' }); // 17d ago
    const m = deriveDealCockpitMetrics(input({ deal: d }), NOW);
    expect(m.daysToClose).toBe(-17);
  });

  it('returns undefined daysToClose / daysInStage when source dates are unset (honest absence)', () => {
    const d = deal({ targetCloseDate: undefined, stageEntryDate: undefined });
    const m = deriveDealCockpitMetrics(input({ deal: d }), NOW);
    expect(m.daysToClose).toBeUndefined();
    expect(m.daysInStage).toBeUndefined();
  });
});

describe('deriveDealCockpitMetrics — task counts', () => {
  it('counts open + completed honestly, and flags overdue tasks', () => {
    const m = deriveDealCockpitMetrics(
      input({
        tasks: {
          open: [
            {
              id: 't1',
              title: 'a',
              dueDate: '2026-04-01T00:00:00Z',
              modifiedOn: undefined,
              completed: false,
              assigneeName: undefined,
            },
            {
              id: 't2',
              title: 'b',
              dueDate: '2026-07-01T00:00:00Z',
              modifiedOn: undefined,
              completed: false,
              assigneeName: undefined,
            },
          ],
          completed: [
            {
              id: 't3',
              title: 'c',
              dueDate: undefined,
              modifiedOn: '2026-05-20T00:00:00Z',
              completed: true,
              assigneeName: undefined,
            },
          ],
        },
      }),
      NOW,
    );
    expect(m.taskOpenCount).toBe(2);
    expect(m.taskCompletedCount).toBe(1);
    expect(m.taskOverdueCount).toBe(1);
    expect(m.rightRail.tasksOpen).toBe(2);
  });

  it('returns zero task counts when the slot is undefined (loading) — never fakes a "1 open"', () => {
    const m = deriveDealCockpitMetrics(input({ tasks: undefined }), NOW);
    expect(m.taskOpenCount).toBe(0);
    expect(m.taskOverdueCount).toBe(0);
    expect(m.taskCompletedCount).toBe(0);
  });
});

describe('deriveDealCockpitMetrics — memo state', () => {
  it('returns memoState=none and memoCount=0 when there are no memos', () => {
    const m = deriveDealCockpitMetrics(input(), NOW);
    expect(m.memoState).toBe('none');
    expect(m.memoCount).toBe(0);
  });

  it('returns memoState=draft when only a draft memo exists', () => {
    const m = deriveDealCockpitMetrics(
      input({
        creditMemo: {
          memos: [memoFixture({ statusKey: 'draft' })],
          sections: [],
        },
      }),
      NOW,
    );
    expect(m.memoState).toBe('draft');
    expect(m.memoCount).toBe(1);
  });

  it('returns memoState=borrower-safe when any memo carries borrowerSafe=true (even if statusKey is draft)', () => {
    const m = deriveDealCockpitMetrics(
      input({
        creditMemo: {
          memos: [memoFixture({ statusKey: 'draft', borrowerSafe: true })],
          sections: [],
        },
      }),
      NOW,
    );
    expect(m.memoState).toBe('borrower-safe');
  });

  it('returns memoState=final when any memo statusKey is final', () => {
    const m = deriveDealCockpitMetrics(
      input({
        creditMemo: {
          memos: [memoFixture({ statusKey: 'final' })],
          sections: [],
        },
      }),
      NOW,
    );
    expect(m.memoState).toBe('final');
  });
});

describe('deriveDealCockpitMetrics — communication state', () => {
  it('returns communicationState=unknown when activity is undefined (loading)', () => {
    const m = deriveDealCockpitMetrics(input({ activity: undefined }), NOW);
    expect(m.communicationState).toBe('unknown');
  });

  it('returns communicationState=none when activity is empty', () => {
    const m = deriveDealCockpitMetrics(input({ activity: [] }), NOW);
    expect(m.communicationState).toBe('none');
  });

  it('returns communicationState=has-events when activity contains a communication event', () => {
    const m = deriveDealCockpitMetrics(
      input({
        activity: [
          {
            id: 'a1',
            title: 'Email logged',
            summary: undefined,
            eventAt: '2026-05-20T00:00:00Z',
            eventType: 'Email',
            eventTypeKey: 'EmailLogged',
            eventSubType: undefined,
            isSystemGenerated: false,
            actorName: 'M. Paller',
            relatedEntityType: undefined,
            relatedEntityId: undefined,
          },
        ],
      }),
      NOW,
    );
    expect(m.communicationState).toBe('has-events');
    expect(m.rightRail.communicationEvents).toBe(1);
  });
});

function memoFixture(over: Partial<{
  id: string;
  name: string;
  status: string | undefined;
  statusKey: 'draft' | 'final' | 'stale';
  memoType: string;
  version: number;
  generatedAt: string;
  modifiedOn: string | undefined;
  borrowerSafe: boolean;
  textPreview: string | undefined;
}> = {}) {
  return {
    id: 'm1',
    name: 'Memo v1',
    status: 'Draft',
    statusKey: 'draft' as const,
    memoType: 'Banker draft',
    version: 1,
    generatedAt: '2026-05-10T00:00:00Z',
    modifiedOn: '2026-05-20T00:00:00Z',
    borrowerSafe: false,
    textPreview: undefined,
    ...over,
  };
}

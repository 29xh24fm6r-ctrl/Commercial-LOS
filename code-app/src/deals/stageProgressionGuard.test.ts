import { describe, it, expect } from 'vitest';
import type { DealDetail } from './dealQueries';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoSummary } from './creditMemoQueries';
import { deriveStageProgressionEligibility } from './stageProgressionGuard';

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
  // threshold (30 days) so clean fixtures do not pick up an
  // unintended at-risk signal from the underlying blocker rule.
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

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

function memo(overrides: Partial<CreditMemoSummary>): CreditMemoSummary {
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

describe('deriveStageProgressionEligibility', () => {
  it('returns clear when no signals fire and a memo is on file for a memo-gating stage', () => {
    const r = deriveStageProgressionEligibility({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('clear');
    expect(r.currentStage).toBe('Underwriting');
    expect(r.reasons).toEqual([]);
    expect(r.nextActionGuidance).toMatch(/banker review/i);
    // Clear copy must not promise progression — only state that nothing
    // is currently blocking.
    expect(/\bapproved\b/i.test(r.nextActionGuidance)).toBe(false);
    expect(/\bcleared\b/i.test(r.nextActionGuidance)).toBe(false);
  });

  it('echoes the current stage even when there are reasons', () => {
    const dealNoStage: DealDetail = { ...baseDeal, stage: undefined };
    const r = deriveStageProgressionEligibility({
      deal: dealNoStage,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.currentStage).toBeUndefined();
  });

  it('returns blocked when deriveBlockers reports the deal blocked', () => {
    // Past-target-close > 7 days makes deriveBlockers status = blocked.
    const overdueDeal: DealDetail = {
      ...baseDeal,
      targetCloseDate: '2026-05-01T00:00:00Z',
    };
    const r = deriveStageProgressionEligibility({
      deal: overdueDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('blocked');
    expect(r.reasons.some((reason) => reason.id === 'blockers-blocked')).toBe(true);
    expect(r.nextActionGuidance).toMatch(/Resolve the listed signals/i);
    expect(r.nextActionGuidance).toMatch(/not a credit decision/i);
  });

  it('returns at-risk when deriveBlockers reports at-risk (e.g. stale stage)', () => {
    // Old stageEntryDate triggers stale-stage signal from blockerRules.
    const staleStageDeal: DealDetail = {
      ...baseDeal,
      stageEntryDate: '2026-03-01T00:00:00Z', // 73 days — past 30-day threshold
    };
    const r = deriveStageProgressionEligibility({
      deal: staleStageDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'blockers-at-risk')).toBe(true);
  });

  it('returns blocked when stage is a memo-gating stage and there is no memo on file', () => {
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Underwriting Review' },
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('blocked');
    expect(r.reasons.some((reason) => reason.id === 'memo-required-missing')).toBe(true);
  });

  it('memo-gating rule also fires on Committee stages (case-insensitive)', () => {
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Senior Loan Committee' },
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('blocked');
    expect(r.reasons.some((reason) => reason.id === 'memo-required-missing')).toBe(true);
  });

  it('memo-gating rule does NOT fire on a non-gating stage (e.g. Origination) without a memo', () => {
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Origination' },
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    // Origination + no memo + clean otherwise = clear.
    expect(r.status).toBe('clear');
    expect(r.reasons.some((reason) => reason.id === 'memo-required-missing')).toBe(false);
  });

  it('flags at-risk when the credit memo is marked stale', () => {
    const r = deriveStageProgressionEligibility({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: {
        memos: [memo({ status: 'Stale', statusKey: 'stale' })],
        sections: [],
      },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'memo-may-be-stale')).toBe(true);
  });

  it('flags at-risk when outstanding documents are still pending', () => {
    const documents: DealDocumentsResult = {
      outstanding: [doc({ id: 'd1', name: 'PFS' })],
      received: [],
      reviewed: [],
    };
    const r = deriveStageProgressionEligibility({
      deal: baseDeal,
      tasks: emptyTasks(),
      documents,
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('at-risk');
    expect(
      r.reasons.some((reason) => reason.id === 'outstanding-documents'),
    ).toBe(true);
  });

  it('flags at-risk when overdue open tasks exist', () => {
    const tasks: DealTasksResult = {
      open: [task({ id: 't1', title: 'Confirm collateral', dueDate: '2026-04-01T00:00:00Z' })],
      completed: [],
    };
    const r = deriveStageProgressionEligibility({
      deal: baseDeal,
      tasks,
      documents: emptyDocs(),
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('at-risk');
    expect(r.reasons.some((reason) => reason.id === 'overdue-tasks')).toBe(true);
  });

  it('combined severity: blocked beats at-risk when both fire', () => {
    // Blocked from missing memo on a gating stage, AT-risk from
    // outstanding docs — overall must be blocked.
    const documents: DealDocumentsResult = {
      outstanding: [doc({ id: 'd1', name: 'PFS' })],
      received: [],
      reviewed: [],
    };
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Underwriting' },
      tasks: emptyTasks(),
      documents,
      creditMemo: { memos: [], sections: [] },
      activity: [],
      now: NOW,
    });
    expect(r.status).toBe('blocked');
    expect(r.reasons.some((reason) => reason.id === 'memo-required-missing')).toBe(true);
    expect(
      r.reasons.some((reason) => reason.id === 'outstanding-documents'),
    ).toBe(true);
  });

  it('uses conservative copy: never claims "ineligible" / "cannot move" / "fail"; uses "appears blocked" / "review needed"', () => {
    const overdueDeal: DealDetail = { ...baseDeal, targetCloseDate: '2026-05-01T00:00:00Z' };
    const r = deriveStageProgressionEligibility({
      deal: overdueDeal,
      tasks: { open: [task({ id: 't1', dueDate: '2026-04-01T00:00:00Z' })], completed: [] },
      documents: { outstanding: [doc({ id: 'd1' })], received: [], reviewed: [] },
      creditMemo: { memos: [memo({})], sections: [] },
      activity: [],
      now: NOW,
    });
    const combined = [
      ...r.reasons.map((reason) => reason.label),
      r.nextActionGuidance,
    ].join(' ');
    // None of these decision-verb / failure words should appear.
    expect(/\bineligible\b/i.test(combined)).toBe(false);
    expect(/\bcannot\s+move\b/i.test(combined)).toBe(false);
    expect(/\bfail(ed|ing)?\b/i.test(combined)).toBe(false);
    expect(/\bapproved\b/i.test(combined)).toBe(false);
    expect(/\bcleared\s+to\s+close\b/i.test(combined)).toBe(false);
    // Next-action guidance must explicitly frame this as data, not a
    // credit decision.
    expect(r.nextActionGuidance).toMatch(/not a credit decision/i);
  });

  it('handles missing child queries (undefined tasks/documents) without throwing or inventing signals', () => {
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Origination' },
      tasks: undefined,
      documents: undefined,
      creditMemo: undefined,
      activity: undefined,
      now: NOW,
    });
    // Origination is not a memo-gating stage, and no overdue-task /
    // overdue-doc / stale-memo signals can be computed without their
    // child queries. Result must be clear.
    expect(r.status).toBe('clear');
  });

  it('a draft section alone (no top-level memo) still counts as memo-on-file for the gating rule', () => {
    const r = deriveStageProgressionEligibility({
      deal: { ...baseDeal, stage: 'Underwriting' },
      tasks: emptyTasks(),
      documents: emptyDocs(),
      creditMemo: {
        memos: [],
        sections: [
          {
            id: 'sect-1',
            sectionKey: 'executive-summary',
            sectionLabel: 'Executive Summary',
            reviewStatus: 'Pending',
            reviewStatusKey: 'Pending',
            lastGeneratedAt: '2026-05-10T00:00:00Z',
            modifiedOn: '2026-05-10T00:00:00Z',
            textPreview: undefined,
          },
        ],
      },
      activity: [],
      now: NOW,
    });
    // Section drafts exist -> the memo-gating rule does NOT fire as
    // blocked. The deal looks clean otherwise.
    expect(r.reasons.some((reason) => reason.id === 'memo-required-missing')).toBe(false);
    expect(r.status).toBe('clear');
  });
});

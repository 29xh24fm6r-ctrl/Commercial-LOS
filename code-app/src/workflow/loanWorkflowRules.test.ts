import { describe, it, expect } from 'vitest';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import { getLoanWorkflowStage } from './loanWorkflowStages';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';

/**
 * Regression coverage for the LIVE stage-transition gate (deriveLoanWorkflowReadiness /
 * deriveCreditBlockers). Previously untested despite being the function
 * evaluateStageTransitionPolicy calls on every governed stage-advance write.
 *
 * Bug fixed here: CREDIT_APPROVAL's "reviewed memo" / "committee package" /
 * "approved credit memo" requirements were satisfied by the mere PRESENCE of any
 * credit memo record (deriveCreditBlockers' generic branch), so a deal could
 * reach Commitment with a draft memo and zero committee involvement, regardless
 * of dollar amount. The schema has no field for reviewed/approved/committee
 * status (CreditMemoStatusKey is only draft/final/stale), so these must never
 * silently read "met" -- but must also never hard-block a live write path with
 * no remediation UI to clear them.
 */

const baseDeal: DealDetail = {
  id: 'deal-1',
  name: 'Test Deal',
  clientName: 'Test Client',
  stage: 'Credit Approval',
  status: 'Active',
  amount: 1_000_000,
  bankerName: 'Banker',
  targetCloseDate: '2026-09-01T00:00:00Z',
  productType: 'Term Loan',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: undefined,
  pricingType: 'Fixed',
  spreadIndex: undefined,
  spreadMargin: undefined,
  collateralSummary: undefined,
  createdOn: '2026-01-01T00:00:00Z',
  stageEntryDate: '2026-06-01T00:00:00Z',
  isClosed: false,
};

const emptyTasks: DealTasksResult = { open: [], completed: [] };
const emptyDocuments: DealDocumentsResult = { outstanding: [], received: [], reviewed: [] };

function creditApprovalStage() {
  return getLoanWorkflowStage('CREDIT_APPROVAL');
}

function memoOnly(): CreditMemoData {
  return {
    memos: [
      {
        id: 'memo-1',
        name: 'Draft Memo',
        status: 'Draft',
        statusKey: 'draft',
        memoType: 'Banker draft',
        version: 1,
        generatedAt: '2026-06-01T00:00:00Z',
        modifiedOn: '2026-06-01T00:00:00Z',
        borrowerSafe: false,
        textPreview: undefined,
      },
    ],
    sections: [
      { id: 's1', sectionKey: 'executive_summary', sectionLabel: 'Executive Summary', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
      { id: 's2', sectionKey: 'repayment_analysis', sectionLabel: 'Repayment Analysis', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
    ],
  };
}

describe('deriveLoanWorkflowReadiness — Credit Approval credit requirements', () => {
  it('a draft memo (no committee/approval evidence) never silently satisfies committee/reviewed/approved requirements', () => {
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage: creditApprovalStage(),
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: memoOnly(),
    });
    const creditIds = readiness.creditBlockers.map((b) => b.id);
    // The bug: these three used to disappear entirely (silently "met") once any memo existed.
    expect(creditIds).toContain('reviewed memo');
    expect(creditIds).toContain('committee package');
    expect(creditIds).toContain('approved credit memo');
  });

  it('committee/reviewed/approved requirements are visible but non-blocking (at-risk), never hard-blocked with no remediation path', () => {
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage: creditApprovalStage(),
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: memoOnly(),
    });
    const byId = new Map(readiness.creditBlockers.map((b) => [b.id, b]));
    expect(byId.get('reviewed memo')?.severity).toBe('at-risk');
    expect(byId.get('committee package')?.severity).toBe('at-risk');
    expect(byId.get('approved credit memo')?.severity).toBe('at-risk');
  });

  it('the literal credit-memo-presence requirement is still a real, verifiable HARD blocker when no memo exists', () => {
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage: creditApprovalStage(),
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: { memos: [], sections: [] },
    });
    const byId = new Map(readiness.creditBlockers.map((b) => [b.id, b]));
    expect(byId.get('credit memo')?.severity).toBe('blocked');
    // Committee/reviewed/approved are independently always visible, not swallowed by the missing-memo case.
    expect(byId.get('committee package')?.severity).toBe('at-risk');
  });

  it('section requirements still hard-block when the named section is missing, unaffected by the committee/reviewed/approved fix', () => {
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage: creditApprovalStage(),
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: { memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'x', version: 1, generatedAt: '', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }], sections: [] },
    });
    const byId = new Map(readiness.creditBlockers.map((b) => [b.id, b]));
    expect(byId.get('executive summary section')?.severity).toBe('blocked');
    expect(byId.get('repayment analysis section')?.severity).toBe('blocked');
  });

  it('overall status is at-risk (not blocked, not clear) when only the committee/reviewed/approved items are outstanding', () => {
    const readiness = deriveLoanWorkflowReadiness({
      deal: {
        ...baseDeal,
        productType: 'Term Loan',
        loanStructure: 'Senior Secured',
        targetCloseDate: '2026-09-01T00:00:00Z',
      },
      stage: creditApprovalStage(),
      tasks: emptyTasks,
      documents: { outstanding: [], received: [{ id: 'd1', name: 'Approval evidence', dueDate: undefined, requestDate: undefined, receivedDate: '2026-06-01T00:00:00Z', reviewer: undefined, uploaded: true, modifiedOn: undefined, status: 'received' }], reviewed: [] },
      creditMemo: memoOnly(),
    });
    expect(readiness.status).toBe('at-risk');
  });

  it('UNDERWRITING\'s unrelated "spreading analysis" credit requirement keeps its existing memo-presence behavior (regression guard for the fix\'s scope)', () => {
    const stage = getLoanWorkflowStage('UNDERWRITING');
    const withMemo = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage,
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: memoOnly(),
    });
    expect(withMemo.creditBlockers.map((b) => b.id)).not.toContain('spreading analysis');

    const withoutMemo = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage,
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: { memos: [], sections: [] },
    });
    const byId = new Map(withoutMemo.creditBlockers.map((b) => [b.id, b]));
    expect(byId.get('spreading analysis')?.severity).toBe('blocked');
  });
});

describe('deriveLoanWorkflowReadiness — closing blockers (D13 honesty fix)', () => {
  it('names the actual outstanding document/task instead of implying the closing-requirement label itself was checked and failed', () => {
    const stage = getLoanWorkflowStage('DOCUMENTATION');
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage,
      tasks: emptyTasks,
      documents: emptyDocuments, // every required document for this stage is missing
      creditMemo: { memos: [], sections: [] },
    });
    expect(readiness.closingBlockers.length).toBeGreaterThan(0);
    for (const closingBlocker of readiness.closingBlockers) {
      // Never the old, over-precise "Closing blocker: <label>" phrasing.
      expect(closingBlocker.label).not.toMatch(/^Closing blocker:/);
      // Names at least one real missing document/task the reader can act on.
      expect(closingBlocker.label).toMatch(/outstanding requirement/i);
      expect(closingBlocker.label).toMatch(/Loan agreement|Insurance evidence/);
    }
  });

  it('reports no closing blockers once every required document/task for the stage is satisfied', () => {
    const stage = getLoanWorkflowStage('DOCUMENTATION');
    const documents: DealDocumentsResult = {
      outstanding: [],
      received: [],
      reviewed: [
        { id: 'd1', name: 'Loan agreement', dueDate: undefined, requestDate: undefined, receivedDate: '2026-06-01T00:00:00Z', reviewer: 'Banker', uploaded: true, modifiedOn: undefined, status: 'reviewed' },
        { id: 'd2', name: 'Insurance evidence', dueDate: undefined, requestDate: undefined, receivedDate: '2026-06-01T00:00:00Z', reviewer: 'Banker', uploaded: true, modifiedOn: undefined, status: 'reviewed' },
      ],
    };
    const readiness = deriveLoanWorkflowReadiness({
      deal: baseDeal,
      stage,
      tasks: { open: [], completed: [{ id: 't1', title: 'Documentation checklist review', completed: true, dueDate: undefined, assigneeName: undefined, modifiedOn: undefined }] },
      documents,
      creditMemo: { memos: [], sections: [] },
    });
    expect(readiness.closingBlockers).toEqual([]);
  });
});

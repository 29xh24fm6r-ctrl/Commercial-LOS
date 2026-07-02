import { describe, expect, it } from 'vitest';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import { deriveLoanWorkflowState } from './deriveLoanWorkflowState';

const deal: DealDetail = {
  id: 'deal-1',
  name: 'Acme Expansion',
  clientName: 'Acme',
  stage: 'Credit Approval',
  status: 'Active',
  amount: 2_000_000,
  bankerName: 'Banker',
  targetCloseDate: '2026-08-31',
  productType: 'Term Loan',
  loanStructure: 'Senior secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Corporate',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 250,
  collateralSummary: 'Equipment',
  createdOn: '2026-01-01',
  stageEntryDate: '2026-06-01',
  isClosed: false,
};

const emptyTasks: DealTasksResult = { open: [], completed: [] };
const emptyDocuments: DealDocumentsResult = { outstanding: [], received: [], reviewed: [] };
const emptyMemo: CreditMemoData = { memos: [], sections: [] };

describe('deriveLoanWorkflowState', () => {
  it('produces blockers for missing credit artifacts and tasks', () => {
    const state = deriveLoanWorkflowState({
      deal,
      tasks: emptyTasks,
      documents: emptyDocuments,
      creditMemo: emptyMemo,
    });

    expect(state.currentStage.id).toBe('CREDIT_APPROVAL');
    expect(state.nextPermittedStages.map((stage) => stage.id)).toEqual(['COMMITMENT']);
    expect(state.readiness.status).toBe('blocked');
    expect(state.readiness.blockers.map((blocker) => blocker.label).join(' ')).toMatch(/Credit memo/);
    expect(state.readiness.missingTasks.map((task) => task.label)).toContain('Credit memo package review');
  });

  it('labels unavailable inputs honestly instead of treating them as complete', () => {
    const state = deriveLoanWorkflowState({
      deal: { ...deal, stage: 'Underwriting' },
      tasksUnavailable: true,
      documentsUnavailable: true,
      creditMemoUnavailable: true,
    });

    expect(state.readiness.status).toBe('blocked');
    expect(state.unavailableInputs).toEqual(['tasks', 'documents', 'credit memo']);
    expect(state.readiness.blockers.map((blocker) => blocker.type)).toContain('unavailable');
  });
});

import { describe, it, expect } from 'vitest';
import type { DealDetail } from '../deals/dealQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import { deriveLoanWorkflowState } from './deriveLoanWorkflowState';
import { evaluateStageTransitionPolicy } from './stageTransitionPolicy';
import type { CanonicalRequirement } from './loanWorkflowRequirementTypes';
import {
  evaluateDocumentRequirement,
  evaluateTaskRequirement,
  evaluateStageExitPolicy,
  deriveStageExitReadiness,
  type WorkflowRequirementFacts,
} from './loanWorkflowRequirementEngine';

/**
 * ARC Phase 2 — capability proof for typed document status, task-blocking policy, and the
 * engine↔write-policy equivalence guard for the tracked Intake gate.
 */

const baseDeal: DealDetail = {
  id: 'deal-p2', name: 'Phase 2', clientName: 'TEST', stage: 'Intake', status: 'Open', amount: 100_000,
  bankerName: 'M. Paller', targetCloseDate: '2026-12-31T00:00:00Z', productType: 'RLOC', loanStructure: 'Senior Secured',
  customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: 'One PG', pricingType: 'Floating', spreadIndex: 'SOFR',
  spreadMargin: 275, collateralSummary: 'A/R', createdOn: '2026-07-01T00:00:00Z', stageEntryDate: '2026-07-08T00:00:00Z', isClosed: false,
};

function mkDoc(name: string, status: DealDocument['status'], reviewer?: string): DealDocument {
  return { id: `d-${name}-${status}`, name, dueDate: undefined, requestDate: undefined, receivedDate: status !== 'outstanding' ? '2026-07-05T00:00:00Z' : undefined, reviewer, uploaded: status !== 'outstanding', modifiedOn: undefined, status };
}
function docsOf(parts: { outstanding?: DealDocument[]; received?: DealDocument[]; reviewed?: DealDocument[] }): DealDocumentsResult {
  return { outstanding: parts.outstanding ?? [], received: parts.received ?? [], reviewed: parts.reviewed ?? [] };
}
const emptyTasks: DealTasksResult = { open: [], completed: [] };
const noMemo: CreditMemoData = { memos: [], sections: [] };

function docReq(over: Partial<CanonicalRequirement> = {}): CanonicalRequirement {
  return {
    id: 'test:document:financials', scope: 'UNDERWRITING', label: 'Business Financial Statements',
    uiCopy: 'Provide required document: Business Financial Statements', description: '', category: 'document',
    severity: 'blocking', resolverSurface: 'Documents', responsibleRole: 'underwriter', backingType: 'document_requirement',
    tracked: true, matchMode: 'inferred', documentReviewLevel: 'received', blockerReason: 'required', ...over,
  };
}
function taskReq(over: Partial<CanonicalRequirement> = {}): CanonicalRequirement {
  return {
    id: 'test:task:uw', scope: 'UNDERWRITING', label: 'Underwriting analysis', uiCopy: 'Complete task: Underwriting analysis',
    description: '', category: 'task', severity: 'recommended', resolverSurface: 'Tasks', responsibleRole: 'underwriter',
    backingType: 'task_status', tracked: true, matchMode: 'inferred', blockerReason: 'required', ...over,
  };
}

describe('ARC Phase 2 — typed document status', () => {
  it('a received document satisfies a received-level requirement', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, documents: docsOf({ received: [mkDoc('Business Financial Statements', 'received')] }) };
    const r = evaluateDocumentRequirement(docReq({ documentReviewLevel: 'received' }), facts);
    expect(r.status).toBe('met');
    expect(r.evidence?.recordId).toBeDefined();
    expect(r.evidence?.status).toBe('received');
  });

  it('a received-but-unreviewed (uploaded-only) document does NOT satisfy a reviewed-level requirement', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, documents: docsOf({ received: [mkDoc('Business Financial Statements', 'received')] }) };
    const r = evaluateDocumentRequirement(docReq({ documentReviewLevel: 'reviewed' }), facts);
    expect(r.status).toBe('unmet');
    expect(r.canBlockTransition).toBe(true);
    expect(r.reason).toMatch(/received but not yet reviewed/i);
  });

  it('a reviewed document satisfies a reviewed-level requirement', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, documents: docsOf({ reviewed: [mkDoc('Business Financial Statements', 'reviewed', 'UW Analyst')] }) };
    const r = evaluateDocumentRequirement(docReq({ documentReviewLevel: 'reviewed' }), facts);
    expect(r.status).toBe('met');
    expect(r.evidence?.status).toBe('reviewed');
    expect(r.evidence?.reviewedBy).toBe('UW Analyst');
  });

  it('missing document data fails closed (unavailable), never fabricated as met', () => {
    const r = evaluateDocumentRequirement(docReq(), { deal: baseDeal, documentsUnavailable: true });
    expect(r.status).toBe('unavailable');
    expect(r.canBlockTransition).toBe(true);
  });

  it('an unrelated document name does not satisfy the requirement', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, documents: docsOf({ reviewed: [mkDoc('Marketing Brochure', 'reviewed', 'X')] }) };
    expect(evaluateDocumentRequirement(docReq(), facts).status).toBe('unmet');
  });
});

describe('ARC Phase 2 — task-blocking policy', () => {
  const facts: WorkflowRequirementFacts = { deal: baseDeal, tasks: emptyTasks };
  it('a blocking task blocks when incomplete; a recommended task does not', () => {
    expect(evaluateTaskRequirement(taskReq({ severity: 'blocking' }), facts).canBlockTransition).toBe(true);
    expect(evaluateTaskRequirement(taskReq({ severity: 'recommended' }), facts).canBlockTransition).toBe(false);
    expect(evaluateTaskRequirement(taskReq({ severity: 'optional' }), facts).canBlockTransition).toBe(false);
  });
  it('a completed task is met and never blocks', () => {
    const done: WorkflowRequirementFacts = { deal: baseDeal, tasks: { open: [], completed: [{ id: 't', title: 'Underwriting analysis', completed: true, dueDate: undefined, assigneeName: undefined, modifiedOn: undefined }] } };
    const r = evaluateTaskRequirement(taskReq({ severity: 'blocking' }), done);
    expect(r.status).toBe('met');
    expect(r.canBlockTransition).toBe(false);
  });
});

describe('ARC Phase 2 — engine live policy equals the write-seam policy for Intake', () => {
  const cases: { name: string; facts: WorkflowRequirementFacts }[] = [
    { name: 'missing loan application', facts: { deal: baseDeal, tasks: emptyTasks, documents: docsOf({}), creditMemo: noMemo } },
    { name: 'loan application received', facts: { deal: baseDeal, tasks: emptyTasks, documents: docsOf({ received: [mkDoc('Loan Application', 'received')] }), creditMemo: noMemo } },
    { name: 'missing required field', facts: { deal: { ...baseDeal, industry: '' }, tasks: emptyTasks, documents: docsOf({ received: [mkDoc('Loan Application', 'received')] }), creditMemo: noMemo } },
  ];
  it('evaluateStageExitPolicy(engine).allowed === evaluateStageTransitionPolicy(seam).allowed', () => {
    for (const c of cases) {
      const enginePolicy = evaluateStageExitPolicy(deriveStageExitReadiness('INTAKE', c.facts));
      const workflow = deriveLoanWorkflowState({ deal: c.facts.deal, tasks: c.facts.tasks, documents: c.facts.documents, creditMemo: c.facts.creditMemo });
      const seamPolicy = evaluateStageTransitionPolicy(workflow, 'UNDERWRITING');
      expect(enginePolicy.allowed, c.name).toBe(seamPolicy.allowed);
    }
  });
});

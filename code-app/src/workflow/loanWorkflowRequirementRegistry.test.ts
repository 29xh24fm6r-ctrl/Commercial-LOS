import { describe, it, expect } from 'vitest';
import type { DealDetail } from '../deals/dealQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import { getLoanWorkflowStage } from './loanWorkflowStages';
import { CANONICAL_STAGE_CODES } from './stageOrderingContract';
import {
  LOAN_WORKFLOW_REQUIREMENTS,
  requirementsForScope,
  untrackedRequirementsForScope,
} from './loanWorkflowRequirementRegistry';
import {
  deriveStageExitReadiness,
  deriveTransitionReadiness,
  type WorkflowRequirementFacts,
} from './loanWorkflowRequirementEngine';

/**
 * ARC Phase 1 — capability-level proof of the requirement registry + evaluation engine.
 * These prove the whole stage/transition evaluation, not trivial helpers.
 */

const baseDeal: DealDetail = {
  id: 'deal-arc-1',
  name: 'ARC Phase 1 Working Capital',
  clientName: 'TEST Client',
  stage: 'Intake',
  status: 'Open',
  amount: 100_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-12-31T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'One personal guarantor',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, equipment.',
  createdOn: '2026-07-01T00:00:00Z',
  stageEntryDate: '2026-07-08T00:00:00Z',
  isClosed: false,
};

function doc(name: string): DealDocument {
  return { id: `d-${name}`, name, dueDate: undefined, requestDate: undefined, receivedDate: '2026-07-05T00:00:00Z', reviewer: 'UW', uploaded: true, modifiedOn: undefined, status: 'received' };
}
function docs(received: string[]): DealDocumentsResult {
  return { outstanding: [], received: received.map(doc), reviewed: [] };
}
function reviewedDoc(name: string): DealDocument {
  return { id: `d-${name}`, name, dueDate: undefined, requestDate: undefined, receivedDate: '2026-07-05T00:00:00Z', reviewer: 'UW Analyst', uploaded: true, modifiedOn: undefined, status: 'reviewed' };
}
const emptyTasks: DealTasksResult = { open: [], completed: [] };
const noMemo: CreditMemoData = { memos: [], sections: [] };
const oneMemo: CreditMemoData = {
  memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'Banker draft', version: 1, generatedAt: '2026-07-05T00:00:00Z', modifiedOn: '2026-07-05T00:00:00Z', borrowerSafe: false, textPreview: undefined }],
  sections: [],
};

describe('ARC Phase 1 — canonical requirement registry integrity', () => {
  it('covers every canonical stage and carries full metadata on every requirement', () => {
    for (const code of CANONICAL_STAGE_CODES) {
      expect(requirementsForScope(code).length).toBeGreaterThan(0);
    }
    for (const r of LOAN_WORKFLOW_REQUIREMENTS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.uiCopy.length).toBeGreaterThan(0);
      expect(r.blockerReason.length).toBeGreaterThan(0);
      expect(r.resolverSurface.length).toBeGreaterThan(0);
      expect(r.responsibleRole.length).toBeGreaterThan(0);
      expect(r.backingType.length).toBeGreaterThan(0);
      expect(['blocking', 'recommended']).toContain(r.severity);
    }
  });

  it('INTAKE has NO untracked deep facts (so Intake → Underwriting stays behavior-compatible)', () => {
    expect(untrackedRequirementsForScope('INTAKE')).toEqual([]);
  });

  it('deeper stages carry untracked deep facts (risk rating, approval, closing/funding, boarding)', () => {
    expect(untrackedRequirementsForScope('UNDERWRITING').some((r) => r.id === 'UNDERWRITING:risk_rating')).toBe(true);
    expect(untrackedRequirementsForScope('CREDIT_APPROVAL').some((r) => r.id === 'CREDIT_APPROVAL:approval_decision')).toBe(true);
    expect(untrackedRequirementsForScope('CLOSING_FUNDING').some((r) => r.id === 'CLOSING_FUNDING:funds_disbursed')).toBe(true);
    expect(untrackedRequirementsForScope('BOARDED').some((r) => r.id === 'BOARDED:boarded_loan_record')).toBe(true);
  });

  it('Return / Decline / Withdraw carry placeholder requirements', () => {
    expect(requirementsForScope('RETURN').length).toBeGreaterThan(0);
    expect(requirementsForScope('DECLINE').some((r) => r.category === 'adverse_action')).toBe(true);
    expect(requirementsForScope('WITHDRAW').length).toBeGreaterThan(0);
  });
});

describe('ARC Phase 1 — evaluation engine: Intake → Underwriting', () => {
  it('BLOCKS Intake exit when the required Loan Application document is missing', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, tasks: emptyTasks, documents: docs([]), creditMemo: noMemo };
    const r = deriveStageExitReadiness('INTAKE', facts);
    expect(r.status).toBe('blocked');
    const loanApp = r.blocking.find((b) => b.category === 'document' && /loan application/i.test(b.label));
    expect(loanApp).toBeDefined();
    expect(loanApp!.whereToResolve).toBe('Documents');
    expect(loanApp!.canBlockTransition).toBe(true);
  });

  it('is READY once the blocking exit criteria are met; recommended tasks stay visible but non-blocking', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, tasks: emptyTasks, documents: docs(['Loan Application']), creditMemo: noMemo };
    const r = deriveStageExitReadiness('INTAKE', facts);
    expect(r.status).toBe('ready');
    expect(r.blocking).toEqual([]);
    // The three intake tasks are visible as recommended, and none of them can block.
    expect(r.recommended.length).toBeGreaterThanOrEqual(3);
    expect(r.recommended.every((t) => t.severity === 'recommended' && t.canBlockTransition === false)).toBe(true);
  });
});

describe('ARC Phase 1 — untracked deep facts fail closed for deeper stages', () => {
  it('BLOCKS Underwriting exit on untracked risk rating + recommendation even when all tracked facts are met', () => {
    const facts: WorkflowRequirementFacts = {
      deal: baseDeal,
      tasks: emptyTasks,
      // ARC Phase 3: financials + tax returns must be REVIEWED (not merely received) to exit Underwriting.
      documents: {
        outstanding: [],
        received: [doc('Ownership Information'), doc('Collateral Support')],
        reviewed: [reviewedDoc('Business Financial Statements'), reviewedDoc('Tax Returns')],
      },
      creditMemo: oneMemo,
    };
    const r = deriveStageExitReadiness('UNDERWRITING', facts);
    expect(r.status).toBe('blocked');
    // No TRACKED blocking requirement remains (docs reviewed + fields + spreading credit are satisfied)...
    expect(r.blocking).toEqual([]);
    // ...the block is the fail-closed untracked deep facts, which name the missing capability.
    expect(r.untracked.some((u) => u.id === 'UNDERWRITING:risk_rating')).toBe(true);
    expect(r.untracked.some((u) => u.id === 'UNDERWRITING:uw_recommendation')).toBe(true);
    expect(r.untracked.every((u) => /not yet/i.test(u.reason))).toBe(true);
  });
});

describe('ARC Phase 1 — compatibility: engine matches the live gate for Intake → Underwriting', () => {
  const intakeStage = getLoanWorkflowStage('INTAKE');
  const cases: { name: string; facts: WorkflowRequirementFacts }[] = [
    { name: 'missing document', facts: { deal: baseDeal, tasks: emptyTasks, documents: docs([]), creditMemo: noMemo } },
    { name: 'all met', facts: { deal: baseDeal, tasks: emptyTasks, documents: docs(['Loan Application']), creditMemo: noMemo } },
    { name: 'missing required field', facts: { deal: { ...baseDeal, industry: '' }, tasks: emptyTasks, documents: docs(['Loan Application']), creditMemo: noMemo } },
  ];
  it('the engine BLOCKED decision equals the legacy deriveLoanWorkflowReadiness BLOCKED decision', () => {
    for (const c of cases) {
      const engineBlocked = deriveStageExitReadiness('INTAKE', c.facts).status === 'blocked';
      const legacyBlocked = deriveLoanWorkflowReadiness({ deal: c.facts.deal, stage: intakeStage, tasks: c.facts.tasks, documents: c.facts.documents, creditMemo: c.facts.creditMemo }).status === 'blocked';
      expect(engineBlocked, c.name).toBe(legacyBlocked);
    }
  });
});

describe('ARC Phase 1 — transition readiness', () => {
  it('forward advance uses the source stage exit; a non-approved target is blocked', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal, tasks: emptyTasks, documents: docs(['Loan Application']), creditMemo: noMemo };
    const ok = deriveTransitionReadiness('INTAKE', 'advance', facts, 'UNDERWRITING');
    expect(ok.status).toBe('ready');
    const wrong = deriveTransitionReadiness('INTAKE', 'advance', facts, 'BOARDED');
    expect(wrong.status).toBe('blocked');
    expect(wrong.reason).toMatch(/not an approved next stage/i);
  });

  it('Return / Decline / Withdraw are PREVIEW-ONLY in Phase 1 (not yet live)', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal };
    for (const kind of ['return', 'decline', 'withdraw'] as const) {
      const t = deriveTransitionReadiness('UNDERWRITING', kind, facts);
      expect(t.status).toBe('preview-only');
      expect(t.reason).toMatch(/not yet live|preview-only/i);
    }
  });
});

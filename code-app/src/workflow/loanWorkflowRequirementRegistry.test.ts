import { describe, it, expect } from 'vitest';
import type { DealDetail } from '../deals/dealQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import { deriveLoanWorkflowReadiness } from './loanWorkflowRules';
import { getLoanWorkflowStage } from './loanWorkflowStages';
import { CANONICAL_STAGE_CODES, resolveStageOrdering } from './stageOrderingContract';
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

  it('deeper stages carry untracked deep facts (approval, closing/funding, boarding)', () => {
    // Final LOS Completion arc (Workstream C) flipped the three approval facts to tracked (see
    // below) — memo_finalized remains a genuinely untracked deep fact for this same scope.
    expect(untrackedRequirementsForScope('CREDIT_APPROVAL').some((r) => r.id === 'CREDIT_APPROVAL:memo_finalized')).toBe(true);
    // Factory Arc Phase 12 flipped funds_disbursed to tracked (see below) — executed_docs and
    // booking_qc remain genuinely untracked deep facts for this same CLOSING_FUNDING scope.
    expect(untrackedRequirementsForScope('CLOSING_FUNDING').some((r) => r.id === 'CLOSING_FUNDING:executed_docs')).toBe(true);
    expect(untrackedRequirementsForScope('CLOSING_FUNDING').some((r) => r.id === 'CLOSING_FUNDING:booking_qc')).toBe(true);
    expect(untrackedRequirementsForScope('BOARDED').some((r) => r.id === 'BOARDED:boarded_loan_record')).toBe(true);
  });

  it('Final LOS Completion arc (Workstream C) — CREDIT_APPROVAL:approval_decision/approval_authority/approval_conditions are tracked (real, durable, deal-scoped Credit Approval Decision record)', () => {
    expect(untrackedRequirementsForScope('CREDIT_APPROVAL').some((r) => r.id === 'CREDIT_APPROVAL:approval_decision')).toBe(false);
    expect(untrackedRequirementsForScope('CREDIT_APPROVAL').some((r) => r.id === 'CREDIT_APPROVAL:approval_authority')).toBe(false);
    expect(untrackedRequirementsForScope('CREDIT_APPROVAL').some((r) => r.id === 'CREDIT_APPROVAL:approval_conditions')).toBe(false);
    for (const id of ['CREDIT_APPROVAL:approval_decision', 'CREDIT_APPROVAL:approval_authority', 'CREDIT_APPROVAL:approval_conditions']) {
      const req = requirementsForScope('CREDIT_APPROVAL').find((r) => r.id === id);
      expect(req?.tracked).toBe(true);
      expect(req?.severity).toBe('blocking');
      expect(req?.sourceEntity).toBe('cr664_creditapprovaldecision');
    }
  });

  it('Factory Arc Phase 12 — CLOSING_FUNDING:funds_disbursed is tracked (real durable Dataverse-backed fact)', () => {
    expect(untrackedRequirementsForScope('CLOSING_FUNDING').some((r) => r.id === 'CLOSING_FUNDING:funds_disbursed')).toBe(false);
    const req = requirementsForScope('CLOSING_FUNDING').find((r) => r.id === 'CLOSING_FUNDING:funds_disbursed');
    expect(req?.tracked).toBe(true);
    expect(req?.severity).toBe('blocking');
    expect(req?.sourceEntity).toBe('cr664_fundingauthorization');
  });

  it('Production Remediation Factory Arc Phase 6 (N-14/N-15) — UNDERWRITING:risk_rating and UNDERWRITING:uw_recommendation are tracked (real, durable, deal-scoped facts)', () => {
    expect(untrackedRequirementsForScope('UNDERWRITING').some((r) => r.id === 'UNDERWRITING:risk_rating')).toBe(false);
    expect(untrackedRequirementsForScope('UNDERWRITING').some((r) => r.id === 'UNDERWRITING:uw_recommendation')).toBe(false);
    const risk = requirementsForScope('UNDERWRITING').find((r) => r.id === 'UNDERWRITING:risk_rating');
    const rec = requirementsForScope('UNDERWRITING').find((r) => r.id === 'UNDERWRITING:uw_recommendation');
    expect(risk?.tracked).toBe(true);
    expect(risk?.severity).toBe('blocking');
    expect(risk?.sourceEntity).toBe('cr664_riskratinginputs');
    expect(rec?.tracked).toBe(true);
    expect(rec?.severity).toBe('blocking');
    expect(rec?.sourceEntity).toBe('cr664_underwritingrecommendationinputs');
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
  // N-15 remediation (Production Remediation Factory Arc Phase 6): risk rating and recommendation
  // are no longer untracked placeholders for UNDERWRITING — they are real, tracked blockers now.
  it('BLOCKS Underwriting exit on a missing risk rating + recommendation even when all other tracked facts are met', () => {
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
    // The block is now a real TRACKED blocker, not a fail-closed "untracked" placeholder.
    expect(r.blocking.some((b) => b.id === 'UNDERWRITING:risk_rating')).toBe(true);
    expect(r.blocking.some((b) => b.id === 'UNDERWRITING:uw_recommendation')).toBe(true);
    expect(r.untracked.some((u) => u.id === 'UNDERWRITING:risk_rating')).toBe(false);
    expect(r.untracked.some((u) => u.id === 'UNDERWRITING:uw_recommendation')).toBe(false);
  });

  it('is READY once a durable, final risk rating and recommendation are also supplied', () => {
    const facts: WorkflowRequirementFacts = {
      deal: baseDeal,
      tasks: emptyTasks,
      documents: {
        outstanding: [],
        received: [doc('Ownership Information'), doc('Collateral Support')],
        reviewed: [reviewedDoc('Business Financial Statements'), reviewedDoc('Tax Returns')],
      },
      creditMemo: oneMemo,
      riskRating: {
        dealId: baseDeal.id, ratingValue: '4', ratingScale: 'OGB-1-8', rationale: 'Stable, seasonal cash flow.',
        assignedBy: 'UW Analyst', assignedAtIso: '2026-07-20T00:00:00Z', status: 'assigned',
      },
      underwritingRecommendation: {
        dealId: baseDeal.id, decision: 'approve', rationale: 'Repayment capacity supports the recommendation.',
        underwriterActor: 'UW Analyst', recordedAtIso: '2026-07-20T00:00:00Z', status: 'recorded',
      },
    };
    const r = deriveStageExitReadiness('UNDERWRITING', facts);
    expect(r.status).toBe('ready');
    expect(r.blocking).toEqual([]);
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

  it('Return / Decline / Withdraw fail closed as blocked when no policy inputs are supplied (never silently ready)', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal };
    for (const kind of ['return', 'decline', 'withdraw'] as const) {
      const t = deriveTransitionReadiness('UNDERWRITING', kind, facts);
      expect(t.status).toBe('blocked');
    }
  });

  it('governance initiative (2026-07-21): Return / Decline / Withdraw are LIVE — same policy as canonicalStageTransition, not a placeholder', () => {
    const facts: WorkflowRequirementFacts = { deal: baseDeal };
    const ordering = resolveStageOrdering(
      CANONICAL_STAGE_CODES.map((code, i) => ({ cr664_code: code, cr664_name: code, cr664_sequence: (i + 1) * 10, cr664_activeflag: true })),
    );

    const returnOk = deriveTransitionReadiness('CREDIT_APPROVAL', 'return', facts, 'UNDERWRITING', {
      ordering, currentStatus: 'OPEN', reason: 'needs updated financials', authorized: true,
    });
    expect(returnOk.status).toBe('ready');
    expect(returnOk.to).toBe('UNDERWRITING');

    const returnNoReason = deriveTransitionReadiness('CREDIT_APPROVAL', 'return', facts, 'UNDERWRITING', {
      ordering, currentStatus: 'OPEN', reason: '   ', authorized: true,
    });
    expect(returnNoReason.status).toBe('blocked');
    expect(returnNoReason.reason).toMatch(/reason/i);
    const reasonReq = returnNoReason.exit.requirements.find((r) => r.id === 'RETURN:reason');
    expect(reasonReq?.status).toBe('unmet');

    const declineOk = deriveTransitionReadiness('UNDERWRITING', 'decline', facts, undefined, {
      ordering, currentStatus: 'OPEN', declineReason: { code: 'INSUFFICIENT_COLLATERAL' }, authorized: true,
    });
    expect(declineOk.status).toBe('ready');

    const withdrawUnauthorized = deriveTransitionReadiness('UNDERWRITING', 'withdraw', facts, undefined, {
      ordering, currentStatus: 'OPEN', reason: 'borrower withdrew', authorized: false,
    });
    expect(withdrawUnauthorized.status).toBe('blocked');

    // The still-untracked advisory items (authorization/adverse-action) never block a return/decline
    // that otherwise satisfies its checkable requirements — they surface as visible, non-blocking.
    const authAdvisory = returnOk.exit.requirements.find((r) => r.id === 'RETURN:authorization');
    expect(authAdvisory?.severity).toBe('recommended');
    expect(returnOk.exit.blocking).toHaveLength(0);
  });
});

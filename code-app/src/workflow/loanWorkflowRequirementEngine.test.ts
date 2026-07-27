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
  evaluateDeepFactRequirement,
  deriveStageExitReadiness,
  type WorkflowRequirementFacts,
} from './loanWorkflowRequirementEngine';
import type { RiskRatingRecord, UnderwritingRecommendationRecord } from './underwritingDeepFacts';
import type { FundingAuthorizationRecord } from '../funding/fundingAuthorizationTypes';
import type { CreditApprovalDecisionRecord } from './creditApprovalDecisionTypes';

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

describe('ARC Phase 3 — underwriting review goes live via reviewed-document status', () => {
  const uwDeal = { ...baseDeal, stage: 'Underwriting' };
  // Production Remediation Factory Arc Phase 6 (N-14/N-15): a fully durable risk rating +
  // recommendation, used where a test wants "everything else the Underwriting gate checks" met.
  const durableRiskRating: RiskRatingRecord = {
    dealId: uwDeal.id, ratingValue: '4', ratingScale: 'OGB-1-8', rationale: 'Stable, seasonal cash flow.',
    assignedBy: 'UW Analyst', assignedAtIso: '2026-07-20T00:00:00Z', status: 'assigned',
  };
  const durableRecommendation: UnderwritingRecommendationRecord = {
    dealId: uwDeal.id, decision: 'approve', rationale: 'Repayment capacity supports the recommendation.',
    underwriterActor: 'UW Analyst', recordedAtIso: '2026-07-20T00:00:00Z', status: 'recorded',
  };
  function uwFacts(
    financials: 'received' | 'reviewed',
    deepFacts: { riskRating?: RiskRatingRecord; underwritingRecommendation?: UnderwritingRecommendationRecord } = {},
  ): WorkflowRequirementFacts {
    return {
      deal: uwDeal,
      tasks: emptyTasks,
      documents: {
        outstanding: [],
        received: [mkDoc('Ownership Information', 'received'), mkDoc('Collateral Support', 'received'), ...(financials === 'received' ? [mkDoc('Business Financial Statements', 'received'), mkDoc('Tax Returns', 'received')] : [])],
        reviewed: financials === 'reviewed' ? [mkDoc('Business Financial Statements', 'reviewed', 'UW'), mkDoc('Tax Returns', 'reviewed', 'UW')] : [],
      },
      creditMemo: { memos: [{ id: 'm', name: 'M', status: 'Draft', statusKey: 'draft', memoType: 'Banker draft', version: 1, generatedAt: '2026-07-05T00:00:00Z', modifiedOn: '2026-07-05T00:00:00Z', borrowerSafe: false, textPreview: undefined }], sections: [] },
      ...deepFacts,
    };
  }
  it('a received-but-unreviewed financial statement BLOCKS the Underwriting exit', () => {
    const r = deriveStageExitReadiness('UNDERWRITING', uwFacts('received', { riskRating: durableRiskRating, underwritingRecommendation: durableRecommendation }));
    expect(r.blocking.some((b) => /Business Financial Statements/i.test(b.label))).toBe(true);
    expect(evaluateStageExitPolicy(r).allowed).toBe(false);
  });
  // N-15: risk rating and recommendation are now real, tracked Underwriting exit requirements —
  // reviewing the analysis documents alone is no longer enough.
  it('N-15: reviewing the analysis documents alone does NOT clear the Underwriting exit — risk rating and recommendation are now real, tracked blockers', () => {
    const r = deriveStageExitReadiness('UNDERWRITING', uwFacts('reviewed'));
    expect(r.blocking.some((b) => b.id === 'UNDERWRITING:risk_rating')).toBe(true);
    expect(r.blocking.some((b) => b.id === 'UNDERWRITING:uw_recommendation')).toBe(true);
    expect(evaluateStageExitPolicy(r).allowed).toBe(false);
    expect(r.untracked.some((u) => u.id === 'UNDERWRITING:risk_rating')).toBe(false);
  });
  it('N-15: supplying a durable, final risk rating AND recommendation clears the Underwriting exit', () => {
    const r = deriveStageExitReadiness('UNDERWRITING', uwFacts('reviewed', { riskRating: durableRiskRating, underwritingRecommendation: durableRecommendation }));
    expect(r.blocking).toEqual([]);
    expect(evaluateStageExitPolicy(r).allowed).toBe(true);
  });
});

describe('ARC Phase 3 / N-14 / N-15 — deep-fact evaluator (live for risk rating + recommendation; other deep facts still fail closed untracked)', () => {
  const trackedRisk = {
    id: 'UNDERWRITING:risk_rating', scope: 'UNDERWRITING' as const, label: 'Risk rating assigned', uiCopy: 'Risk rating assigned',
    description: '', category: 'credit' as const, severity: 'blocking' as const, resolverSurface: 'Credit Memo' as const,
    responsibleRole: 'underwriter' as const, backingType: 'risk_rating_record' as const, tracked: true, matchMode: 'typed' as const, blockerReason: 'Risk rating required.',
  };
  const rr = (over: Partial<RiskRatingRecord> = {}): RiskRatingRecord => ({
    dealId: baseDeal.id, ratingValue: '4', ratingScale: 'OGB', rationale: 'Stable cash flow supports the rating.',
    assignedBy: 'UW Analyst', assignedAtIso: '2026-07-20T00:00:00Z', status: 'assigned', ...over,
  });
  it('an untracked risk-rating requirement fails closed as untracked (defense-in-depth for a hypothetical rollback)', () => {
    expect(evaluateDeepFactRequirement({ ...trackedRisk, tracked: false }, { deal: baseDeal }).status).toBe('untracked');
  });
  it('once tracked: missing/draft/blank-rationale does not satisfy; a durable assigned rating satisfies', () => {
    expect(evaluateDeepFactRequirement(trackedRisk, { deal: baseDeal }).status).toBe('unmet');
    expect(evaluateDeepFactRequirement(trackedRisk, { deal: baseDeal, riskRating: rr({ status: 'draft' }) }).status).toBe('unmet');
    expect(evaluateDeepFactRequirement(trackedRisk, { deal: baseDeal, riskRating: rr({ rationale: '' }) }).status).toBe('unmet');
    expect(evaluateDeepFactRequirement(trackedRisk, { deal: baseDeal, riskRating: rr({ status: 'assigned' }) }).status).toBe('met');
  });
  it('N-15: a risk-rating record scoped to a different deal does not satisfy this deal\'s requirement', () => {
    expect(evaluateDeepFactRequirement(trackedRisk, { deal: baseDeal, riskRating: rr({ dealId: 'some-other-deal' }) }).status).toBe('unmet');
  });
});

describe('Factory Arc Phase 12 — CLOSING_FUNDING:funds_disbursed (tracked from the start; real durable fact)', () => {
  const fundsDisbursed = {
    id: 'CLOSING_FUNDING:funds_disbursed', scope: 'CLOSING_FUNDING' as const, label: 'Funds disbursed', uiCopy: 'Funds disbursed',
    description: '', category: 'funding' as const, severity: 'blocking' as const, resolverSurface: 'Funding' as const,
    responsibleRole: 'loan_ops' as const, backingType: 'funding_record' as const, tracked: true, matchMode: 'typed' as const,
    blockerReason: 'Funds have not yet been disbursed for this deal.',
  };
  const fundingRecord = (status: 'PENDING' | 'APPROVED' | 'FUNDED'): FundingAuthorizationRecord => ({
    dealId: 'd', authorizationStatus: status, requestedAmount: 100000, destinationVerificationStatus: 'verified',
    conditionsSatisfied: true, exceptions: [], requestedBy: 'banker@bank.test', requestedAt: '2026-07-01T00:00:00Z',
    correlationId: 'corr-1', supportingDocumentIds: [], auditEventIds: [], recordId: 'fa-1',
  });
  it('no funding-authorization record at all fails closed as unmet, never fabricated as met', () => {
    expect(evaluateDeepFactRequirement(fundsDisbursed, { deal: baseDeal }).status).toBe('unmet');
  });
  it('a PENDING or APPROVED record does not satisfy — only FUNDED does', () => {
    expect(evaluateDeepFactRequirement(fundsDisbursed, { deal: baseDeal, fundingAuthorization: fundingRecord('PENDING') }).status).toBe('unmet');
    expect(evaluateDeepFactRequirement(fundsDisbursed, { deal: baseDeal, fundingAuthorization: fundingRecord('APPROVED') }).status).toBe('unmet');
    expect(evaluateDeepFactRequirement(fundsDisbursed, { deal: baseDeal, fundingAuthorization: fundingRecord('FUNDED') }).status).toBe('met');
  });
});

describe('Credit Approval — committee/reviewed/approved memo requirements never permanently block exit', () => {
  const creditApprovalDeal: DealDetail = { ...baseDeal, stage: 'Credit Approval' };
  const memo: CreditMemoData = {
    memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'x', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }],
    sections: [
      { id: 's1', sectionKey: 'executive_summary', sectionLabel: 'Executive Summary', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
      { id: 's2', sectionKey: 'repayment_analysis', sectionLabel: 'Repayment Analysis', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
    ],
  };
  // Final LOS Completion arc (Workstream C) — CREDIT_APPROVAL:approval_decision/approval_authority/
  // approval_conditions are now tracked, real blocking facts; a satisfying decision record must be
  // supplied for this exact deal or the exit is correctly (not spuriously) blocked.
  const approvedDecision: CreditApprovalDecisionRecord = {
    decisionId: 'cad-arc-1',
    dealId: creditApprovalDeal.id,
    status: 'APPROVED',
    approvedAmount: creditApprovalDeal.amount,
    approvedProduct: creditApprovalDeal.productType,
    approvedTermMonths: undefined,
    approvedPricing: undefined,
    collateralSummary: undefined,
    conditions: [],
    authorityTier: 'committee',
    rationale: 'DSCR and collateral coverage support approval.',
    requestedByActorEmail: 'banker@bank.test',
    requestedAtIso: '2026-07-20T00:00:00.000Z',
    decidedByActorEmail: 'committee-member@bank.test',
    decidedAtIso: '2026-07-24T00:00:00.000Z',
    correlationId: 'ca-corr-arc-1',
    supersedesDecisionId: undefined,
  };
  const facts: WorkflowRequirementFacts = {
    deal: creditApprovalDeal,
    tasks: emptyTasks,
    documents: docsOf({ received: [mkDoc('Approval evidence', 'received')] }),
    creditMemo: memo,
    creditApprovalDecisions: [approvedDecision],
  };
  // Workstream 146-B — CREDIT_APPROVAL:memo_finalized is now tracked; a genuinely reachable exit
  // needs the CURRENT memo's status to be Final, not merely present.
  const finalizedMemo: CreditMemoData = { ...memo, memos: memo.memos.map((m) => ({ ...m, status: 'Final', statusKey: 'final' })) };

  it('reviewed/committee/approved requirements land in recommended, never blocking — a draft memo with no committee record is not a permanent dead end', () => {
    const r = deriveStageExitReadiness('CREDIT_APPROVAL', facts);
    const blockingIds = r.blocking.map((b) => b.id);
    const recommendedIds = r.recommended.map((b) => b.id);
    expect(blockingIds).not.toContain('CREDIT_APPROVAL:credit:reviewed memo');
    expect(blockingIds).not.toContain('CREDIT_APPROVAL:credit:committee package');
    expect(blockingIds).not.toContain('CREDIT_APPROVAL:credit:approved credit memo');
    expect(recommendedIds).toContain('CREDIT_APPROVAL:credit:reviewed memo');
    expect(recommendedIds).toContain('CREDIT_APPROVAL:credit:committee package');
    expect(recommendedIds).toContain('CREDIT_APPROVAL:credit:approved credit memo');
  });

  it('Credit Approval exit is genuinely reachable once fields/documents/memo/sections, a durable approval decision, AND a finalized credit memo are provided (not stranded)', () => {
    const r = deriveStageExitReadiness('CREDIT_APPROVAL', { ...facts, creditMemo: finalizedMemo });
    expect(evaluateStageExitPolicy(r).allowed).toBe(true);
  });

  it('Workstream 146-B — Credit Approval exit is correctly BLOCKED while the current memo is still Draft, never fabricated as clear', () => {
    const r = deriveStageExitReadiness('CREDIT_APPROVAL', facts);
    expect(evaluateStageExitPolicy(r).allowed).toBe(false);
    expect(r.blocking.map((b) => b.id)).toContain('CREDIT_APPROVAL:memo_finalized');
  });

  it('Final LOS Completion arc (Workstream C) — Credit Approval exit is correctly BLOCKED without a durable approval decision, never fabricated as clear', () => {
    const r = deriveStageExitReadiness('CREDIT_APPROVAL', { ...facts, creditApprovalDecisions: undefined });
    expect(evaluateStageExitPolicy(r).allowed).toBe(false);
    expect(r.blocking.map((b) => b.id)).toContain('CREDIT_APPROVAL:approval_decision');
  });

  it('the literal credit-memo-presence requirement still hard-blocks when no memo exists at all', () => {
    const r = deriveStageExitReadiness('CREDIT_APPROVAL', { ...facts, creditMemo: { memos: [], sections: [] } });
    expect(r.blocking.map((b) => b.id)).toContain('CREDIT_APPROVAL:credit:credit memo');
    expect(evaluateStageExitPolicy(r).allowed).toBe(false);
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

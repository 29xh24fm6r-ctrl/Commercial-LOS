// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { advanceWorkflowStage, type StageAdvanceInput } from './stageAdvanceWriteDependency';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import type { WorkflowRequirementFacts } from './loanWorkflowRequirementEngine';
import type { DealDetail } from '../deals/dealQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';
import type { FundingAuthorizationRecord } from '../funding/fundingAuthorizationTypes';
import type { RiskRatingRecord, UnderwritingRecommendationRecord } from './underwritingDeepFacts';
import type { CreditApprovalDecisionRecord } from './creditApprovalDecisionTypes';
import type { ExecutedDocumentAttestationRecord } from './executedDocumentAttestationTypes';

/** Minimal workflow state the stage policy reads (cast to the full type for the test). */
function workflow(over: { stageId?: string; status?: 'blocked' | 'at-risk' | 'clear'; nextIds?: string[]; blockers?: string[] } = {}): LoanWorkflowState {
  return {
    currentStage: { id: over.stageId ?? 'INTAKE' },
    nextPermittedStages: (over.nextIds ?? ['UNDERWRITING']).map((id) => ({ id })),
    readiness: {
      status: over.status ?? 'clear',
      blockers: (over.blockers ?? []).map((label) => ({ label })),
    },
  } as unknown as LoanWorkflowState;
}

function mkDoc(name: string, status: DealDocument['status']): DealDocument {
  return { id: `d-${name}-${status}`, name, dueDate: undefined, requestDate: undefined, receivedDate: status !== 'outstanding' ? '2026-07-05T00:00:00Z' : undefined, reviewer: undefined, uploaded: status !== 'outstanding', modifiedOn: undefined, status };
}
function docsOf(parts: { outstanding?: DealDocument[]; received?: DealDocument[]; reviewed?: DealDocument[] }): DealDocumentsResult {
  return { outstanding: parts.outstanding ?? [], received: parts.received ?? [], reviewed: parts.reviewed ?? [] };
}
const emptyTasks: DealTasksResult = { open: [], completed: [] };
const noMemo: CreditMemoData = { memos: [], sections: [] };

const baseDeal: DealDetail = {
  id: 'deal-1', name: 'Test Deal', clientName: 'TEST', stage: 'Intake', status: 'Open', amount: 100_000,
  bankerName: 'M. Paller', targetCloseDate: '2026-12-31T00:00:00Z', productType: 'RLOC', loanStructure: 'Senior Secured',
  customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: 'One PG', pricingType: 'Floating', spreadIndex: 'SOFR',
  spreadMargin: 275, collateralSummary: 'A/R', createdOn: '2026-07-01T00:00:00Z', stageEntryDate: '2026-07-08T00:00:00Z', isClosed: false,
};

/** Satisfies every real INTAKE requirement (see loanWorkflowStages.ts) — the default clean fixture. */
const cleanIntakeFacts: WorkflowRequirementFacts = {
  deal: baseDeal,
  tasks: emptyTasks,
  documents: docsOf({ received: [mkDoc('Loan Application', 'received')] }),
  creditMemo: noMemo,
};

function input(over: Partial<StageAdvanceInput> = {}): StageAdvanceInput {
  return {
    enabled: true,
    authorized: true,
    dealId: 'deal-1',
    correlationId: 'corr-1',
    entryDateIso: '2026-06-24T00:00:00Z',
    workflow: workflow(),
    requestedNextStageId: 'UNDERWRITING',
    facts: cleanIntakeFacts,
    transport: {
      updateDealStage: vi.fn(async () => ({ ok: true })),
      readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })),
    },
    auditSink: { write: vi.fn(async () => ({ ok: true })) },
    timelineSink: { write: vi.fn(async () => ({ ok: true })) },
    ...over,
  };
}

describe('Phase 237F — governed stage advancement write dependency', () => {
  it('disabled by default → no write', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ enabled: false, transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) } }));
    expect(out.kind).toBe('disabled');
    expect(upd).not.toHaveBeenCalled();
  });

  it('unauthorized is blocked before any write', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    expect((await advanceWorkflowStage(input({ authorized: false, transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) } }))).kind).toBe('unauthorized');
    expect(upd).not.toHaveBeenCalled();
  });

  it('blockers prevent the write (readiness blocked)', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ workflow: workflow({ status: 'blocked', blockers: ['Missing credit memo'] }), transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) } }));
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.blockers).toContain('Missing credit memo');
    expect(upd).not.toHaveBeenCalled();
  });

  it('no approved next stage prevents the write', async () => {
    const out = await advanceWorkflowStage(input({ requestedNextStageId: 'CLOSING_FUNDING', workflow: workflow({ nextIds: ['UNDERWRITING'] }) }));
    expect(out.kind).toBe('blocked');
  });

  it('successful update + readback writes audit + timeline and returns advanced', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const readback = vi.fn(async () => ({ ok: true, matched: true }));
    const audit = vi.fn(async () => ({ ok: true }));
    const timeline = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: upd, readbackDealStage: readback }, auditSink: { write: audit }, timelineSink: { write: timeline } }));
    expect(out.kind).toBe('advanced');
    if (out.kind === 'advanced') { expect(out.from).toBe('INTAKE'); expect(out.to).toBe('UNDERWRITING'); }
    expect(upd).toHaveBeenCalledTimes(1);
    expect(readback).toHaveBeenCalledWith(expect.objectContaining({ expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-06-24T00:00:00Z' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'advanced' }));
    expect(timeline).toHaveBeenCalledTimes(1);
  });

  it('update succeeds but readback MISMATCH → readback_failed; audit records the failure; NO timeline (not advanced)', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const readback = vi.fn(async () => ({ ok: true, matched: false, detail: 'stage did not persist' }));
    const audit = vi.fn(async () => ({ ok: true }));
    const timeline = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: upd, readbackDealStage: readback }, auditSink: { write: audit }, timelineSink: { write: timeline } }));
    expect(out.kind).toBe('readback_failed');
    if (out.kind === 'readback_failed') expect(out.detail).toBe('stage did not persist');
    // The audit is an HONEST failure record — never 'advanced' when persistence is unproven.
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'readback_failed' }));
    expect(audit).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'advanced' }));
    // The move is NOT reported to downstream evidence — no timeline event.
    expect(timeline).not.toHaveBeenCalled();
  });

  it('update succeeds but readback UNAVAILABLE → readback_failed (persistence could not be confirmed)', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const readback = vi.fn(async () => ({ ok: false, matched: false }));
    const audit = vi.fn(async () => ({ ok: true }));
    const timeline = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: upd, readbackDealStage: readback }, auditSink: { write: audit }, timelineSink: { write: timeline } }));
    expect(out.kind).toBe('readback_failed');
    if (out.kind === 'readback_failed') expect(out.detail).toMatch(/unavailable|could not be confirmed/i);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'readback_failed' }));
    expect(timeline).not.toHaveBeenCalled();
  });

  it('update failure is surfaced (never fake success)', async () => {
    const readback = vi.fn(async () => ({ ok: true, matched: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: async () => ({ ok: false, error: 'boom' }), readbackDealStage: readback } }));
    expect(out.kind).toBe('update_failed');
    // Readback is never attempted when the update itself failed.
    expect(readback).not.toHaveBeenCalled();
  });

  it('audit failure after a successful write is an honest partial success', async () => {
    const out = await advanceWorkflowStage(input({ auditSink: { write: async () => ({ ok: false }) } }));
    expect(out.kind).toBe('audit_failed_partial_success');
  });

  it('timeline failure after audit is an honest partial success', async () => {
    const out = await advanceWorkflowStage(input({ timelineSink: { write: async () => ({ ok: false }) } }));
    expect(out.kind).toBe('timeline_failed_partial_success');
  });

  it('missing transport/sinks → dependency_not_ready', async () => {
    expect((await advanceWorkflowStage(input({ transport: undefined }))).kind).toBe('dependency_not_ready');
  });

  // 2026-07-14 remediation (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, finding C2): the
  // requirement engine is now a HARD second gate, catching cases the shallow legacy policy alone
  // would have allowed (received-but-not-reviewed Underwriting documents).
  describe('requirement-engine gate (finding C2)', () => {
    it('blocks a write the legacy transition policy alone would have allowed', async () => {
      const underwritingDeal: DealDetail = { ...baseDeal, collateralSummary: 'A/R borrowing base' };
      const facts: WorkflowRequirementFacts = {
        deal: underwritingDeal,
        tasks: emptyTasks,
        // "Business financial statements" is only RECEIVED, not REVIEWED. The legacy adapter
        // (hasReviewedOrReceivedDocument) accepts received-or-reviewed and would allow this
        // transition; the typed engine requires 'reviewed' for this specific document and blocks.
        documents: docsOf({
          received: [mkDoc('Business Financial Statements', 'received')],
          reviewed: [
            mkDoc('Tax Returns', 'reviewed'),
            mkDoc('Ownership Information', 'reviewed'),
            mkDoc('Collateral Support', 'reviewed'),
          ],
        }),
        creditMemo: { memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }], sections: [] },
      };
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(input({
        workflow: workflow({ stageId: 'UNDERWRITING', nextIds: ['CREDIT_APPROVAL'], status: 'clear' }),
        requestedNextStageId: 'CREDIT_APPROVAL',
        facts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.blockers.join(' ')).toMatch(/received but not yet reviewed/i);
      expect(upd).not.toHaveBeenCalled();
    });
  });

  // Workstream I/J (2026-07-22) — locks in that "memo readiness" for ENTERING Credit Approval
  // (UNDERWRITING's own "spreading analysis" credit requirement) is already a real, live, hard
  // block at the write seam when zero credit memos exist — not merely a UI-cosmetic check. This is
  // the shallow/tracked layer (`deriveCreditBlockers` in loanWorkflowRules.ts, matchMode 'inferred',
  // proxied by memo presence), distinct from the deeper reviewed/committee/approved-status facts
  // which are correctly `untracked` (see loanWorkflowRequirementRegistry.ts's CREDIT_SEVERITY_OVERRIDE
  // and DEEP_REQUIREMENTS — those gate CREDIT_APPROVAL's own exit to Commitment, a later transition).
  describe('memo-existence gate for Credit Approval entry (Workstream I/J)', () => {
    it('blocks Underwriting -> Credit Approval when the deal has zero credit memos', async () => {
      const underwritingDeal: DealDetail = { ...baseDeal, collateralSummary: 'A/R borrowing base' };
      const facts: WorkflowRequirementFacts = {
        deal: underwritingDeal,
        tasks: emptyTasks,
        documents: docsOf({
          reviewed: [
            mkDoc('Business Financial Statements', 'reviewed'),
            mkDoc('Tax Returns', 'reviewed'),
            mkDoc('Ownership Information', 'reviewed'),
            mkDoc('Collateral Support', 'reviewed'),
          ],
        }),
        // Zero memos — the one fact under test.
        creditMemo: noMemo,
      };
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(input({
        workflow: workflow({ stageId: 'UNDERWRITING', nextIds: ['CREDIT_APPROVAL'], status: 'clear' }),
        requestedNextStageId: 'CREDIT_APPROVAL',
        facts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.blockers.join(' ')).toMatch(/spreading.*repayment analysis/i);
      expect(upd).not.toHaveBeenCalled();
    });

    it('allows Underwriting -> Credit Approval once at least one credit memo exists (all else satisfied)', async () => {
      const underwritingDeal: DealDetail = { ...baseDeal, collateralSummary: 'A/R borrowing base' };
      const facts: WorkflowRequirementFacts = {
        deal: underwritingDeal,
        tasks: emptyTasks,
        documents: docsOf({
          reviewed: [
            mkDoc('Business Financial Statements', 'reviewed'),
            mkDoc('Tax Returns', 'reviewed'),
            mkDoc('Ownership Information', 'reviewed'),
            mkDoc('Collateral Support', 'reviewed'),
          ],
        }),
        creditMemo: { memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }], sections: [] },
        // N-15 (Production Remediation Factory Arc Phase 6): risk rating and recommendation are now
        // real, tracked Underwriting exit requirements — "all else satisfied" must include them.
        riskRating: {
          dealId: underwritingDeal.id, ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: 'Stable cash flow.',
          assignedBy: 'UW Analyst', assignedAtIso: '2026-07-01T00:00:00Z', status: 'assigned',
        },
        underwritingRecommendation: {
          dealId: underwritingDeal.id, decision: 'approve', rationale: 'Supports repayment capacity.',
          underwriterActor: 'UW Analyst', recordedAtIso: '2026-07-01T00:00:00Z', status: 'recorded',
        },
      };
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(input({
        workflow: workflow({ stageId: 'UNDERWRITING', nextIds: ['CREDIT_APPROVAL'], status: 'clear' }),
        requestedNextStageId: 'CREDIT_APPROVAL',
        facts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('advanced');
      expect(upd).toHaveBeenCalledTimes(1);
    });

    // N-14/N-15 — the write seam, not just the UI preview, must actually block on these.
    it('N-14/N-15: BLOCKS Underwriting -> Credit Approval when the risk rating has a blank rationale, even though everything else is satisfied', async () => {
      const underwritingDeal: DealDetail = { ...baseDeal, collateralSummary: 'A/R borrowing base' };
      const riskRating: RiskRatingRecord = {
        dealId: underwritingDeal.id, ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: '',
        assignedBy: 'UW Analyst', assignedAtIso: '2026-07-01T00:00:00Z', status: 'assigned',
      };
      const underwritingRecommendation: UnderwritingRecommendationRecord = {
        dealId: underwritingDeal.id, decision: 'approve', rationale: 'Supports repayment capacity.',
        underwriterActor: 'UW Analyst', recordedAtIso: '2026-07-01T00:00:00Z', status: 'recorded',
      };
      const facts: WorkflowRequirementFacts = {
        deal: underwritingDeal,
        tasks: emptyTasks,
        documents: docsOf({
          reviewed: [
            mkDoc('Business Financial Statements', 'reviewed'),
            mkDoc('Tax Returns', 'reviewed'),
            mkDoc('Ownership Information', 'reviewed'),
            mkDoc('Collateral Support', 'reviewed'),
          ],
        }),
        creditMemo: { memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }], sections: [] },
        riskRating,
        underwritingRecommendation,
      };
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(input({
        workflow: workflow({ stageId: 'UNDERWRITING', nextIds: ['CREDIT_APPROVAL'], status: 'clear' }),
        requestedNextStageId: 'CREDIT_APPROVAL',
        facts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.blockers.join(' ')).toMatch(/risk rating/i);
      expect(upd).not.toHaveBeenCalled();
    });

    it('N-15: BLOCKS Underwriting -> Credit Approval when the recorded risk rating belongs to a different deal', async () => {
      const underwritingDeal: DealDetail = { ...baseDeal, collateralSummary: 'A/R borrowing base' };
      const facts: WorkflowRequirementFacts = {
        deal: underwritingDeal,
        tasks: emptyTasks,
        documents: docsOf({
          reviewed: [
            mkDoc('Business Financial Statements', 'reviewed'),
            mkDoc('Tax Returns', 'reviewed'),
            mkDoc('Ownership Information', 'reviewed'),
            mkDoc('Collateral Support', 'reviewed'),
          ],
        }),
        creditMemo: { memos: [{ id: 'm1', name: 'Memo', status: 'Draft', statusKey: 'draft', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }], sections: [] },
        riskRating: {
          dealId: 'some-other-deal', ratingValue: 'BB', ratingScale: 'Internal 1-10', rationale: 'Stable cash flow.',
          assignedBy: 'UW Analyst', assignedAtIso: '2026-07-01T00:00:00Z', status: 'assigned',
        },
        underwritingRecommendation: {
          dealId: underwritingDeal.id, decision: 'approve', rationale: 'Supports repayment capacity.',
          underwriterActor: 'UW Analyst', recordedAtIso: '2026-07-01T00:00:00Z', status: 'recorded',
        },
      };
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(input({
        workflow: workflow({ stageId: 'UNDERWRITING', nextIds: ['CREDIT_APPROVAL'], status: 'clear' }),
        requestedNextStageId: 'CREDIT_APPROVAL',
        facts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.blockers.join(' ')).toMatch(/risk rating/i);
      expect(upd).not.toHaveBeenCalled();
    });
  });

  // 2026-07-14 remediation (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, finding C3): an
  // interim, role-based approval-authority gate on exiting CREDIT_APPROVAL.
  describe('interim approval-authority gate (finding C3)', () => {
    // Final LOS Completion arc (Workstream C) — CREDIT_APPROVAL:approval_decision/authority/
    // conditions are now tracked, real blocking facts (a durable Credit Approval Decision record
    // must exist for this exact deal). This describe block tests the SEPARATE, standalone
    // approval-authority gate (finding C3) in isolation, so a satisfying decision record is supplied
    // here purely to clear the engine-level exit criteria and let each test's own scenario reach
    // (and exercise) the authority check itself.
    const satisfyingDecision: CreditApprovalDecisionRecord = {
      decisionId: 'cad-c3-fixture',
      dealId: baseDeal.id,
      status: 'APPROVED',
      approvedAmount: baseDeal.amount,
      approvedProduct: undefined,
      approvedTermMonths: undefined,
      approvedPricing: undefined,
      collateralSummary: undefined,
      conditions: [],
      authorityTier: 'committee',
      rationale: 'Fixture decision satisfying the engine-level exit criterion for this describe block.',
      requestedByActorEmail: 'banker@bank.test',
      requestedAtIso: '2026-07-20T00:00:00.000Z',
      decidedByActorEmail: 'committee-member@bank.test',
      decidedAtIso: '2026-07-24T00:00:00.000Z',
      correlationId: 'ca-corr-c3-fixture',
      supersedesDecisionId: undefined,
    };
    const creditApprovalFacts: WorkflowRequirementFacts = {
      deal: baseDeal,
      tasks: emptyTasks,
      documents: docsOf({ received: [mkDoc('Approval Evidence', 'received')] }),
      creditMemo: {
        memos: [{ id: 'm1', name: 'Memo', status: 'Final', statusKey: 'final', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }],
        sections: [
          { id: 's1', sectionKey: 'executive_summary', sectionLabel: 'Executive Summary', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
          { id: 's2', sectionKey: 'repayment_analysis', sectionLabel: 'Repayment Analysis', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
        ],
      },
      creditApprovalDecisions: [satisfyingDecision],
    };
    function creditApprovalInput(over: Partial<StageAdvanceInput> = {}) {
      return input({
        workflow: workflow({ stageId: 'CREDIT_APPROVAL', nextIds: ['COMMITMENT'], status: 'clear' }),
        requestedNextStageId: 'COMMITMENT',
        facts: creditApprovalFacts,
        ...over,
      });
    }

    it('blocks a banker who is not a credit committee member from exiting Credit Approval', async () => {
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(creditApprovalInput({
        advancingBankerAuthority: { approvalLimit: 1_000_000, creditCommitteeMember: false, approvalOverrideAuthority: false },
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.reason).toMatch(/credit committee authority/i);
      expect(upd).not.toHaveBeenCalled();
    });

    it('blocks a committee member whose approval limit is below the deal amount', async () => {
      const out = await advanceWorkflowStage(creditApprovalInput({
        advancingBankerAuthority: { approvalLimit: 1_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.reason).toMatch(/exceeds your individual approval authority/i);
    });

    it('blocks when no banker authority is supplied at all (fails closed, no banker record)', async () => {
      const out = await advanceWorkflowStage(creditApprovalInput({ advancingBankerAuthority: undefined }));
      expect(out.kind).toBe('blocked');
    });

    it('allows a credit committee member within their approval limit to exit Credit Approval', async () => {
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(creditApprovalInput({
        advancingBankerAuthority: { approvalLimit: 1_000_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('advanced');
      expect(upd).toHaveBeenCalledTimes(1);
    });

    it('allows override authority to bypass both the committee and limit checks', async () => {
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(creditApprovalInput({
        advancingBankerAuthority: { approvalLimit: 0, creditCommitteeMember: false, approvalOverrideAuthority: true },
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('advanced');
    });

    it('PR 106 — blocks a committee member with override authority from approving their OWN deal', async () => {
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(creditApprovalInput({
        facts: { ...creditApprovalFacts, deal: { ...baseDeal, assignedBankerId: 'banker-1' } },
        advancingBankerAuthority: { approvalLimit: 0, creditCommitteeMember: false, approvalOverrideAuthority: true },
        advancingActorBankerId: 'banker-1',
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('blocked');
      if (out.kind === 'blocked') expect(out.reason).toMatch(/cannot approve your own request/i);
      expect(upd).not.toHaveBeenCalled();
    });

    it('PR 106 — allows a genuinely different committee member to approve a deal assigned to someone else', async () => {
      const upd = vi.fn(async () => ({ ok: true }));
      const out = await advanceWorkflowStage(creditApprovalInput({
        facts: { ...creditApprovalFacts, deal: { ...baseDeal, assignedBankerId: 'banker-1' } },
        advancingBankerAuthority: { approvalLimit: 1_000_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
        advancingActorBankerId: 'banker-2',
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }));
      expect(out.kind).toBe('advanced');
      expect(upd).toHaveBeenCalledTimes(1);
    });
  });

  describe('auto-board on advance to BOARDED', () => {
    // Factory Arc Phase 12 — CLOSING_FUNDING:funds_disbursed is now a tracked, blocking requirement;
    // a deal genuinely ready to reach BOARDED must carry a FUNDED funding-authorization record.
    const fundedRecord: FundingAuthorizationRecord = {
      dealId: 'd-1', authorizationStatus: 'FUNDED', requestedAmount: 100000, approvedAmount: 100000,
      fundingDate: '2026-07-10', destinationVerificationStatus: 'verified', conditionsSatisfied: true,
      exceptions: [], requestedBy: 'banker@bank.test', requestedAt: '2026-07-01T00:00:00Z',
      authorizedAt: '2026-07-05T00:00:00Z', correlationId: 'corr-1', supportingDocumentIds: [],
      auditEventIds: [], recordId: 'fa-1',
    };
    // Final LOS Completion arc (Workstream F) — CLOSING_FUNDING:executed_docs is now a tracked,
    // blocking requirement too; a deal genuinely ready to reach BOARDED must also carry a
    // ATTESTED executed-document attestation record.
    const attestedDocsRecord: ExecutedDocumentAttestationRecord = {
      attestationId: 'edc-1',
      dealId: 'deal-1',
      status: 'ATTESTED',
      executedDateIso: '2026-07-09',
      notes: 'All documents executed at closing table, originals retained.',
      attestedByActorEmail: 'closer@bank.test',
      attestedAtIso: '2026-07-09T00:00:00Z',
      correlationId: 'edc-corr-1',
      supersedesAttestationId: undefined,
    };
    const closingFundingFacts: WorkflowRequirementFacts = {
      deal: baseDeal,
      tasks: { open: [], completed: [{ id: 't1', title: 'Booking quality control', completed: true, dueDate: undefined, assigneeName: undefined, modifiedOn: '2026-07-01T00:00:00Z' }] },
      documents: docsOf({ received: [mkDoc('Booking Package', 'received')] }),
      creditMemo: noMemo,
      fundingAuthorization: fundedRecord,
      executedDocumentAttestations: [attestedDocsRecord],
    };
    function closingFundingInput(over: Partial<StageAdvanceInput> = {}) {
      return input({
        workflow: workflow({ stageId: 'CLOSING_FUNDING', nextIds: ['BOARDED'], status: 'clear' }),
        requestedNextStageId: 'BOARDED',
        facts: closingFundingFacts,
        ...over,
      });
    }

    it('does not call onDealBoarded for a non-BOARDED advance', async () => {
      const onDealBoarded = { run: vi.fn(async () => ({ ok: true, detail: 'boarded' })) };
      const out = await advanceWorkflowStage(input({ onDealBoarded }));
      expect(out.kind).toBe('advanced');
      expect(onDealBoarded.run).not.toHaveBeenCalled();
      if (out.kind === 'advanced') expect(out.boardingOutcome).toBeUndefined();
    });

    it('calls onDealBoarded with the deal after a verified advance to BOARDED, and reports its outcome', async () => {
      const onDealBoarded = { run: vi.fn(async () => ({ ok: true, detail: 'Boarded as portfolio loan deal-1.' })) };
      const out = await advanceWorkflowStage(closingFundingInput({ onDealBoarded }));
      expect(out.kind).toBe('advanced');
      expect(onDealBoarded.run).toHaveBeenCalledWith(baseDeal);
      if (out.kind === 'advanced') {
        expect(out.to).toBe('BOARDED');
        expect(out.boardingOutcome).toEqual({ ok: true, detail: 'Boarded as portfolio loan deal-1.' });
      }
    });

    it('a boarding failure is reported honestly but does NOT revert or fail the already-persisted advance', async () => {
      const onDealBoarded = { run: vi.fn(async () => ({ ok: false, detail: 'Auto-boarding failed: write-failed' })) };
      const out = await advanceWorkflowStage(closingFundingInput({ onDealBoarded }));
      expect(out.kind).toBe('advanced');
      if (out.kind === 'advanced') {
        expect(out.boardingOutcome).toEqual({ ok: false, detail: 'Auto-boarding failed: write-failed' });
      }
    });

    it('a thrown error from onDealBoarded is caught and reported, never propagated', async () => {
      const onDealBoarded = { run: vi.fn(async () => { throw new Error('unexpected'); }) };
      const out = await advanceWorkflowStage(closingFundingInput({ onDealBoarded }));
      expect(out.kind).toBe('advanced');
      if (out.kind === 'advanced') {
        expect(out.boardingOutcome).toEqual({ ok: false, detail: 'unexpected' });
      }
    });

    it('advancing to BOARDED with no onDealBoarded injected simply omits boardingOutcome', async () => {
      const out = await advanceWorkflowStage(closingFundingInput());
      expect(out.kind).toBe('advanced');
      if (out.kind === 'advanced') expect(out.boardingOutcome).toBeUndefined();
    });
  });
});

describe('ARC Phase 3 — the write seam re-checks the stricter requirement engine (INTAKE scenario)', () => {
  const intakeDeal: DealDetail = {
    id: 'deal-1', name: 'Test Deal', clientName: 'Test Client', stage: 'Intake', status: 'Active',
    amount: 500_000, bankerName: 'Banker', targetCloseDate: '2026-09-01T00:00:00Z', productType: 'Term Loan',
    loanStructure: 'Senior Secured', customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: undefined,
    pricingType: undefined, spreadIndex: undefined, spreadMargin: undefined, collateralSummary: undefined,
    createdOn: undefined, stageEntryDate: '2026-06-01T00:00:00Z', isClosed: false,
  };
  const emptyFacts: WorkflowRequirementFacts = {
    deal: intakeDeal,
    tasks: { open: [], completed: [] },
    documents: { outstanding: [], received: [], reviewed: [] },
    creditMemo: { memos: [], sections: [] },
  };

  it('the legacy policy alone would allow it, but the engine blocks on a missing required document — the write is refused', async () => {
    // The hand-built `workflow()` fixture's legacy readiness is 'clear' (would have allowed the
    // write pre-Phase-3), but real facts show INTAKE's required "Loan application" document is
    // missing — the engine must catch what the legacy gate alone would have missed.
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(
      input({
        facts: emptyFacts,
        transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) },
      }),
    );
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') {
      expect(out.blockers.join(' ')).toMatch(/loan application/i);
    }
    expect(upd).not.toHaveBeenCalled();
  });

  it('facts satisfy the engine → the write proceeds as normal', async () => {
    const satisfiedFacts: WorkflowRequirementFacts = {
      ...emptyFacts,
      documents: {
        outstanding: [],
        received: [
          {
            id: 'd1', name: 'Loan Application', dueDate: undefined, requestDate: undefined,
            receivedDate: '2026-06-02T00:00:00Z', reviewer: undefined, uploaded: true, modifiedOn: undefined,
            status: 'received',
          },
        ],
        reviewed: [],
      },
    };
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ facts: satisfiedFacts, transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) } }));
    expect(out.kind).toBe('advanced');
    expect(upd).toHaveBeenCalledTimes(1);
  });
});

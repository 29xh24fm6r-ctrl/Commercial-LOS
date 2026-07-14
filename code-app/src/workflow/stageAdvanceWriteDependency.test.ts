// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { advanceWorkflowStage, type StageAdvanceInput } from './stageAdvanceWriteDependency';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import type { WorkflowRequirementFacts } from './loanWorkflowRequirementEngine';
import type { DealDetail } from '../deals/dealQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import type { DealTasksResult } from '../deals/dealTaskQueries';
import type { CreditMemoData } from '../deals/creditMemoQueries';

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

  // 2026-07-14 remediation (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, finding C3): an
  // interim, role-based approval-authority gate on exiting CREDIT_APPROVAL.
  describe('interim approval-authority gate (finding C3)', () => {
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
  });
});

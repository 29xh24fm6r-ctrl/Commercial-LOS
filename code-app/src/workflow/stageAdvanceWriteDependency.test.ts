// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { advanceWorkflowStage, type StageAdvanceInput } from './stageAdvanceWriteDependency';
import type { LoanWorkflowState } from './loanWorkflowTypes';
import type { WorkflowRequirementFacts } from './loanWorkflowRequirementEngine';
import type { DealDetail } from '../deals/dealQueries';

/** Minimal workflow state the stage policy reads (cast to the full type for the test). */
function workflow(over: { status?: 'blocked' | 'at-risk' | 'clear'; nextIds?: string[]; blockers?: string[] } = {}): LoanWorkflowState {
  return {
    currentStage: { id: 'INTAKE' },
    nextPermittedStages: (over.nextIds ?? ['UNDERWRITING']).map((id) => ({ id })),
    readiness: {
      status: over.status ?? 'clear',
      blockers: (over.blockers ?? []).map((label) => ({ label })),
    },
  } as unknown as LoanWorkflowState;
}

function input(over: Partial<StageAdvanceInput> = {}): StageAdvanceInput {
  return {
    enabled: true,
    authorized: true,
    dealId: 'deal-1',
    correlationId: 'corr-1',
    entryDateIso: '2026-06-24T00:00:00Z',
    workflow: workflow(),
    requestedNextStageId: 'UNDERWRITING',
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
});

describe('ARC Phase 3 — the write seam re-checks the stricter requirement engine when facts are supplied', () => {
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

  it('no facts supplied (legacy caller) → behaves exactly as before, no engine check applied', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: upd, readbackDealStage: vi.fn(async () => ({ ok: true, matched: true })) } }));
    expect(out.kind).toBe('advanced');
    expect(upd).toHaveBeenCalledTimes(1);
  });
});

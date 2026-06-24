// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { advanceWorkflowStage, type StageAdvanceInput } from './stageAdvanceWriteDependency';
import type { LoanWorkflowState } from './loanWorkflowTypes';

/** Minimal workflow state the stage policy reads (cast to the full type for the test). */
function workflow(over: { status?: 'blocked' | 'at-risk' | 'clear'; nextIds?: string[]; blockers?: string[] } = {}): LoanWorkflowState {
  return {
    currentStage: { id: 'application' },
    nextPermittedStages: (over.nextIds ?? ['underwriting']).map((id) => ({ id })),
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
    requestedNextStageId: 'underwriting',
    transport: { updateDealStage: vi.fn(async () => ({ ok: true })) },
    auditSink: { write: vi.fn(async () => ({ ok: true })) },
    timelineSink: { write: vi.fn(async () => ({ ok: true })) },
    ...over,
  };
}

describe('Phase 237F — governed stage advancement write dependency', () => {
  it('disabled by default → no write', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ enabled: false, transport: { updateDealStage: upd } }));
    expect(out.kind).toBe('disabled');
    expect(upd).not.toHaveBeenCalled();
  });

  it('unauthorized is blocked before any write', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    expect((await advanceWorkflowStage(input({ authorized: false, transport: { updateDealStage: upd } }))).kind).toBe('unauthorized');
    expect(upd).not.toHaveBeenCalled();
  });

  it('blockers prevent the write (readiness blocked)', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ workflow: workflow({ status: 'blocked', blockers: ['Missing credit memo'] }), transport: { updateDealStage: upd } }));
    expect(out.kind).toBe('blocked');
    if (out.kind === 'blocked') expect(out.blockers).toContain('Missing credit memo');
    expect(upd).not.toHaveBeenCalled();
  });

  it('no approved next stage prevents the write', async () => {
    const out = await advanceWorkflowStage(input({ requestedNextStageId: 'closing', workflow: workflow({ nextIds: ['underwriting'] }) }));
    expect(out.kind).toBe('blocked');
  });

  it('successful update writes audit + timeline and returns advanced', async () => {
    const upd = vi.fn(async () => ({ ok: true }));
    const audit = vi.fn(async () => ({ ok: true }));
    const timeline = vi.fn(async () => ({ ok: true }));
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: upd }, auditSink: { write: audit }, timelineSink: { write: timeline } }));
    expect(out.kind).toBe('advanced');
    if (out.kind === 'advanced') { expect(out.from).toBe('application'); expect(out.to).toBe('underwriting'); }
    expect(upd).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'advanced' }));
    expect(timeline).toHaveBeenCalledTimes(1);
  });

  it('update failure is surfaced (never fake success)', async () => {
    const out = await advanceWorkflowStage(input({ transport: { updateDealStage: async () => ({ ok: false, error: 'boom' }) } }));
    expect(out.kind).toBe('update_failed');
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

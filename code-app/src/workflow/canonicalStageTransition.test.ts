// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  evaluateCanonicalStageTransition,
  executeCanonicalStageTransition,
  type CanonicalTransitionRequest,
  type CanonicalStageTransport,
  type CanonicalAuditSink,
  type CanonicalTimelineSink,
  type ExecuteCanonicalTransitionInput,
} from './canonicalStageTransition';
import { resolveStageOrdering, CANONICAL_STAGE_CODES, type StageReferenceRow } from './stageOrderingContract';
import { evaluateExitGate, type StageGateFacts } from './stageGateContract';

const ORDERING = (() => {
  const seq: Record<string, number> = { INTAKE: 10, UNDERWRITING: 20, CREDIT_APPROVAL: 30, COMMITMENT: 40, DOCUMENTATION: 50, CLOSING_FUNDING: 60, BOARDED: 70 };
  const rows: StageReferenceRow[] = CANONICAL_STAGE_CODES.map((c) => ({ cr664_code: c, cr664_name: c, cr664_sequence: seq[c], cr664_activeflag: true }));
  return resolveStageOrdering(rows);
})();

const INTAKE_MET: StageGateFacts = {
  borrowerPresent: true, loanAmountPresent: true, productTypePresent: true,
  assignedBankerPresent: true, intakeChecklistGenerated: true,
  completeCreditMemoPresent: true, loanApplicationReceived: true,
  businessFinancialStatementsReceived: true, taxReturnsReceived: true,
  ownershipInformationReceived: true, collateralSupportReceived: true,
};

function gate(stage: Parameters<typeof evaluateExitGate>[0], facts: StageGateFacts) {
  return evaluateExitGate(stage, facts);
}

describe('evaluateCanonicalStageTransition — policy (pure, both directions)', () => {
  it('ADVANCE is allowed when next resolvable + gate satisfied + authorized', () => {
    const req: CanonicalTransitionRequest = { kind: 'ADVANCE', currentStage: 'INTAKE', currentStatus: 'OPEN' };
    const p = evaluateCanonicalStageTransition({ request: req, ordering: ORDERING, exitGate: gate('INTAKE', INTAKE_MET), authorized: true });
    expect(p.allowed).toBe(true);
    if (p.allowed) { expect(p.to).toBe('UNDERWRITING'); expect(p.nextStatus).toBe('OPEN'); }
  });

  it('ADVANCE is BLOCKED when the exit gate is not satisfied, surfacing the outstanding labels', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'ADVANCE', currentStage: 'INTAKE', currentStatus: 'OPEN' },
      ordering: ORDERING, exitGate: gate('INTAKE', { ...INTAKE_MET, intakeChecklistGenerated: false }), authorized: true,
    });
    expect(p.allowed).toBe(false);
    if (!p.allowed) { expect(p.code).toBe('blocked'); expect(p.blockers.join(' ')).toMatch(/checklist/i); }
  });

  it('ADVANCE into BOARDED sets status BOARDED', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'ADVANCE', currentStage: 'CLOSING_FUNDING', currentStatus: 'OPEN' },
      ordering: ORDERING, exitGate: { stage: 'CLOSING_FUNDING', satisfied: true, requirements: [] }, authorized: true,
    });
    expect(p.allowed).toBe(true);
    if (p.allowed) { expect(p.to).toBe('BOARDED'); expect(p.nextStatus).toBe('BOARDED'); }
  });

  it('ADVANCE is BLOCKED at the terminal stage (no next)', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'ADVANCE', currentStage: 'BOARDED', currentStatus: 'BOARDED' },
      ordering: ORDERING, exitGate: { stage: 'BOARDED', satisfied: true, requirements: [] }, authorized: true,
    });
    expect(p.allowed).toBe(false); // terminal status blocks first
  });

  it('UNAUTHORIZED actor is denied with code unauthorized', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'ADVANCE', currentStage: 'INTAKE', currentStatus: 'OPEN' },
      ordering: ORDERING, exitGate: gate('INTAKE', INTAKE_MET), authorized: false,
    });
    expect(p.allowed).toBe(false);
    if (!p.allowed) expect(p.code).toBe('unauthorized');
  });

  it('RETURN is allowed to an earlier stage with a reason; blocked to a non-prior stage', () => {
    const ok = evaluateCanonicalStageTransition({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'OPEN', targetStage: 'UNDERWRITING', reason: 'need more info' },
      ordering: ORDERING, authorized: true,
    });
    expect(ok.allowed).toBe(true);
    if (ok.allowed) expect(ok.to).toBe('UNDERWRITING');

    const bad = evaluateCanonicalStageTransition({
      request: { kind: 'RETURN', currentStage: 'UNDERWRITING', currentStatus: 'OPEN', targetStage: 'CREDIT_APPROVAL', reason: 'x' },
      ordering: ORDERING, authorized: true,
    });
    expect(bad.allowed).toBe(false); // CREDIT_APPROVAL is not earlier than UNDERWRITING
  });

  it('RETURN without a reason is blocked', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'OPEN', targetStage: 'INTAKE', reason: '   ' },
      ordering: ORDERING, authorized: true,
    });
    expect(p.allowed).toBe(false);
  });

  it('DECLINE requires a structured reason and sets DECLINED + adverse-action-pending', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'DECLINE', currentStage: 'UNDERWRITING', currentStatus: 'OPEN', declineReason: { code: 'INSUFFICIENT_COLLATERAL' } },
      ordering: ORDERING, authorized: true,
    });
    expect(p.allowed).toBe(true);
    if (p.allowed) { expect(p.nextStatus).toBe('DECLINED'); expect(p.adverseActionPending).toBe(true); }

    const noReason = evaluateCanonicalStageTransition({
      request: { kind: 'DECLINE', currentStage: 'UNDERWRITING', currentStatus: 'OPEN', declineReason: { code: '' } },
      ordering: ORDERING, authorized: true,
    });
    expect(noReason.allowed).toBe(false);
  });

  it('WITHDRAW requires a reason and sets WITHDRAWN', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'WITHDRAW', currentStage: 'COMMITMENT', currentStatus: 'OPEN', reason: 'borrower withdrew' },
      ordering: ORDERING, authorized: true,
    });
    expect(p.allowed).toBe(true);
    if (p.allowed) expect(p.nextStatus).toBe('WITHDRAWN');
  });

  it('any transition is blocked when the deal is already in a terminal status', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'DECLINED', targetStage: 'INTAKE', reason: 'x' },
      ordering: ORDERING, authorized: true,
    });
    expect(p.allowed).toBe(false);
    if (!p.allowed) expect(p.reason).toMatch(/terminal status/i);
  });

  it('is blocked when ordering is unavailable (stages not seeded)', () => {
    const p = evaluateCanonicalStageTransition({
      request: { kind: 'ADVANCE', currentStage: 'INTAKE', currentStatus: 'OPEN' },
      ordering: { status: 'unavailable', reasons: ['missing stage BOARDED'] }, exitGate: gate('INTAKE', INTAKE_MET), authorized: true,
    });
    expect(p.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Governed write
// ---------------------------------------------------------------------------

function sinks(over: Partial<{ updateOk: boolean; auditOk: boolean; timelineOk: boolean; readbackOk: boolean; readbackMatched: boolean }> = {}) {
  const calls = { update: 0, readback: 0, audit: [] as string[], timeline: 0 };
  const transport: CanonicalStageTransport = {
    async applyTransition() { calls.update++; return { ok: over.updateOk ?? true, error: over.updateOk === false ? 'boom' : undefined }; },
    async readbackTransition() { calls.readback++; return { ok: over.readbackOk ?? true, matched: over.readbackMatched ?? true }; },
  };
  const auditSink: CanonicalAuditSink = {
    async write(a) { calls.audit.push(a.outcome); return { ok: over.auditOk ?? true }; },
  };
  const timelineSink: CanonicalTimelineSink = {
    async write() { calls.timeline++; return { ok: over.timelineOk ?? true }; },
  };
  return { transport, auditSink, timelineSink, calls };
}

function baseExec(over: Partial<ExecuteCanonicalTransitionInput> = {}): ExecuteCanonicalTransitionInput {
  const s = sinks();
  return {
    enabled: true,
    authorized: true,
    dealId: 'deal-1',
    correlationId: 'corr-1',
    entryDateIso: '2026-06-30T00:00:00.000Z',
    ordering: ORDERING,
    request: { kind: 'ADVANCE', currentStage: 'INTAKE', currentStatus: 'OPEN' },
    exitGate: gate('INTAKE', INTAKE_MET),
    transport: s.transport,
    auditSink: s.auditSink,
    timelineSink: s.timelineSink,
    ...over,
  };
}

describe('executeCanonicalStageTransition — governed write', () => {
  it('is disabled when the gate is explicitly off — no write (fail-closed)', async () => {
    // Fail-closed disabled path, pinned via an explicit gate override.
    const out = await executeCanonicalStageTransition(baseExec({ enabled: false }));
    expect(out.kind).toBe('disabled');
  });

  it('WF-1A: with no explicit gate it falls back to the armed AUTO_STAGE_ADVANCE_ENABLED and transitions', async () => {
    // AUTO_STAGE_ADVANCE_ENABLED is intentionally armed for the "walk one deal"
    // pilot, so `enabled: undefined` resolves to the armed constant (not disabled).
    const out = await executeCanonicalStageTransition(baseExec({ enabled: undefined }));
    expect(out.kind).toBe('transitioned');
  });

  it('advances end-to-end, emitting audit + timeline', async () => {
    const out = await executeCanonicalStageTransition(baseExec());
    expect(out.kind).toBe('transitioned');
    if (out.kind === 'transitioned') { expect(out.to).toBe('UNDERWRITING'); expect(out.status).toBe('OPEN'); }
  });

  it('DECLINE records the structured reason and surfaces adverse-action-pending (no send)', async () => {
    const out = await executeCanonicalStageTransition(baseExec({
      request: { kind: 'DECLINE', currentStage: 'UNDERWRITING', currentStatus: 'OPEN', declineReason: { code: 'DSCR_TOO_LOW', detail: 'DSCR 0.9' } },
      exitGate: undefined,
    }));
    expect(out.kind).toBe('transitioned');
    if (out.kind === 'transitioned') { expect(out.status).toBe('DECLINED'); expect(out.adverseActionPending).toBe(true); }
  });

  it('is unauthorized when actor not authorized', async () => {
    const out = await executeCanonicalStageTransition(baseExec({ authorized: false }));
    expect(out.kind).toBe('unauthorized');
  });

  it('blocks when the gate is unsatisfied (no write)', async () => {
    const s = sinks();
    const out = await executeCanonicalStageTransition(baseExec({
      exitGate: gate('INTAKE', { ...INTAKE_MET, intakeChecklistGenerated: false }),
      transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink,
    }));
    expect(out.kind).toBe('blocked');
    expect(s.calls.update).toBe(0);
  });

  it('reports dependency_not_ready when a sink is missing', async () => {
    const out = await executeCanonicalStageTransition(baseExec({ transport: undefined }));
    expect(out.kind).toBe('dependency_not_ready');
  });

  it('returns update_failed (and audits it) when the transport write fails', async () => {
    const s = sinks({ updateOk: false });
    const out = await executeCanonicalStageTransition(baseExec({ transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink }));
    expect(out.kind).toBe('update_failed');
    expect(s.calls.audit).toContain('update_failed');
  });

  it('RETURN transitions end-to-end to an earlier stage (readback confirms) and proves the readback ran', async () => {
    const s = sinks();
    const out = await executeCanonicalStageTransition(baseExec({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'OPEN', targetStage: 'UNDERWRITING', reason: 'need updated financials' },
      exitGate: undefined,
      transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink,
    }));
    expect(out.kind).toBe('transitioned');
    if (out.kind === 'transitioned') { expect(out.to).toBe('UNDERWRITING'); expect(out.status).toBe('OPEN'); }
    expect(s.calls.readback).toBe(1);
  });

  it('readback MISMATCH after a successful update → readback_failed; audits the failure; NO timeline', async () => {
    const s = sinks({ readbackMatched: false });
    const out = await executeCanonicalStageTransition(baseExec({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'OPEN', targetStage: 'UNDERWRITING', reason: 'x' },
      exitGate: undefined,
      transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink,
    }));
    expect(out.kind).toBe('readback_failed');
    expect(s.calls.audit).toContain('readback_failed');
    expect(s.calls.audit).not.toContain('transitioned');
    expect(s.calls.timeline).toBe(0);
  });

  it('readback UNAVAILABLE after a successful update → readback_failed (persistence unconfirmed)', async () => {
    const s = sinks({ readbackOk: false, readbackMatched: false });
    const out = await executeCanonicalStageTransition(baseExec({
      request: { kind: 'RETURN', currentStage: 'CREDIT_APPROVAL', currentStatus: 'OPEN', targetStage: 'UNDERWRITING', reason: 'x' },
      exitGate: undefined,
      transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink,
    }));
    expect(out.kind).toBe('readback_failed');
    expect(s.calls.timeline).toBe(0);
  });

  it('returns audit_failed_partial_success when audit fails after a successful update (honest partial)', async () => {
    const s = sinks({ auditOk: false });
    const out = await executeCanonicalStageTransition(baseExec({ transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink }));
    expect(out.kind).toBe('audit_failed_partial_success');
  });

  it('returns timeline_failed_partial_success when timeline fails after update + audit', async () => {
    const s = sinks({ timelineOk: false });
    const out = await executeCanonicalStageTransition(baseExec({ transport: s.transport, auditSink: s.auditSink, timelineSink: s.timelineSink }));
    expect(out.kind).toBe('timeline_failed_partial_success');
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Controllable stubs for the generated services + actor resolver so these unit
// tests drive each payload deterministically and never load the real SDK.
const { loandealsUpdate, loandealsGet, auditCreate, stageGetAll, statusGetAll, timelineCreate, resolveActor } =
  vi.hoisted(() => ({
    loandealsUpdate: vi.fn(),
    loandealsGet: vi.fn(),
    auditCreate: vi.fn(),
    stageGetAll: vi.fn(),
    statusGetAll: vi.fn(),
    timelineCreate: vi.fn(),
    resolveActor: vi.fn(),
  }));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { update: loandealsUpdate, get: loandealsGet },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: auditCreate },
}));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: stageGetAll },
}));
vi.mock('../generated/services/Cr664_dealstatusreferencesService', () => ({
  Cr664_dealstatusreferencesService: { getAll: statusGetAll },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreate },
}));
vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: () => resolveActor,
}));

import { buildLiveCanonicalTransitionDeps } from './buildLiveCanonicalTransitionDeps';

beforeEach(() => {
  loandealsUpdate.mockReset();
  loandealsGet.mockReset();
  auditCreate.mockReset();
  stageGetAll.mockReset();
  statusGetAll.mockReset();
  timelineCreate.mockReset();
  resolveActor.mockReset();
});

const actor = { actorSystemUserId: 'sys-1', actorEmail: 'banker@oldglorybank.com' };

function stageRow(code: string, id = `ref-${code}`) {
  return { success: true, data: [{ cr664_dealstagereferenceid: id, cr664_code: code, cr664_activeflag: true }] };
}

function statusRow(code: string, id = `st-${code}`) {
  return { success: true, data: [{ cr664_dealstatusreferenceid: id, cr664_code: code, cr664_activeflag: true }] };
}

describe('buildLiveCanonicalTransitionDeps — RETURN transport.applyTransition (WFLOW-C)', () => {
  it('resolves the earlier target stage to a live bind and updates StageReference + entry date (status stays OPEN — no status write)', async () => {
    stageGetAll.mockResolvedValueOnce(stageRow('UNDERWRITING', 'ref-uw'));
    loandealsUpdate.mockResolvedValueOnce({ success: true });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.applyTransition({
      dealId: 'deal-1', transition: 'RETURN', fromStage: 'CREDIT_APPROVAL', toStage: 'UNDERWRITING',
      newStatus: 'OPEN', reasonText: 'need updated financials', entryDateIso: '2026-07-02T00:00:00Z',
    });

    expect(res.ok).toBe(true);
    const [id, patch] = loandealsUpdate.mock.calls[0];
    expect(id).toBe('deal-1');
    expect(patch).toEqual(expect.objectContaining({
      'cr664_StageReference@odata.bind': '/cr664_dealstagereferences(ref-uw)',
      cr664_stageentrydate: '2026-07-02T00:00:00Z',
    }));
    // OPEN is the default status — RETURN must NOT touch the status reference (and must not query it).
    expect('cr664_StatusReference@odata.bind' in (patch as object)).toBe(false);
    expect(statusGetAll).not.toHaveBeenCalled();
  });

  it('fails closed (no update) when the target stage reference row is absent — table not seeded', async () => {
    stageGetAll.mockResolvedValueOnce({ success: true, data: [] });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.applyTransition({
      dealId: 'deal-1', transition: 'RETURN', fromStage: 'CREDIT_APPROVAL', toStage: 'UNDERWRITING',
      newStatus: 'OPEN', entryDateIso: 'x',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No active cr664_dealstagereferences row/);
    expect(loandealsUpdate).not.toHaveBeenCalled();
  });
});

describe('buildLiveCanonicalTransitionDeps — RETURN transport.readbackTransition (WFLOW-C)', () => {
  it('confirms the return when the re-read stage-reference value + entry date match the target', async () => {
    stageGetAll.mockResolvedValueOnce(stageRow('UNDERWRITING', 'ref-uw'));
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_stagereference_value: 'ref-uw', cr664_stageentrydate: '2026-07-02T00:00:00Z', _cr664_statusreference_value: 'ref-open' },
    });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.readbackTransition({
      dealId: 'deal-1', transition: 'RETURN', expectedToStage: 'UNDERWRITING', expectedStatus: 'OPEN', expectedEntryDateIso: '2026-07-02T00:00:00Z',
    });

    expect(res).toEqual({ ok: true, matched: true });
    // OPEN target status is the default — the readback must NOT require a status reference resolution.
    expect(statusGetAll).not.toHaveBeenCalled();
  });

  it('reports matched:false when the persisted stage-reference value does NOT match the target', async () => {
    stageGetAll.mockResolvedValueOnce(stageRow('UNDERWRITING', 'ref-uw'));
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_stagereference_value: 'ref-STILL-CREDIT', cr664_stageentrydate: '2026-07-02T00:00:00Z' },
    });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.readbackTransition({
      dealId: 'deal-1', transition: 'RETURN', expectedToStage: 'UNDERWRITING', expectedStatus: 'OPEN', expectedEntryDateIso: '2026-07-02T00:00:00Z',
    });

    expect(res.ok).toBe(true);
    expect(res.matched).toBe(false);
    expect(res.detail).toMatch(/did not (match|persist)/i);
  });

  it('reports ok:false (unavailable) when the deal re-read itself fails', async () => {
    loandealsGet.mockResolvedValueOnce({ success: false, error: { message: 'read timeout' } });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.readbackTransition({
      dealId: 'deal-1', transition: 'RETURN', expectedToStage: 'UNDERWRITING', expectedStatus: 'OPEN', expectedEntryDateIso: 'x',
    });

    expect(res.ok).toBe(false);
    expect(res.matched).toBe(false);
  });
});

describe('buildLiveCanonicalTransitionDeps — DECLINE transport (WFLOW-D)', () => {
  it('persists the DECLINED status reference and does NOT move the stage (no stage-table query)', async () => {
    statusGetAll.mockResolvedValueOnce(statusRow('DECLINED', 'st-declined'));
    loandealsUpdate.mockResolvedValueOnce({ success: true });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.applyTransition({
      dealId: 'deal-1', transition: 'DECLINE', fromStage: 'UNDERWRITING',
      newStatus: 'DECLINED', reasonCode: 'DSCR_TOO_LOW', reasonText: 'DSCR 0.9', entryDateIso: '2026-07-02T00:00:00Z',
    });

    expect(res.ok).toBe(true);
    const [, patch] = loandealsUpdate.mock.calls[0];
    expect(patch).toEqual({ 'cr664_StatusReference@odata.bind': '/cr664_dealstatusreferences(st-declined)' });
    // DECLINE never changes the stage — no StageReference write and no stage lookup.
    expect('cr664_StageReference@odata.bind' in (patch as object)).toBe(false);
    expect('cr664_stageentrydate' in (patch as object)).toBe(false);
    expect(stageGetAll).not.toHaveBeenCalled();
  });

  it('fails closed (no update) when the DECLINED status reference row is absent — table not seeded', async () => {
    statusGetAll.mockResolvedValueOnce({ success: true, data: [] });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.applyTransition({
      dealId: 'deal-1', transition: 'DECLINE', fromStage: 'UNDERWRITING', newStatus: 'DECLINED', reasonCode: 'X', entryDateIso: 'x',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No active cr664_dealstatusreferences row/);
    expect(loandealsUpdate).not.toHaveBeenCalled();
  });

  it('readback confirms DECLINE when the persisted status reference matches DECLINED (no stage check)', async () => {
    statusGetAll.mockResolvedValueOnce(statusRow('DECLINED', 'st-declined'));
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_statusreference_value: 'st-declined', _cr664_stagereference_value: 'ref-uw' },
    });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.readbackTransition({
      dealId: 'deal-1', transition: 'DECLINE', expectedStatus: 'DECLINED', expectedEntryDateIso: 'x',
    });

    expect(res).toEqual({ ok: true, matched: true });
    expect(stageGetAll).not.toHaveBeenCalled();
  });

  it('readback reports matched:false when the persisted status reference is NOT DECLINED', async () => {
    statusGetAll.mockResolvedValueOnce(statusRow('DECLINED', 'st-declined'));
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_statusreference_value: 'st-STILL-OPEN' },
    });
    const { transport } = buildLiveCanonicalTransitionDeps(actor);

    const res = await transport.readbackTransition({
      dealId: 'deal-1', transition: 'DECLINE', expectedStatus: 'DECLINED', expectedEntryDateIso: 'x',
    });

    expect(res.ok).toBe(true);
    expect(res.matched).toBe(false);
    expect(res.detail).toMatch(/DECLINED/);
  });
});

describe('buildLiveCanonicalTransitionDeps — DECLINE audit + timeline (WFLOW-D)', () => {
  it('audit records the structured decline reason AND the pending adverse-action marker', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    auditCreate.mockResolvedValueOnce({ success: true });
    const { auditSink } = buildLiveCanonicalTransitionDeps(actor);

    const res = await auditSink.write({
      correlationId: 'c1', dealId: 'deal-1', transition: 'DECLINE', fromStage: 'UNDERWRITING',
      newStatus: 'DECLINED', outcome: 'transitioned', adverseActionPending: true, reasonCode: 'DSCR_TOO_LOW', reasonText: 'DSCR 0.9',
    });

    expect(res.ok).toBe(true);
    const payload = auditCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cr664_afterstate).toBe('DECLINED');
    expect(String(payload.cr664_notes)).toMatch(/Adverse-action handling PENDING/);
    expect(String(payload.cr664_notes)).toMatch(/DSCR_TOO_LOW/);
    expect(JSON.stringify(payload)).not.toMatch(/systemusers/);
  });

  it('timeline records DECLINE as an ApprovalDecision titled "Deal declined"', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    timelineCreate.mockResolvedValueOnce({ success: true });
    const { timelineSink } = buildLiveCanonicalTransitionDeps(actor);

    const res = await timelineSink.write({ correlationId: 'c1', dealId: 'deal-1', transition: 'DECLINE', newStatus: 'DECLINED' });

    expect(res.ok).toBe(true);
    const payload = timelineCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190013); // ApprovalDecision
    expect(String(payload.cr664_title)).toMatch(/declined/i);
  });

  it('GUARANTEE: the live transition module imports NO borrower-comms — DECLINE/WITHDRAW never send', () => {
    const src = readFileSync(resolve(__dirname, 'buildLiveCanonicalTransitionDeps.ts'), 'utf8');
    // No reference to the borrower email/notice sender, and no import from any
    // borrower-named module (checked on import specifiers so prose can't trip it).
    expect(src).not.toMatch(/sendBorrowerUpdateEmail/);
    expect(src).not.toMatch(/from ['"][^'"]*[Bb]orrower[^'"]*['"]/);
  });
});

describe('buildLiveCanonicalTransitionDeps — auditSink', () => {
  it('emits a governed cr664_AuditEvent bound to the resolved cr664_user (never a systemuser) and records the reason', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    auditCreate.mockResolvedValueOnce({ success: true });
    const { auditSink } = buildLiveCanonicalTransitionDeps(actor);

    const res = await auditSink.write({
      correlationId: 'c1', dealId: 'deal-1', transition: 'RETURN', fromStage: 'CREDIT_APPROVAL', toStage: 'UNDERWRITING',
      newStatus: 'OPEN', outcome: 'transitioned', adverseActionPending: false, reasonText: 'need updated financials',
    });

    expect(res.ok).toBe(true);
    const payload = auditCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload.cr664_oldvalue).toBe('CREDIT_APPROVAL');
    expect(payload.cr664_newvalue).toBe('UNDERWRITING');
    expect(String(payload.cr664_notes)).toMatch(/need updated financials/);
    expect(JSON.stringify(payload)).not.toMatch(/systemusers/);
  });

  it('fails closed (no audit write) when the actor cr664_user cannot be resolved', async () => {
    resolveActor.mockResolvedValueOnce({ ok: false, reason: 'no cr664_user identity' });
    const { auditSink } = buildLiveCanonicalTransitionDeps(actor);

    const res = await auditSink.write({
      correlationId: 'c1', dealId: 'd', transition: 'RETURN', fromStage: 'CREDIT_APPROVAL', toStage: 'UNDERWRITING',
      newStatus: 'OPEN', outcome: 'transitioned', adverseActionPending: false,
    });

    expect(res.ok).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe('buildLiveCanonicalTransitionDeps — timelineSink', () => {
  it('emits a StageChanged timeline event for RETURN whose cr664_EventBy is the resolved cr664_user (never a systemuser)', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    timelineCreate.mockResolvedValueOnce({ success: true });
    const { timelineSink } = buildLiveCanonicalTransitionDeps(actor);

    const res = await timelineSink.write({ correlationId: 'c1', dealId: 'deal-1', transition: 'RETURN', toStage: 'UNDERWRITING', newStatus: 'OPEN' });

    expect(res.ok).toBe(true);
    const payload = timelineCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190006); // StageChanged
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(String(payload.cr664_title)).toMatch(/returned to UNDERWRITING/);
    expect(JSON.stringify(payload)).not.toMatch(/systemusers/);
  });
});

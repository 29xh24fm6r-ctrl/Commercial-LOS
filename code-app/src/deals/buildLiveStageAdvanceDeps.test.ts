// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable stubs for the generated services + actor resolver so these unit
// tests drive each payload deterministically and never load the real SDK.
const { loandealsUpdate, auditCreate, stageGetAll, timelineCreate, resolveActor } = vi.hoisted(() => ({
  loandealsUpdate: vi.fn(),
  auditCreate: vi.fn(),
  stageGetAll: vi.fn(),
  timelineCreate: vi.fn(),
  resolveActor: vi.fn(),
}));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { update: loandealsUpdate },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: auditCreate },
}));
vi.mock('../generated/services/Cr664_dealstagereferencesService', () => ({
  Cr664_dealstagereferencesService: { getAll: stageGetAll },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreate },
}));
vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: () => resolveActor,
}));

import { buildLiveStageAdvanceDeps } from './buildLiveStageAdvanceDeps';

beforeEach(() => {
  loandealsUpdate.mockReset();
  auditCreate.mockReset();
  stageGetAll.mockReset();
  timelineCreate.mockReset();
  resolveActor.mockReset();
});

const actor = { actorSystemUserId: 'sys-1', actorEmail: 'banker@oldglorybank.com' };

describe('buildLiveStageAdvanceDeps — transport.updateDealStage', () => {
  it('resolves the canonical stage code to a live bind and updates cr664_StageReference + entry date', async () => {
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref-uw', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
    });
    loandealsUpdate.mockResolvedValueOnce({ success: true });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.updateDealStage({
      dealId: 'deal-1',
      fromStageId: 'INTAKE',
      toStageId: 'UNDERWRITING',
      entryDateIso: '2026-07-02T00:00:00Z',
    });

    expect(res.ok).toBe(true);
    expect(stageGetAll).toHaveBeenCalledWith(expect.objectContaining({ filter: "cr664_code eq 'UNDERWRITING'" }));
    expect(loandealsUpdate).toHaveBeenCalledWith('deal-1', expect.objectContaining({
      'cr664_StageReference@odata.bind': '/cr664_dealstagereferences(ref-uw)',
      cr664_stageentrydate: '2026-07-02T00:00:00Z',
    }));
  });

  it('fails closed (no update) when the stage reference row is absent — table not seeded', async () => {
    stageGetAll.mockResolvedValueOnce({ success: true, data: [] });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.updateDealStage({ dealId: 'deal-1', fromStageId: 'INTAKE', toStageId: 'UNDERWRITING', entryDateIso: 'x' });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/No active cr664_dealstagereferences row/);
    expect(loandealsUpdate).not.toHaveBeenCalled();
  });

  it('fails closed when the matching reference row is inactive', async () => {
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref', cr664_code: 'UNDERWRITING', cr664_activeflag: false }],
    });
    const { transport } = buildLiveStageAdvanceDeps(actor);
    expect((await transport.updateDealStage({ dealId: 'd', fromStageId: 'INTAKE', toStageId: 'UNDERWRITING', entryDateIso: 'x' })).ok).toBe(false);
    expect(loandealsUpdate).not.toHaveBeenCalled();
  });
});

describe('buildLiveStageAdvanceDeps — auditSink', () => {
  it('emits a governed cr664_AuditEvent bound to the resolved cr664_user (never a systemuser)', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    auditCreate.mockResolvedValueOnce({ success: true });
    const { auditSink } = buildLiveStageAdvanceDeps(actor);

    const res = await auditSink.write({ correlationId: 'c1', dealId: 'deal-1', fromStageId: 'INTAKE', toStageId: 'UNDERWRITING', outcome: 'advanced' });

    expect(res.ok).toBe(true);
    const payload = auditCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
    expect(payload['cr664_LoanDeal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload.cr664_oldvalue).toBe('INTAKE');
    expect(payload.cr664_newvalue).toBe('UNDERWRITING');
    expect(payload.cr664_correlationid).toBe('c1');
    // The audit's only actor bind is cr664_ChangedBy (cr664_user); no systemuser bind is ever emitted.
    expect(JSON.stringify(payload)).not.toMatch(/systemusers/);
  });

  it('fails closed (no audit write) when the actor cr664_user cannot be resolved', async () => {
    resolveActor.mockResolvedValueOnce({ ok: false, reason: 'no cr664_user identity' });
    const { auditSink } = buildLiveStageAdvanceDeps(actor);

    const res = await auditSink.write({ correlationId: 'c1', dealId: 'd', fromStageId: 'INTAKE', toStageId: 'UNDERWRITING', outcome: 'advanced' });

    expect(res.ok).toBe(false);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe('buildLiveStageAdvanceDeps — timelineSink', () => {
  it('emits a StageChanged timeline event bound to the deal + systemuser', async () => {
    timelineCreate.mockResolvedValueOnce({ success: true });
    const { timelineSink } = buildLiveStageAdvanceDeps(actor);

    const res = await timelineSink.write({ correlationId: 'c1', dealId: 'deal-1', toStageId: 'UNDERWRITING' });

    expect(res.ok).toBe(true);
    const payload = timelineCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190006); // StageChanged
    expect(payload.cr664_visibilityscope).toBe(788190000); // BankerAndManager
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    expect(payload['cr664_EventBy@odata.bind']).toBe('/systemusers(sys-1)');
  });
});

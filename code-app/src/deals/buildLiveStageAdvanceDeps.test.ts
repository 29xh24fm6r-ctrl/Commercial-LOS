// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable stubs for the generated services + actor resolver so these unit
// tests drive each payload deterministically and never load the real SDK.
const { loandealsUpdate, loandealsGet, auditCreate, stageGetAll, timelineCreate, resolveActor } = vi.hoisted(() => ({
  loandealsUpdate: vi.fn(),
  loandealsGet: vi.fn(),
  auditCreate: vi.fn(),
  stageGetAll: vi.fn(),
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
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: timelineCreate },
}));
vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: () => resolveActor,
}));

const { mapDealToExistingLoanInput, boardExistingLoan, buildLiveExistingLoanDeps } = vi.hoisted(() => ({
  mapDealToExistingLoanInput: vi.fn(),
  boardExistingLoan: vi.fn(),
  buildLiveExistingLoanDeps: vi.fn(() => ({})),
}));
vi.mock('../portfolioBoarding/mapDealToExistingLoanInput', () => ({ mapDealToExistingLoanInput }));
vi.mock('../portfolioBoarding/existingLoanEntryAdapter', () => ({ boardExistingLoan, buildLiveExistingLoanDeps }));

import { buildLiveStageAdvanceDeps } from './buildLiveStageAdvanceDeps';
import type { DealDetail } from './dealQueries';

beforeEach(() => {
  loandealsUpdate.mockReset();
  loandealsGet.mockReset();
  auditCreate.mockReset();
  stageGetAll.mockReset();
  timelineCreate.mockReset().mockResolvedValue({ success: true });
  resolveActor.mockReset().mockResolvedValue({ ok: true, changedByBind: '/cr664_users(core-1)' });
  mapDealToExistingLoanInput.mockReset();
  boardExistingLoan.mockReset();
  buildLiveExistingLoanDeps.mockReset().mockReturnValue({});
});

const testDeal: DealDetail = {
  id: 'deal-1', name: 'Test Deal', clientName: 'Acme LLC', stage: 'CLOSING_FUNDING', status: 'Active', amount: 500_000,
  bankerName: 'M. Paller', targetCloseDate: '2026-12-31T00:00:00Z', productType: 'Term Loan', loanStructure: 'Senior Secured',
  customerType: 'C&I', industry: 'Manufacturing', guarantorStructure: 'One PG', pricingType: 'Floating', spreadIndex: 'SOFR',
  spreadMargin: 275, collateralSummary: 'Equipment', createdOn: '2026-07-01T00:00:00Z', stageEntryDate: '2026-07-08T00:00:00Z', isClosed: false,
};

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

describe('buildLiveStageAdvanceDeps — transport.readbackDealStage (WFLOW-B persistence proof)', () => {
  it('confirms the move when the re-read stage-reference value + entry date match the target', async () => {
    // First getAll resolves the target stage code → id; then the deal is re-read.
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref-uw', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
    });
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_stagereference_value: 'ref-uw', cr664_stageentrydate: '2026-07-02T00:00:00Z' },
    });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.readbackDealStage({ dealId: 'deal-1', expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-07-02T00:00:00Z' });

    expect(res).toEqual({ ok: true, matched: true });
    expect(loandealsGet).toHaveBeenCalledWith('deal-1', expect.objectContaining({
      select: ['_cr664_stagereference_value', 'cr664_stageentrydate'],
    }));
  });

  it('reports matched:false when the persisted stage-reference value does NOT match the target', async () => {
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref-uw', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
    });
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_stagereference_value: 'ref-STILL-INTAKE', cr664_stageentrydate: '2026-07-02T00:00:00Z' },
    });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.readbackDealStage({ dealId: 'deal-1', expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-07-02T00:00:00Z' });

    expect(res.ok).toBe(true);
    expect(res.matched).toBe(false);
    expect(res.detail).toMatch(/did not (match|persist)/i);
  });

  it('reports matched:false when the stage matches but cr664_stageentrydate is missing', async () => {
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref-uw', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
    });
    loandealsGet.mockResolvedValueOnce({
      success: true,
      data: { _cr664_stagereference_value: 'ref-uw', cr664_stageentrydate: null },
    });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.readbackDealStage({ dealId: 'deal-1', expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-07-02T00:00:00Z' });

    expect(res.ok).toBe(true);
    expect(res.matched).toBe(false);
    expect(res.detail).toMatch(/stageentrydate/i);
  });

  it('reports ok:false (unavailable) when the deal re-read itself fails', async () => {
    stageGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ cr664_dealstagereferenceid: 'ref-uw', cr664_code: 'UNDERWRITING', cr664_activeflag: true }],
    });
    loandealsGet.mockResolvedValueOnce({ success: false, error: { message: 'read timeout' } });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.readbackDealStage({ dealId: 'deal-1', expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-07-02T00:00:00Z' });

    expect(res.ok).toBe(false);
    expect(res.matched).toBe(false);
  });

  it('reports ok:false when the target stage reference row cannot be resolved (table not seeded)', async () => {
    stageGetAll.mockResolvedValueOnce({ success: true, data: [] });
    const { transport } = buildLiveStageAdvanceDeps(actor);

    const res = await transport.readbackDealStage({ dealId: 'deal-1', expectedStageId: 'UNDERWRITING', expectedEntryDateIso: '2026-07-02T00:00:00Z' });

    expect(res.ok).toBe(false);
    expect(res.matched).toBe(false);
    expect(loandealsGet).not.toHaveBeenCalled();
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
  it('emits a StageChanged timeline event whose cr664_EventBy is the resolved cr664_user (never a systemuser)', async () => {
    resolveActor.mockResolvedValueOnce({ ok: true, changedByBind: '/cr664_users(u-1)' });
    timelineCreate.mockResolvedValueOnce({ success: true });
    const { timelineSink } = buildLiveStageAdvanceDeps(actor);

    const res = await timelineSink.write({ correlationId: 'c1', dealId: 'deal-1', toStageId: 'UNDERWRITING' });

    expect(res.ok).toBe(true);
    const payload = timelineCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.cr664_eventtype).toBe(788190006); // StageChanged
    expect(payload.cr664_visibilityscope).toBe(788190000); // BankerAndManager
    expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    // BUGFIX: cr664_EventBy targets cr664_user (like cr664_ChangedBy) — bind the
    // resolved cr664_user, never /systemusers(<actorSystemUserId>).
    expect(payload['cr664_EventBy@odata.bind']).toBe('/cr664_users(u-1)');
    // No systemuser id (and no server-defaulted owner/state) is ever emitted.
    expect(JSON.stringify(payload)).not.toMatch(/systemusers/);
    expect('ownerid' in payload).toBe(false);
  });

  it('omits cr664_EventBy (no faked identity) when the actor cr664_user cannot be resolved', async () => {
    resolveActor.mockResolvedValueOnce({ ok: false, reason: 'no cr664_user identity' });
    timelineCreate.mockResolvedValueOnce({ success: true });
    const { timelineSink } = buildLiveStageAdvanceDeps(actor);

    const res = await timelineSink.write({ correlationId: 'c1', dealId: 'deal-1', toStageId: 'UNDERWRITING' });

    expect(res.ok).toBe(true);
    const payload = timelineCreate.mock.calls[0][0] as Record<string, unknown>;
    expect('cr664_EventBy@odata.bind' in payload).toBe(false);
  });
});

describe('buildLiveStageAdvanceDeps — onDealBoarded (reuses the already-live Phase 259 write path)', () => {
  it('maps the deal, boards it through boardExistingLoan/buildLiveExistingLoanDeps, and reports success', async () => {
    const mappedInput = { loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true };
    mapDealToExistingLoanInput.mockReturnValue(mappedInput);
    boardExistingLoan.mockResolvedValue({ kind: 'success', loanId: 'row-1', loanNumber: 'deal-1', correlationId: 'c1', childCreated: 0, childErrors: [], auditId: 'a1' });
    const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

    const result = await onDealBoarded.run(testDeal);

    expect(mapDealToExistingLoanInput).toHaveBeenCalledWith({
      deal: testDeal,
      authorized: true,
      actorEmail: actor.actorEmail,
      actorSystemUserId: actor.actorSystemUserId,
    });
    expect(boardExistingLoan).toHaveBeenCalledWith(mappedInput, {});
    expect(result).toEqual({
      kind: 'complete',
      ok: true,
      loanId: 'row-1',
      detail: 'Boarded as portfolio loan deal-1; audit and timeline evidence were recorded.',
    });
  });

  it('reports a duplicate loan (already boarded) as ok — not an error', async () => {
    mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
    boardExistingLoan.mockResolvedValue({ kind: 'duplicate', reason: 'exists', loanNumber: 'deal-1', existingLoanId: 'row-existing' });
    const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

    const result = await onDealBoarded.run(testDeal);

    expect(result).toEqual({
      kind: 'already-boarded',
      ok: true,
      loanId: 'row-existing',
      detail: 'Already boarded (loan number deal-1 exists); no new portfolio loan was created.',
    });
  });

  it('reports a write failure honestly, never a fake success', async () => {
    mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
    boardExistingLoan.mockResolvedValue({ kind: 'write-failed', error: 'field rejected', correlationId: 'c1' });
    const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

    const result = await onDealBoarded.run(testDeal);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('field rejected');
  });

  it('skips auto-boarding honestly when the deal cannot be mapped (e.g. no borrower name) — never fabricates', async () => {
    mapDealToExistingLoanInput.mockReturnValue(null);
    const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

    const result = await onDealBoarded.run(testDeal);

    expect(result.ok).toBe(false);
    expect(boardExistingLoan).not.toHaveBeenCalled();
  });

  describe('Workstream K: boarded-loan-created timeline event', () => {
    it('emits a dedicated boarded:created timeline event on the deal after a successful board', async () => {
      mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
      boardExistingLoan.mockResolvedValue({ kind: 'success', loanId: 'row-1', loanNumber: 'deal-1', correlationId: 'c1', childCreated: 0, childErrors: [], auditId: 'a1' });
      resolveActor.mockResolvedValue({ ok: true, changedByBind: '/cr664_users(core-1)' });
      timelineCreate.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } });
      const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

      const result = await onDealBoarded.run(testDeal);

      expect(result).toEqual({
        kind: 'complete',
        ok: true,
        loanId: 'row-1',
        detail: 'Boarded as portfolio loan deal-1; audit and timeline evidence were recorded.',
      });
      expect(timelineCreate).toHaveBeenCalledTimes(1);
      const payload = timelineCreate.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
      expect(payload.cr664_eventsubtype).toBe('boarded:created|correlation:c1');
      expect(payload['cr664_EventBy@odata.bind']).toBe('/cr664_users(core-1)');
    });

    it('preserves the boarded loan and reports partial evidence when the timeline emission throws', async () => {
      mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
      boardExistingLoan.mockResolvedValue({ kind: 'success', loanId: 'row-1', loanNumber: 'deal-1', correlationId: 'c1', childCreated: 0, childErrors: [], auditId: 'a1' });
      resolveActor.mockResolvedValue({ ok: true, changedByBind: '/cr664_users(core-1)' });
      timelineCreate.mockRejectedValue(new Error('timeline down'));
      const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

      const result = await onDealBoarded.run(testDeal);

      expect(result).toEqual({
        kind: 'partial-evidence',
        ok: false,
        loanId: 'row-1',
        detail: 'Boarded as portfolio loan deal-1, but timeline evidence could not be recorded. The boarded loan was preserved; an operator must reconcile the missing evidence.',
      });
    });

    it('preserves the boarded loan and reports partial evidence when timeline create returns non-success', async () => {
      mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
      boardExistingLoan.mockResolvedValue({ kind: 'success', loanId: 'row-1', loanNumber: 'deal-1', correlationId: 'c1', childCreated: 0, childErrors: [], auditId: 'a1' });
      resolveActor.mockResolvedValue({ ok: true, changedByBind: '/cr664_users(core-1)' });
      timelineCreate.mockResolvedValue({ success: false, error: { message: 'transport detail must not leak' } });
      const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

      const result = await onDealBoarded.run(testDeal);

      expect(result.kind).toBe('partial-evidence');
      expect(result.detail).not.toContain('transport detail');
    });

    it('does not emit a timeline event for a duplicate (already-boarded) outcome', async () => {
      mapDealToExistingLoanInput.mockReturnValue({ loanNumber: 'deal-1', borrowerLegalName: 'Acme LLC', authorized: true });
      boardExistingLoan.mockResolvedValue({ kind: 'duplicate', reason: 'exists', loanNumber: 'deal-1', existingLoanId: 'row-existing' });
      const { onDealBoarded } = buildLiveStageAdvanceDeps(actor);

      await onDealBoarded.run(testDeal);

      expect(timelineCreate).not.toHaveBeenCalled();
    });
  });
});

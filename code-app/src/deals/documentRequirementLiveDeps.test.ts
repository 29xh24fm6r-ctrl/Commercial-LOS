import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: vi.fn(), create: vi.fn(), update: vi.fn() },
}));
vi.mock('../generated/services/Cr664_auditeventsService', () => ({
  Cr664_auditeventsService: { create: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtimelineeventsService', () => ({
  Cr664_dealtimelineeventsService: { create: vi.fn() },
}));
vi.mock('./newDealAuditActorResolver', () => ({
  createActorChangedByResolver: vi.fn(),
}));

import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { createActorChangedByResolver } from './newDealAuditActorResolver';
import { buildLiveDocumentRequirementActionDeps } from './documentRequirementLiveDeps';

const getAllMock = vi.mocked(Cr664_documentchecklistsService.getAll);
const createMock = vi.mocked(Cr664_documentchecklistsService.create);
const updateMock = vi.mocked(Cr664_documentchecklistsService.update);
const auditCreateMock = vi.mocked(Cr664_auditeventsService.create);
const timelineCreateMock = vi.mocked(Cr664_dealtimelineeventsService.create);
const resolverFactoryMock = vi.mocked(createActorChangedByResolver);

const resolvedActor = { ok: true, changedByBind: '/cr664_users(u-1)' };

beforeEach(() => {
  getAllMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
  resolverFactoryMock.mockReset().mockReturnValue(vi.fn().mockResolvedValue(resolvedActor));
});

describe('buildLiveDocumentRequirementActionDeps', () => {
  describe('findRowByName', () => {
    it('matches a row by normalized document name, case/whitespace insensitive', async () => {
      getAllMock.mockResolvedValue({
        success: true,
        data: [{ cr664_documentchecklistid: 'row-1', cr664_documentname: '  Business Financial Statements ', cr664_acknowledged: true }],
      } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.findRowByName('deal-1', 'business financial statements');
      expect(result).toEqual({ ok: true, row: { id: 'row-1', acknowledged: true } });
      expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: expect.stringContaining('deal-1') }));
    });

    it('returns row: undefined when no row matches', async () => {
      getAllMock.mockResolvedValue({ success: true, data: [] } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.findRowByName('deal-1', 'Loan Application');
      expect(result).toEqual({ ok: true, row: undefined });
    });

    it('reports a non-success read honestly', async () => {
      getAllMock.mockResolvedValue({ success: false, error: { message: 'boom' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.findRowByName('deal-1', 'Loan Application');
      expect(result).toEqual({ ok: false, error: 'boom' });
    });
  });

  describe('createRow', () => {
    it('creates a row with the deal bind + document name + supplied fields', async () => {
      createMock.mockResolvedValue({ success: true, data: { cr664_documentchecklistid: 'row-new' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.createRow({
        dealId: 'deal-1',
        documentName: 'Loan Application',
        fields: { cr664_requirementstatus: 788190101 },
      });
      expect(result).toEqual({ ok: true, id: 'row-new' });
      const payload = createMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_documentname).toBe('Loan Application');
      expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
      expect(payload.cr664_requirementstatus).toBe(788190101);
    });

    it('reports a non-success create honestly', async () => {
      createMock.mockResolvedValue({ success: false, error: { message: 'rejected' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.createRow({ dealId: 'deal-1', documentName: 'Loan Application', fields: {} });
      expect(result).toEqual({ ok: false, error: 'rejected' });
    });
  });

  describe('updateRow', () => {
    it('updates the row by id with the supplied fields', async () => {
      updateMock.mockResolvedValue({ success: true } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.updateRow('row-1', { cr664_requestdate: '2026-07-15T00:00:00Z' });
      expect(result).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith('row-1', expect.objectContaining({ cr664_requestdate: '2026-07-15T00:00:00Z' }));
    });

    it('catches a thrown error', async () => {
      updateMock.mockRejectedValue(new Error('network down'));
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.updateRow('row-1', {});
      expect(result).toEqual({ ok: false, error: 'network down' });
    });
  });

  describe('emitAudit', () => {
    it('fails closed without writing when the actor cannot resolve', async () => {
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.emitAudit({
        action: 'acknowledge', dealId: 'deal-1', documentId: 'row-1', documentName: 'Loan Application',
        fromStatus: 'not_assessed', toStatus: 'outstanding', waiverReason: undefined,
        correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: { ok: false, reason: 'no match' },
      });
      expect(result.ok).toBe(false);
      expect(auditCreateMock).not.toHaveBeenCalled();
    });

    it('writes an audit bound to /cr664_users(...) recording the from/to status', async () => {
      auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.emitAudit({
        action: 'waive', dealId: 'deal-1', documentId: 'row-1', documentName: 'Loan Application',
        fromStatus: 'outstanding', toStatus: 'waived', waiverReason: 'Immaterial exposure',
        correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: resolvedActor,
      });
      expect(result.ok).toBe(true);
      const payload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
      expect(payload.cr664_oldvalue).toBe('outstanding');
      expect(payload.cr664_newvalue).toBe('waived');
      expect(payload.cr664_notes).toBe('Immaterial exposure');
    });
  });

  describe('emitTimeline', () => {
    it('emits a DocumentRequested timeline event for the request action', async () => {
      timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      const result = await deps.emitTimeline({
        action: 'request', dealId: 'deal-1', documentId: 'row-1', documentName: 'Loan Application',
        toStatus: 'requested', correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: resolvedActor,
      });
      expect(result).toEqual({ ok: true });
      const payload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_eventtype).toBe(788190009);
      expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    });

    it('omits the EventBy bind when the actor is unresolved — never fakes identity', async () => {
      timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } } as never);
      const deps = buildLiveDocumentRequirementActionDeps();
      await deps.emitTimeline({
        action: 'acknowledge', dealId: 'deal-1', documentId: 'row-1', documentName: 'Loan Application',
        toStatus: 'outstanding', correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: { ok: false, reason: 'no match' },
      });
      const payload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
      expect('cr664_EventBy@odata.bind' in payload).toBe(false);
    });
  });
});

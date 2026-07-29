import { describe, it, expect, vi, beforeEach } from 'vitest';

const uploadFileToRecordMock = vi.fn();
const downloadFileFromRecordMock = vi.fn();
vi.mock('@microsoft/power-apps/data', () => ({
  getClient: vi.fn(() => ({
    uploadFileToRecord: uploadFileToRecordMock,
    downloadFileFromRecord: downloadFileFromRecordMock,
  })),
}));
vi.mock('../../.power/schemas/appschemas/dataSourcesInfo', () => ({ dataSourcesInfo: {} }));

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { update: vi.fn(), get: vi.fn() },
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
import { buildLiveDocumentUploadDeps } from './documentUploadLiveDeps';

const updateMock = vi.mocked(Cr664_documentchecklistsService.update);
const getMock = vi.mocked(Cr664_documentchecklistsService.get);
const auditCreateMock = vi.mocked(Cr664_auditeventsService.create);
const timelineCreateMock = vi.mocked(Cr664_dealtimelineeventsService.create);
const resolverFactoryMock = vi.mocked(createActorChangedByResolver);

const resolvedActor = { ok: true, changedByBind: '/cr664_users(u-1)' };

beforeEach(() => {
  uploadFileToRecordMock.mockReset();
  downloadFileFromRecordMock.mockReset();
  updateMock.mockReset();
  getMock.mockReset();
  auditCreateMock.mockReset();
  timelineCreateMock.mockReset();
  resolverFactoryMock.mockReset().mockReturnValue(vi.fn().mockResolvedValue(resolvedActor));
});

describe('buildLiveDocumentUploadDeps', () => {
  describe('uploadFile', () => {
    it('calls the SDK client uploadFileToRecord against cr664_documentchecklists/cr664_documentfile', async () => {
      uploadFileToRecordMock.mockResolvedValue({ success: true });
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.uploadFile({ documentId: 'doc-1', fileName: 'tax.pdf', content: new Uint8Array([1]) });
      expect(result).toEqual({ ok: true });
      expect(uploadFileToRecordMock).toHaveBeenCalledWith('cr664_documentchecklists', 'doc-1', 'cr664_documentfile', 'tax.pdf', expect.any(Uint8Array));
    });

    it('reports a non-success upload honestly', async () => {
      uploadFileToRecordMock.mockResolvedValue({ success: false, error: { message: 'File too large' } });
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.uploadFile({ documentId: 'doc-1', fileName: 'tax.pdf', content: new Uint8Array([1]) });
      expect(result).toEqual({ ok: false, error: 'File too large' });
    });

    it('catches a thrown error', async () => {
      uploadFileToRecordMock.mockRejectedValue(new Error('network down'));
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.uploadFile({ documentId: 'doc-1', fileName: 'tax.pdf', content: new Uint8Array([1]) });
      expect(result).toEqual({ ok: false, error: 'network down' });
    });
  });

  describe('updateMetadata', () => {
    it('sets the metadata fields, uploadstatus, and receiveddate, binding UploadedBy only when present', async () => {
      updateMock.mockResolvedValue({ success: true } as never);
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.updateMetadata({
        documentId: 'doc-1',
        originalFileName: 'tax.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 100,
        uploadedOnIso: '2026-07-15T00:00:00Z',
        uploadedByBind: '/cr664_users(u-1)',
        nowIso: '2026-07-15T00:00:00Z',
      });
      expect(result).toEqual({ ok: true });
      const payload = updateMock.mock.calls[0]![1] as Record<string, unknown>;
      expect(payload.cr664_uploadstatus).toBe(true);
      expect(payload.cr664_receiveddate).toBe('2026-07-15T00:00:00Z');
      expect(payload['cr664_UploadedBy@odata.bind']).toBe('/cr664_users(u-1)');
    });

    it('omits the UploadedBy bind when unresolved — never fakes identity', async () => {
      updateMock.mockResolvedValue({ success: true } as never);
      const deps = buildLiveDocumentUploadDeps();
      await deps.updateMetadata({
        documentId: 'doc-1',
        originalFileName: 'tax.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 100,
        uploadedOnIso: '2026-07-15T00:00:00Z',
        uploadedByBind: undefined,
        nowIso: '2026-07-15T00:00:00Z',
      });
      const payload = updateMock.mock.calls[0]![1] as Record<string, unknown>;
      expect('cr664_UploadedBy@odata.bind' in payload).toBe(false);
    });
  });

  describe('readback', () => {
    it('downloads the actual File-column bytes', async () => {
      downloadFileFromRecordMock.mockResolvedValue({
        success: true,
        data: new Uint8Array([1, 2, 3]),
      });
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.readbackBytes('doc-1');
      expect(result).toEqual({
        ok: true,
        content: new Uint8Array([1, 2, 3]),
      });
      expect(downloadFileFromRecordMock).toHaveBeenCalledWith(
        'cr664_documentchecklists',
        'doc-1',
        'cr664_documentfile',
      );
    });

    it('reports a failed File-column byte download honestly', async () => {
      downloadFileFromRecordMock.mockResolvedValue({
        success: false,
        error: { message: 'read denied' },
      });
      const deps = buildLiveDocumentUploadDeps();
      expect(await deps.readbackBytes('doc-1')).toEqual({
        ok: false,
        error: 'read denied',
      });
    });

    it('reads back cr664_originalfilename', async () => {
      getMock.mockResolvedValue({ success: true, data: { cr664_originalfilename: 'tax.pdf' } } as never);
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.readbackMetadata('doc-1');
      expect(result).toEqual({ ok: true, originalFileName: 'tax.pdf' });
    });

    it('reports unavailable on a non-success read', async () => {
      getMock.mockResolvedValue({ success: false } as never);
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.readbackMetadata('doc-1');
      expect(result).toEqual({ ok: false });
    });
  });

  describe('emitAudit', () => {
    it('fails closed without writing when the actor cannot resolve', async () => {
      resolverFactoryMock.mockReturnValue(vi.fn().mockResolvedValue({ ok: false, reason: 'no match' }));
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.emitAudit({
        documentId: 'doc-1', dealId: 'deal-1', outcome: 788190000, failureReason: undefined,
        correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: { ok: false, reason: 'no match' },
      });
      expect(result.ok).toBe(false);
      expect(auditCreateMock).not.toHaveBeenCalled();
    });

    it('writes an audit bound to /cr664_users(...) on success', async () => {
      auditCreateMock.mockResolvedValue({ success: true, data: { cr664_auditeventid: 'a-1' } } as never);
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.emitAudit({
        documentId: 'doc-1', dealId: 'deal-1', outcome: 788190000, failureReason: undefined,
        correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: resolvedActor,
      });
      expect(result.ok).toBe(true);
      const payload = auditCreateMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload['cr664_ChangedBy@odata.bind']).toBe('/cr664_users(u-1)');
    });
  });

  describe('emitTimeline', () => {
    it('emits a DocumentUploaded timeline event', async () => {
      timelineCreateMock.mockResolvedValue({ success: true, data: { cr664_dealtimelineeventid: 't-1' } } as never);
      const deps = buildLiveDocumentUploadDeps();
      const result = await deps.emitTimeline({
        documentId: 'doc-1', dealId: 'deal-1', documentName: 'Tax Returns', fileName: 'tax.pdf',
        correlationId: 'c1', nowIso: '2026-07-15T00:00:00Z', actor: resolvedActor,
      });
      expect(result).toEqual({ ok: true });
      const payload = timelineCreateMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.cr664_eventtype).toBe(788190010);
      expect(payload['cr664_Deal@odata.bind']).toBe('/cr664_loandeals(deal-1)');
    });
  });
});

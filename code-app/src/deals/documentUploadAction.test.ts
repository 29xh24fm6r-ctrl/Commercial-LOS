import { describe, it, expect, vi } from 'vitest';
import { uploadDocumentFile, MAX_UPLOAD_BYTES, type DocumentUploadDeps } from './documentUploadAction';
import type { ActorChangedByResolution } from './newDealAuditActorResolver';
import { AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';

const resolvedActor: ActorChangedByResolution = { ok: true, changedByBind: '/cr664_users(u-1)' };
const unresolvedActor: ActorChangedByResolution = { ok: false, reason: 'no match' };

function baseInput(overrides: Partial<Parameters<typeof uploadDocumentFile>[0]> = {}) {
  return {
    documentId: 'doc-1',
    documentName: 'Tax Returns',
    dealId: 'deal-1',
    actorEmail: 'banker@oldglorybank.com',
    fileName: 'tax-returns.pdf',
    mimeType: 'application/pdf',
    content: new Uint8Array([1, 2, 3]),
    enabledOverride: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DocumentUploadDeps> = {}): DocumentUploadDeps {
  return {
    uploadFile: vi.fn().mockResolvedValue({ ok: true }),
    updateMetadata: vi.fn().mockResolvedValue({ ok: true }),
    readback: vi.fn().mockResolvedValue({ ok: true, originalFileName: 'tax-returns.pdf' }),
    resolveActorChangedBy: vi.fn().mockResolvedValue(resolvedActor),
    emitAudit: vi.fn().mockResolvedValue({ ok: true }),
    emitTimeline: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe('uploadDocumentFile', () => {
  it('fails closed with dependency_not_ready when DOCUMENT_FILE_UPLOAD_ENABLED is off (the real default), using banker-safe copy that never names the internal flag', async () => {
    const deps = makeDeps();
    const outcome = await uploadDocumentFile(baseInput({ enabledOverride: false }), deps);
    expect(outcome).toEqual({ kind: 'dependency_not_ready', detail: 'Document file upload is not yet enabled in this environment.' });
    expect((outcome as { detail: string }).detail).not.toMatch(/DOCUMENT_FILE_UPLOAD_ENABLED/);
    expect(deps.uploadFile).not.toHaveBeenCalled();
  });

  it('fails closed with dependency_not_ready when no deps are injected, even if enabled', async () => {
    const outcome = await uploadDocumentFile(baseInput());
    expect(outcome).toEqual({ kind: 'dependency_not_ready', detail: 'No live upload dependency injected.' });
  });

  describe('input validation (never reaches the transport on invalid input)', () => {
    it('rejects an empty file name', async () => {
      const deps = makeDeps();
      const outcome = await uploadDocumentFile(baseInput({ fileName: '' }), deps);
      expect(outcome.kind).toBe('invalid-input');
      expect(deps.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type', async () => {
      const deps = makeDeps();
      const outcome = await uploadDocumentFile(baseInput({ mimeType: 'application/zip' }), deps);
      expect(outcome.kind).toBe('invalid-input');
      if (outcome.kind === 'invalid-input') expect(outcome.reason).toMatch(/not an accepted file type/i);
      expect(deps.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      const deps = makeDeps();
      const outcome = await uploadDocumentFile(baseInput({ content: new Uint8Array() }), deps);
      expect(outcome.kind).toBe('invalid-input');
      if (outcome.kind === 'invalid-input') expect(outcome.reason).toMatch(/empty/i);
    });

    it('rejects a file over the size limit', async () => {
      const deps = makeDeps();
      const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
      const outcome = await uploadDocumentFile(baseInput({ content: oversized }), deps);
      expect(outcome.kind).toBe('invalid-input');
      if (outcome.kind === 'invalid-input') expect(outcome.reason).toMatch(/larger than the 25 MB limit/i);
      expect(deps.uploadFile).not.toHaveBeenCalled();
    });

    it('accepts a file exactly at the size limit', async () => {
      const deps = makeDeps();
      const atLimit = new Uint8Array(MAX_UPLOAD_BYTES);
      const outcome = await uploadDocumentFile(baseInput({ content: atLimit }), deps);
      expect(outcome.kind).toBe('success');
    });
  });

  it('a successful upload writes metadata, reads back, and emits audit + timeline', async () => {
    const deps = makeDeps();
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'success' });
    expect(deps.uploadFile).toHaveBeenCalledWith({ documentId: 'doc-1', fileName: 'tax-returns.pdf', content: expect.any(Uint8Array) });
    expect(deps.updateMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        originalFileName: 'tax-returns.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 3,
        uploadedByBind: '/cr664_users(u-1)',
      }),
    );
    expect(deps.readback).toHaveBeenCalledWith('doc-1');
    expect(deps.emitAudit).toHaveBeenCalled();
    expect(deps.emitTimeline).toHaveBeenCalled();
  });

  it('omits uploadedByBind (never fakes identity) when the actor cannot be resolved', async () => {
    const deps = makeDeps({ resolveActorChangedBy: vi.fn().mockResolvedValue(unresolvedActor) });
    await uploadDocumentFile(baseInput(), deps);
    expect(deps.updateMetadata).toHaveBeenCalledWith(expect.objectContaining({ uploadedByBind: undefined }));
  });

  it('reports upload-failed and never touches metadata when the binary upload itself fails', async () => {
    const deps = makeDeps({ uploadFile: vi.fn().mockResolvedValue({ ok: false, error: 'File column rejected the payload' }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'upload-failed', error: 'File column rejected the payload' });
    expect(deps.updateMetadata).not.toHaveBeenCalled();
    expect(deps.emitAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: AUDIT_OUTCOME_FAILED, failureReason: 'File column rejected the payload' }));
  });

  it('reports upload-failed when the file uploads but the metadata update fails (never claims uploadstatus=true silently)', async () => {
    const deps = makeDeps({ updateMetadata: vi.fn().mockResolvedValue({ ok: false, error: 'update rejected' }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'upload-failed', error: 'update rejected' });
    expect(deps.readback).not.toHaveBeenCalled();
  });

  it('reports readback-mismatch when the readback filename does not match what was uploaded', async () => {
    const deps = makeDeps({ readback: vi.fn().mockResolvedValue({ ok: true, originalFileName: 'wrong-name.pdf' }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome.kind).toBe('readback-mismatch');
    expect(deps.emitAudit).not.toHaveBeenCalled();
  });

  it('reports readback-mismatch when the readback itself is unavailable', async () => {
    const deps = makeDeps({ readback: vi.fn().mockResolvedValue({ ok: false }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome.kind).toBe('readback-mismatch');
    if (outcome.kind === 'readback-mismatch') expect(outcome.detail).toMatch(/unavailable/i);
  });

  it('reports governance-partial when the audit write fails after a verified upload', async () => {
    const deps = makeDeps({ emitAudit: vi.fn().mockResolvedValue({ ok: false, error: 'audit rejected' }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'governance-partial', auditError: 'audit rejected', timelineError: undefined });
  });

  it('reports governance-partial when the timeline write fails after a verified upload', async () => {
    const deps = makeDeps({ emitTimeline: vi.fn().mockResolvedValue({ ok: false, error: 'timeline rejected' }) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'governance-partial', auditError: undefined, timelineError: 'timeline rejected' });
  });

  it('catches a thrown error from uploadFile and reports it as upload-failed, never crashing', async () => {
    const deps = makeDeps({ uploadFile: vi.fn().mockRejectedValue(new Error('network down')) });
    const outcome = await uploadDocumentFile(baseInput(), deps);
    expect(outcome).toEqual({ kind: 'upload-failed', error: 'network down' });
  });
});

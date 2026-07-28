import { describe, it, expect } from 'vitest';
import {
  deriveDocumentUploadSchemaGate,
  uploadDocument,
  deriveDocumentUploadActivation,
  DOCUMENT_UPLOAD_ENABLED,
  type DocumentUploadInput,
} from './documentUploadActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

function ev(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}

describe('Phase 223 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â document upload schema gate', () => {
  it('blocks with remediation when File column / upload method missing', () => {
    const g = deriveDocumentUploadSchemaGate({ fileColumnPresent: false, uploadMethodAvailable: false });
    expect(g.uploadTargetReady).toBe(false);
    expect(g.remediation.join(' ')).toMatch(/File column/i);
  });
  it('ready when both present', () => {
    expect(deriveDocumentUploadSchemaGate({ fileColumnPresent: true, uploadMethodAvailable: true }).uploadTargetReady).toBe(true);
  });
});

function up(over: Partial<DocumentUploadInput> = {}): DocumentUploadInput {
  return {
    actorAuthorized: true, uploadTargetReady: true, correlationId: 'c1', targetItemId: 't1', targetItemExists: true,
    file: { name: 'doc.pdf', sizeBytes: 1000, contentType: 'application/pdf' },
    allowedContentTypes: ['application/pdf'], maxSizeBytes: 5000,
    transport: { upload: async () => ({ ok: true, fileId: 'f1' }), markReceived: async () => ({ ok: true }) },
    auditSink: { write: async () => ({ ok: true }) },
    ...over,
  };
}

describe('Phase 228B â€” governed upload adapter enabled with fail-closed controls', () => {
  it('is enabled by default but still blocks when target or transport is not ready', async () => {
    expect(DOCUMENT_UPLOAD_ENABLED).toBe(true);
    expect((await uploadDocument(up())).outcome).toBe('uploaded');
    expect((await uploadDocument(up({ enabled: true, transport: undefined }))).outcome).toBe('disabled');
    expect((await uploadDocument(up({ enabled: true, uploadTargetReady: false }))).outcome).toBe('disabled');
  });
  it('unauthorized / missing_file / invalid_file_type / file_too_large / target_not_found', async () => {
    expect((await uploadDocument(up({ enabled: true, actorAuthorized: false }))).outcome).toBe('unauthorized');
    expect((await uploadDocument(up({ enabled: true, file: null }))).outcome).toBe('missing_file');
    expect((await uploadDocument(up({ enabled: true, file: { name: 'x.exe', sizeBytes: 10, contentType: 'application/x-msdownload' } }))).outcome).toBe('invalid_file_type');
    expect((await uploadDocument(up({ enabled: true, file: { name: 'big.pdf', sizeBytes: 99999, contentType: 'application/pdf' } }))).outcome).toBe('file_too_large');
    expect((await uploadDocument(up({ enabled: true, targetItemExists: false }))).outcome).toBe('target_not_found');
  });
  it('upload_failed surfaces transport failure and never marks received', async () => {
    const out = await uploadDocument(up({ enabled: true, transport: { upload: async () => ({ ok: false, error: 'boom' }), markReceived: async () => ({ ok: true }) } }));
    expect(out.outcome).toBe('upload_failed');
    expect(out.markedReceived).toBe(false);
  });
  it('metadata_failed_partial_success: uploaded but NOT marked received', async () => {
    const out = await uploadDocument(up({ enabled: true, transport: { upload: async () => ({ ok: true, fileId: 'f1' }), markReceived: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('metadata_failed_partial_success');
    expect(out.markedReceived).toBe(false);
    expect(out.fileId).toBe('f1');
  });
  it('audit_failed_partial_success after upload + mark received', async () => {
    const out = await uploadDocument(up({ enabled: true, auditSink: { write: async () => ({ ok: false }) } }));
    expect(out.outcome).toBe('audit_failed_partial_success');
    expect(out.markedReceived).toBe(true);
  });
  it('uploaded on the happy path', async () => {
    const out = await uploadDocument(up({ enabled: true }));
    expect(out.outcome).toBe('uploaded');
    expect(out.markedReceived).toBe(true);
  });
  it('activation readiness blocked by default', () => {
    expect(deriveDocumentUploadActivation({ schema: { fileColumnPresent: false, uploadMethodAvailable: false }, actorAuthorized: false, auditWired: false, evidence: ev() }).level).toBe('blocked');
  });
});

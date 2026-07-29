import { describe, expect, it, vi } from 'vitest';
import {
  downloadDocumentFile,
  sha256Hex,
  type DocumentDownloadDeps,
} from './documentDownloadAction';

const input = {
  documentId: 'doc-1',
  dealId: 'deal-1',
  fileName: 'tax.pdf',
  mimeType: 'application/pdf',
  actorEmail: 'banker@oldglorybank.com',
};

const deps = (
  overrides: Partial<DocumentDownloadDeps> = {},
): DocumentDownloadDeps => ({
  resolveActorChangedBy: vi.fn().mockResolvedValue({
    ok: true,
    changedByBind: '/cr664_users(user-1)',
  }),
  downloadBytes: vi.fn().mockResolvedValue({
    ok: true,
    content: new Uint8Array([1, 2, 3]),
  }),
  emitAudit: vi.fn().mockResolvedValue({ ok: true }),
  ...overrides,
});

describe('downloadDocumentFile', () => {
  it('downloads bytes, computes SHA-256, and audits before releasing content', async () => {
    const d = deps();
    const result = await downloadDocumentFile(input, d);
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.content).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.sha256).toBe(await sha256Hex(new Uint8Array([1, 2, 3])));
    expect(d.emitAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        byteLength: 3,
        sha256: result.sha256,
      }),
    );
  });

  it('fails closed before byte access when actor identity is unresolved', async () => {
    const d = deps({
      resolveActorChangedBy: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'no match' }),
    });
    expect(await downloadDocumentFile(input, d)).toEqual({
      kind: 'identity-unresolved',
      reason: 'no match',
    });
    expect(d.downloadBytes).not.toHaveBeenCalled();
  });

  it('does not release bytes when the access audit fails', async () => {
    const result = await downloadDocumentFile(
      input,
      deps({ emitAudit: vi.fn().mockResolvedValue({ ok: false, error: 'denied' }) }),
    );
    expect(result).toEqual({ kind: 'audit-failed', error: 'denied' });
  });

  it('reports a missing or unauthorized File-column read honestly', async () => {
    const result = await downloadDocumentFile(
      input,
      deps({
        downloadBytes: vi
          .fn()
          .mockResolvedValue({ ok: false, error: 'read denied' }),
      }),
    );
    expect(result).toEqual({ kind: 'download-failed', error: 'read denied' });
  });
});

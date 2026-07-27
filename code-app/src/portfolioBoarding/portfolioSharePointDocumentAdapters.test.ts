import { describe, it, expect, vi } from 'vitest';
import {
  dryRunSharePointDocumentAdapter,
  notYetRegisteredSharePointDocumentAdapter,
  createLiveSharePointDocumentAdapter,
  getSharePointDocumentAdapter,
  MAX_UPLOAD_BYTES,
  type PortfolioSharePointConnectorPort,
} from './portfolioSharePointDocumentAdapters';
import type { SharePointDocumentUploadInput } from './portfolioSharePointDocumentPort';
import { DEFAULT_LIBRARY_ROOT_PATH } from './portfolioSharePointDocumentSchemaPlan';

function input(overrides: Partial<SharePointDocumentUploadInput> = {}): SharePointDocumentUploadInput {
  return {
    loanNumber: 'LN-1001',
    borrowerLegalName: 'Acme LLC',
    documentType: 'note',
    fileName: 'promissory-note.pdf',
    contentType: 'application/pdf',
    content: new Uint8Array([1, 2, 3]),
    correlationId: 'corr-1',
    ...overrides,
  };
}

/** A stand-in file with only a byteLength — lets size-boundary tests avoid allocating ~100 MB.
 *  The adapter reads `content.byteLength` for validation and never scans the bytes. */
function sizedContent(byteLength: number): Uint8Array {
  return { byteLength } as unknown as Uint8Array;
}

describe('Phase 264 (P0) — dryRunSharePointDocumentAdapter', () => {
  it('validates real input and returns uploaded with NO fake link', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input());
    expect(result).toEqual({ kind: 'uploaded', webUrl: undefined, itemId: undefined, mode: 'DRY_RUN' });
  });

  it('rejects an empty file', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input({ content: new Uint8Array([]) }));
    expect(result.kind).toBe('invalid-input');
  });

  it('rejects a file over the size limit', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(
      input({ content: sizedContent(MAX_UPLOAD_BYTES + 1) }),
    );
    expect(result.kind).toBe('invalid-input');
  });

  it('accepts a file at EXACTLY the 100 MB limit (the boundary is inclusive; only larger fails)', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input({ content: sizedContent(MAX_UPLOAD_BYTES) }));
    expect(result.kind).toBe('uploaded');
  });

  it('rejects a missing loan number', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input({ loanNumber: '' }));
    expect(result.kind).toBe('invalid-input');
  });

  it('rejects a blank file name', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input({ fileName: '   ' }));
    expect(result.kind).toBe('invalid-input');
  });

  it('list never fabricates entries — always empty (there is no real storage in DRY_RUN)', async () => {
    const result = await dryRunSharePointDocumentAdapter.list({ loanNumber: 'LN-1001' });
    expect(result).toEqual({ kind: 'listed', entries: [] });
  });

  it('reports configured=false and mode=DRY_RUN', () => {
    expect(dryRunSharePointDocumentAdapter.configured).toBe(false);
    expect(dryRunSharePointDocumentAdapter.mode).toBe('DRY_RUN');
  });
});

describe('Phase 264 (P0) — notYetRegisteredSharePointDocumentAdapter', () => {
  it('fails closed with a clear, non-crashing reason', async () => {
    const result = await notYetRegisteredSharePointDocumentAdapter.upload(input());
    expect(result.kind).toBe('not-configured');
    expect((result as { reason: string }).reason).toMatch(/not yet registered/i);
  });

  it('list also fails closed', async () => {
    const result = await notYetRegisteredSharePointDocumentAdapter.list({ loanNumber: 'LN-1001' });
    expect(result.kind).toBe('not-configured');
  });

  it('does not throw, never returns a fake URL, and is NOT a DRY_RUN success', async () => {
    let threw = false;
    let result;
    try {
      result = await notYetRegisteredSharePointDocumentAdapter.upload(input());
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result!.kind).toBe('not-configured');
    // No webUrl field at all on a not-configured result, and it never claims 'uploaded'.
    expect((result as Record<string, unknown>).webUrl).toBeUndefined();
    expect(result!.kind).not.toBe('uploaded');
    expect(notYetRegisteredSharePointDocumentAdapter.mode).toBe('LIVE');
  });
});

function mockConnector(overrides: Partial<PortfolioSharePointConnectorPort> = {}): PortfolioSharePointConnectorPort {
  return {
    createFolderIfNotExists: vi.fn(async () => ({ success: true })),
    createFile: vi.fn(async () => ({
      success: true,
      data: { itemId: 'item-1', webUrl: 'https://bank.sharepoint.com/sites/lending/Portfolio Loans/LN-1001/note.pdf' },
    })),
    listFolder: vi.fn(async () => ({ success: true, data: [] })),
    ...overrides,
  };
}

describe('Phase 264 (P0) — createLiveSharePointDocumentAdapter', () => {
  it('ensures the per-loan folder exists, then uploads, and returns the real link', async () => {
    const connector = mockConnector();
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input());

    expect(connector.createFolderIfNotExists).toHaveBeenCalledWith(`${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001 - Acme LLC`);
    expect(connector.createFile).toHaveBeenCalledWith(
      `${DEFAULT_LIBRARY_ROOT_PATH}/LN-1001 - Acme LLC`,
      'promissory-note.pdf',
      'application/pdf',
      input().content,
    );
    expect(result).toEqual({
      kind: 'uploaded',
      webUrl: 'https://bank.sharepoint.com/sites/lending/Portfolio Loans/LN-1001/note.pdf',
      itemId: 'item-1',
      mode: 'LIVE',
    });
    expect(adapter.configured).toBe(true);
    expect(adapter.mode).toBe('LIVE');
  });

  it('validates input locally before ever calling the connector', async () => {
    const connector = mockConnector();
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input({ content: new Uint8Array([]) }));

    expect(result.kind).toBe('invalid-input');
    expect(connector.createFolderIfNotExists).not.toHaveBeenCalled();
    expect(connector.createFile).not.toHaveBeenCalled();
  });

  it('classifies a folder-creation failure by HTTP status (5xx -> transient)', async () => {
    const connector = mockConnector({
      createFolderIfNotExists: vi.fn(async () => ({ success: false, error: { message: 'server error', status: 503 } })),
    });
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input());

    expect(result.kind).toBe('transient-failure');
    expect(connector.createFile).not.toHaveBeenCalled();
  });

  it('classifies an upload failure by HTTP status (403 -> permanent)', async () => {
    const connector = mockConnector({
      createFile: vi.fn(async () => ({ success: false, error: { message: 'forbidden', status: 403 } })),
    });
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input());

    expect(result.kind).toBe('permanent-failure');
  });

  it('treats a thrown connector error as transient rather than crashing, mapped to the shared business-safe message', async () => {
    const connector = mockConnector({
      createFile: vi.fn(async () => {
        throw new Error('network drop');
      }),
    });
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input());

    expect(result.kind).toBe('transient-failure');
    if (result.kind === 'transient-failure') {
      expect(result.reason).not.toContain('network drop');
      expect(result.reason).toContain("We couldn't save that action");
    }
  });

  it('lists real entries from the connector for the loan folder', async () => {
    const connector = mockConnector({
      listFolder: vi.fn(async () => ({
        success: true,
        data: [{ itemId: 'i1', fileName: 'note.pdf', webUrl: 'https://x/note.pdf' }],
      })),
    });
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.list({ loanNumber: 'LN-1001' });

    expect(result).toEqual({
      kind: 'listed',
      entries: [{ itemId: 'i1', fileName: 'note.pdf', webUrl: 'https://x/note.pdf' }],
    });
  });

  it('respects a bank-supplied library root override', async () => {
    const connector = mockConnector();
    const adapter = createLiveSharePointDocumentAdapter(connector, { libraryRootPath: 'Bank Docs' });

    await adapter.upload(input());

    expect(connector.createFolderIfNotExists).toHaveBeenCalledWith('Bank Docs/LN-1001 - Acme LLC');
  });
});

describe('Phase 264 (P0) — createLiveSharePointDocumentAdapter failure classification', () => {
  // Repository convention (mirrors outlookEmailAdapters): 408/429/5xx + no-status/transport are
  // transient (retryable); every other 4xx is permanent (needs operator action).
  const cases: ReadonlyArray<{ label: string; status: number | undefined; expected: 'transient-failure' | 'permanent-failure' }> = [
    { label: 'authentication (401)', status: 401, expected: 'permanent-failure' },
    { label: 'authorization (403)', status: 403, expected: 'permanent-failure' },
    { label: 'not-found / invalid path (404)', status: 404, expected: 'permanent-failure' },
    { label: 'conflict (409)', status: 409, expected: 'permanent-failure' },
    { label: 'file too large (413)', status: 413, expected: 'permanent-failure' },
    { label: 'throttling (429)', status: 429, expected: 'transient-failure' },
    { label: 'server error (500)', status: 500, expected: 'transient-failure' },
    { label: 'server unavailable (503)', status: 503, expected: 'transient-failure' },
    { label: 'timeout (408)', status: 408, expected: 'transient-failure' },
    { label: 'transport / no status', status: undefined, expected: 'transient-failure' },
    { label: 'unknown non-4xx/5xx (302)', status: 302, expected: 'transient-failure' },
  ];

  for (const c of cases) {
    it(`classifies an upload ${c.label} as ${c.expected}`, async () => {
      const connector = mockConnector({
        createFile: vi.fn(async () => ({ success: false, error: { message: 'x', status: c.status } })),
      });
      const result = await createLiveSharePointDocumentAdapter(connector).upload(input());
      expect(result.kind).toBe(c.expected);
    });
  }

  it('fails closed (permanent) when the connector reports success but returns NO webUrl (malformed response) — never fabricates a URL', async () => {
    const connector = mockConnector({
      createFile: vi.fn(async () => ({ success: true, data: { itemId: 'item-1' } })), // no webUrl
    });
    const result = await createLiveSharePointDocumentAdapter(connector).upload(input());
    expect(result.kind).toBe('permanent-failure');
    expect((result as Record<string, unknown>).webUrl).toBeUndefined();
  });

  it('calls ensure-folder and create-file EXACTLY ONCE each on success (no duplicate upload)', async () => {
    const connector = mockConnector();
    await createLiveSharePointDocumentAdapter(connector).upload(input());
    expect(connector.createFolderIfNotExists).toHaveBeenCalledTimes(1);
    expect(connector.createFile).toHaveBeenCalledTimes(1);
  });

  it('a folder-ensure failure prevents any file upload (createFile never called)', async () => {
    const connector = mockConnector({
      createFolderIfNotExists: vi.fn(async () => ({ success: false, error: { message: 'no site', status: 404 } })),
    });
    const result = await createLiveSharePointDocumentAdapter(connector).upload(input());
    expect(result.kind).toBe('permanent-failure');
    expect(connector.createFile).not.toHaveBeenCalled();
  });

  it('validates size at the boundary before the connector (exactly 100 MB is accepted, larger is rejected pre-flight)', async () => {
    const atLimit = mockConnector();
    await createLiveSharePointDocumentAdapter(atLimit).upload(input({ content: sizedContent(MAX_UPLOAD_BYTES) }));
    expect(atLimit.createFile).toHaveBeenCalledTimes(1);

    const over = mockConnector();
    const overResult = await createLiveSharePointDocumentAdapter(over).upload(input({ content: sizedContent(MAX_UPLOAD_BYTES + 1) }));
    expect(overResult.kind).toBe('invalid-input');
    expect(over.createFolderIfNotExists).not.toHaveBeenCalled();
    expect(over.createFile).not.toHaveBeenCalled();
  });
});

describe('Phase 264 (P0) — getSharePointDocumentAdapter mode switch', () => {
  it('defaults to the DRY_RUN adapter when SHAREPOINT_DOCUMENT_MODE is not LIVE (the operational default today)', () => {
    const adapter = getSharePointDocumentAdapter();
    expect(adapter.mode).toBe('DRY_RUN');
    expect(adapter).toBe(dryRunSharePointDocumentAdapter);
  });
});

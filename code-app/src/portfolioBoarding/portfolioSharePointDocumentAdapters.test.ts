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
      input({ content: new Uint8Array(MAX_UPLOAD_BYTES + 1) }),
    );
    expect(result.kind).toBe('invalid-input');
  });

  it('rejects a missing loan number', async () => {
    const result = await dryRunSharePointDocumentAdapter.upload(input({ loanNumber: '' }));
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

  it('treats a thrown connector error as transient rather than crashing', async () => {
    const connector = mockConnector({
      createFile: vi.fn(async () => {
        throw new Error('network drop');
      }),
    });
    const adapter = createLiveSharePointDocumentAdapter(connector);

    const result = await adapter.upload(input());

    expect(result).toEqual({ kind: 'transient-failure', reason: 'network drop' });
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

describe('Phase 264 (P0) — getSharePointDocumentAdapter mode switch', () => {
  it('defaults to the DRY_RUN adapter when SHAREPOINT_DOCUMENT_MODE is not LIVE (the operational default today)', () => {
    const adapter = getSharePointDocumentAdapter();
    expect(adapter.mode).toBe('DRY_RUN');
    expect(adapter).toBe(dryRunSharePointDocumentAdapter);
  });
});

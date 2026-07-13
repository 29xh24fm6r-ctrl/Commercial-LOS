// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePortfolioLoanDocumentPersistence,
  createDisabledPortfolioBoardingDocumentAdapter,
  type PortfolioBoardingDocumentAdapter,
} from './usePortfolioLoanDocumentPersistence';
import {
  dryRunSharePointDocumentAdapter,
  notYetRegisteredSharePointDocumentAdapter,
} from './portfolioSharePointDocumentAdapters';
import type { PortfolioSharePointDocumentPort, SharePointDocumentUploadInput } from './portfolioSharePointDocumentPort';
import type { PortfolioLoanDocumentRecord } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

/**
 * Phase 264 (P0) — usePortfolioLoanDocumentPersistence.uploadDocument.
 *
 * Pins:
 *   - uploadDocument fails closed (not_configured) when sharePointUploadEnabled is off.
 *   - DRY_RUN (the default injected adapter) succeeds with NO fileReference — never a fake link.
 *   - A real (mock) LIVE adapter's link flows through to the result.
 *   - When document-metadata persistence is ALSO enabled, the metadata adapter
 *     receives the fileReference; when it is not, the upload stands alone.
 *   - A SharePoint-side failure (invalid-input / not-configured / *-failure)
 *     surfaces honestly and never calls the metadata adapter.
 */

function upload(overrides: Partial<SharePointDocumentUploadInput> = {}): SharePointDocumentUploadInput {
  return {
    loanNumber: 'LN-1001',
    borrowerLegalName: 'Acme LLC',
    documentType: 'note',
    fileName: 'note.pdf',
    contentType: 'application/pdf',
    content: new Uint8Array([1, 2, 3]),
    correlationId: 'corr-1',
    ...overrides,
  };
}

function doc(overrides: Partial<PortfolioLoanDocumentRecord> = {}): PortfolioLoanDocumentRecord {
  return { documentType: 'note', ...overrides } as PortfolioLoanDocumentRecord;
}

function enabledMetadataAdapter(overrides: Partial<PortfolioBoardingDocumentAdapter> = {}): PortfolioBoardingDocumentAdapter {
  return {
    enabled: true,
    uploadConfigured: false,
    attachDocumentRecord: vi.fn(async () => ({ ok: true, operation: 'attachDocumentRecord', recordId: 'doc-1' })),
    updateDocumentRecord: vi.fn(async () => ({ ok: true, operation: 'updateDocumentRecord' })),
    addEvidenceLink: vi.fn(async () => ({ ok: true, operation: 'addEvidenceLink' })),
    addExaminerNote: vi.fn(async () => ({ ok: true, operation: 'addExaminerNote' })),
    ...overrides,
  };
}

describe('Phase 264 (P0) — usePortfolioLoanDocumentPersistence.uploadDocument', () => {
  it('fails closed with not_configured when sharePointUploadEnabled is off (the default)', async () => {
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(createDisabledPortfolioBoardingDocumentAdapter(), {}),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc());
    });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'not_configured' });
    expect(result.current.uploadConfigured).toBe(false);
  });

  it('DRY_RUN succeeds with no fileReference — never a fake link', async () => {
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        createDisabledPortfolioBoardingDocumentAdapter(),
        { sharePointUploadEnabled: true },
      ),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc());
    });

    expect(outcome).toEqual({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' });
    expect(result.current.uploadConfigured).toBe(true);
    expect(result.current.uploadMode).toBe('DRY_RUN');
    expect(result.current.state.kind).toBe('success');
  });

  it('a real (mock LIVE) adapter\'s link flows through to the result and is NOT persisted when metadata is disabled', async () => {
    const liveAdapter: PortfolioSharePointDocumentPort = {
      mode: 'LIVE',
      configured: true,
      upload: vi.fn(async () => ({ kind: 'uploaded' as const, webUrl: 'https://bank.sharepoint.com/x/note.pdf', itemId: 'item-1', mode: 'LIVE' as const })),
      list: vi.fn(async () => ({ kind: 'listed' as const, entries: [] })),
    };
    const metadataAdapter = enabledMetadataAdapter({ enabled: false });

    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(metadataAdapter, { sharePointUploadEnabled: true }, liveAdapter),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc());
    });

    expect(outcome).toEqual({
      ok: true,
      operation: 'uploadDocument',
      fileReference: 'https://bank.sharepoint.com/x/note.pdf',
      mode: 'LIVE',
    });
    expect(metadataAdapter.attachDocumentRecord).not.toHaveBeenCalled();
  });

  it('persists the fileReference onto the metadata record when metadata persistence is ALSO enabled', async () => {
    const liveAdapter: PortfolioSharePointDocumentPort = {
      mode: 'LIVE',
      configured: true,
      upload: vi.fn(async () => ({ kind: 'uploaded' as const, webUrl: 'https://bank.sharepoint.com/x/note.pdf', itemId: 'item-1', mode: 'LIVE' as const })),
      list: vi.fn(async () => ({ kind: 'listed' as const, entries: [] })),
    };
    const metadataAdapter = enabledMetadataAdapter({ enabled: true });

    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        metadataAdapter,
        { documentMetadataEnabled: true, sharePointUploadEnabled: true },
        liveAdapter,
      ),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc({ documentType: 'note' }));
    });

    expect(metadataAdapter.attachDocumentRecord).toHaveBeenCalledWith(
      'loan-1',
      expect.objectContaining({ documentType: 'note', fileReference: 'https://bank.sharepoint.com/x/note.pdf' }),
    );
    expect(outcome).toMatchObject({ ok: true, recordId: 'doc-1', fileReference: 'https://bank.sharepoint.com/x/note.pdf' });
  });

  it('surfaces a SharePoint-side failure honestly and never calls the metadata adapter', async () => {
    const metadataAdapter = enabledMetadataAdapter({ enabled: true });

    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        metadataAdapter,
        { documentMetadataEnabled: true, sharePointUploadEnabled: true },
        dryRunSharePointDocumentAdapter,
      ),
    );

    let outcome;
    await act(async () => {
      // Empty content fails dry-run's own local validation.
      outcome = await result.current.uploadDocument('loan-1', upload({ content: new Uint8Array([]) }), doc());
    });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'invalid-input' });
    expect(metadataAdapter.attachDocumentRecord).not.toHaveBeenCalled();
    expect(result.current.state.kind).toBe('failure');
  });

  it('DRY_RUN never persists a "stored" metadata row, even when metadata persistence is ALSO enabled', async () => {
    const metadataAdapter = enabledMetadataAdapter({ enabled: true });
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        metadataAdapter,
        { documentMetadataEnabled: true, sharePointUploadEnabled: true },
        dryRunSharePointDocumentAdapter,
      ),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc());
    });

    // No phantom metadata row and no fileReference — the file was never physically stored.
    expect(metadataAdapter.attachDocumentRecord).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' });
  });

  it('LIVE selected without a wired connector fails closed (not-configured) and never touches metadata', async () => {
    const metadataAdapter = enabledMetadataAdapter({ enabled: true });
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        metadataAdapter,
        { documentMetadataEnabled: true, sharePointUploadEnabled: true },
        notYetRegisteredSharePointDocumentAdapter,
      ),
    );
    expect(result.current.uploadMode).toBe('LIVE');
    expect(result.current.connectorAvailable).toBe(false);

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload(), doc());
    });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'not-configured', mode: 'LIVE' });
    expect(metadataAdapter.attachDocumentRecord).not.toHaveBeenCalled();
  });

  it('reports connectorAvailable from the injected adapter (false for DRY_RUN, true for a wired LIVE adapter)', () => {
    const dry = renderHook(() =>
      usePortfolioLoanDocumentPersistence(createDisabledPortfolioBoardingDocumentAdapter(), { sharePointUploadEnabled: true }),
    );
    expect(dry.result.current.connectorAvailable).toBe(false);
    expect(dry.result.current.uploadMode).toBe('DRY_RUN');

    const wired: PortfolioSharePointDocumentPort = {
      mode: 'LIVE',
      configured: true,
      upload: vi.fn(),
      list: vi.fn(),
    };
    const live = renderHook(() =>
      usePortfolioLoanDocumentPersistence(createDisabledPortfolioBoardingDocumentAdapter(), { sharePointUploadEnabled: true }, wired),
    );
    expect(live.result.current.connectorAvailable).toBe(true);
    expect(live.result.current.uploadMode).toBe('LIVE');
  });

  it('surfaces a missing loan number honestly (invalid-input) without persisting metadata', async () => {
    const metadataAdapter = enabledMetadataAdapter({ enabled: true });
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(
        metadataAdapter,
        { documentMetadataEnabled: true, sharePointUploadEnabled: true },
        dryRunSharePointDocumentAdapter,
      ),
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.uploadDocument('loan-1', upload({ loanNumber: '' }), doc());
    });

    expect(outcome).toMatchObject({ ok: false, errorCode: 'invalid-input' });
    expect(metadataAdapter.attachDocumentRecord).not.toHaveBeenCalled();
  });

  it('preserves the mode the adapter returns and carries the real link through in LIVE (borrower present or absent)', async () => {
    const liveAdapter: PortfolioSharePointDocumentPort = {
      mode: 'LIVE',
      configured: true,
      upload: vi.fn(async () => ({ kind: 'uploaded' as const, webUrl: 'https://bank.sharepoint.com/x/n.pdf', itemId: 'i', mode: 'LIVE' as const })),
      list: vi.fn(async () => ({ kind: 'listed' as const, entries: [] })),
    };
    const { result } = renderHook(() =>
      usePortfolioLoanDocumentPersistence(createDisabledPortfolioBoardingDocumentAdapter(), { sharePointUploadEnabled: true }, liveAdapter),
    );

    let withBorrower;
    let withoutBorrower;
    await act(async () => {
      withBorrower = await result.current.uploadDocument('loan-1', upload({ borrowerLegalName: 'Acme LLC' }), doc());
    });
    await act(async () => {
      withoutBorrower = await result.current.uploadDocument('loan-1', upload({ borrowerLegalName: undefined }), doc());
    });

    expect(withBorrower).toMatchObject({ ok: true, mode: 'LIVE', fileReference: 'https://bank.sharepoint.com/x/n.pdf' });
    expect(withoutBorrower).toMatchObject({ ok: true, mode: 'LIVE', fileReference: 'https://bank.sharepoint.com/x/n.pdf' });
  });
});

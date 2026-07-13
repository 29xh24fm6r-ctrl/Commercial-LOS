// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioLoanBoardingDetail } from './PortfolioLoanBoardingDetail';
import { createEmptyPortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import type { PortfolioBoardingDocumentAdapter, DocumentPersistenceResult } from './usePortfolioLoanDocumentPersistence';

/**
 * Phase 264 (P3) — PortfolioLoanBoardingDetail wires the real (DRY_RUN by
 * default) SharePoint document upload panel.
 *
 * Pins:
 *   - the upload panel renders alongside the existing read-only sections.
 *   - it is "not configured" by default (both flags default off, matching
 *     every other portfolio boarding capability's safe-off posture).
 *   - when both flags are on, uploading a document flows all the way through
 *     to the injected metadata adapter with the real fileReference.
 */

function ok(recordId?: string): Promise<DocumentPersistenceResult> {
  return Promise.resolve({ ok: true, operation: 'attachDocumentRecord', recordId });
}

function metadataAdapter(overrides: Partial<PortfolioBoardingDocumentAdapter> = {}): PortfolioBoardingDocumentAdapter {
  return {
    enabled: true,
    uploadConfigured: false,
    attachDocumentRecord: vi.fn(() => ok('doc-1')),
    updateDocumentRecord: vi.fn(() => ok()),
    addEvidenceLink: vi.fn(() => ok()),
    addExaminerNote: vi.fn(() => ok()),
    ...overrides,
  };
}

function file(name: string, content = 'hello'): File {
  return new File([content], name, { type: 'application/pdf' });
}

describe('Phase 264 (P3) — PortfolioLoanBoardingDetail SharePoint upload wiring', () => {
  it('renders the upload panel, not configured by default', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    render(<PortfolioLoanBoardingDetail package={pkg} />);
    expect(screen.getByText('Document Upload')).toBeInTheDocument();
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
  });

  it('renders the real upload form once sharePointUploadEnabled is on and a loan number is present', () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.packageId = 'pkg-1';
    pkg.identity.loanNumber = 'LN-1001';
    pkg.identity.borrowerLegalName = 'Acme LLC';
    const { container } = render(
      <PortfolioLoanBoardingDetail package={pkg} sharePointUploadEnabled />,
    );
    expect(container.querySelector('[data-portfolio-upload-form]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-dry-run-banner]')).not.toBeNull();
  });

  it('a DRY_RUN upload never claims a file was stored, and never persists a phantom metadata row even with metadata enabled', async () => {
    const pkg = createEmptyPortfolioLoanBoardingPackage();
    pkg.packageId = 'pkg-1';
    pkg.identity.loanNumber = 'LN-1001';
    pkg.identity.borrowerLegalName = 'Acme LLC';
    const adapter = metadataAdapter();
    const user = userEvent.setup();

    const { container } = render(
      <PortfolioLoanBoardingDetail
        package={pkg}
        sharePointUploadEnabled
        documentMetadataEnabled
        documentAdapter={adapter}
      />,
    );

    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));

    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).toMatch(/no file was actually stored/i);
    // Phase 264 (P0) hardening: DRY_RUN never writes a "stored" metadata row —
    // no phantom record, even when document-metadata persistence is enabled.
    expect(adapter.attachDocumentRecord).not.toHaveBeenCalled();
  });
});

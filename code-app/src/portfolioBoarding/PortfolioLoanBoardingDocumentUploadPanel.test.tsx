// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioLoanBoardingDocumentUploadPanel } from './PortfolioLoanBoardingDocumentUploadPanel';
import type { DocumentUploadResult } from './usePortfolioLoanDocumentPersistence';

/**
 * Phase 264 (P0) — PortfolioLoanBoardingDocumentUploadPanel real form.
 *
 * Pins:
 *   - "not configured" copy when the upload flag is off (unchanged baseline).
 *   - the real file-input form renders once uploadConfigured + a loan are present.
 *   - a DRY_RUN upload shows the honest "no file was actually stored" copy,
 *     never a fake stored-at link.
 *   - a LIVE upload with a real fileReference shows the "Stored at <url>" copy.
 *   - an upload failure renders the reason via role="alert".
 */

function file(name: string, content = 'hello'): File {
  return new File([content], name, { type: 'application/pdf' });
}

describe('Phase 264 (P0) — PortfolioLoanBoardingDocumentUploadPanel', () => {
  it('shows "not configured" when the upload flag is off', () => {
    render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId={undefined}
        loanNumber={undefined}
        borrowerLegalName={undefined}
        uploadConfigured={false}
        uploadMode="DRY_RUN"
        uploadDocument={vi.fn()}
      />,
    );
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
    expect(screen.queryByText(/document type/i)).not.toBeInTheDocument();
  });

  it('shows "not configured" when the flag is on but no loan is selected yet', () => {
    render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId={undefined}
        loanNumber={undefined}
        borrowerLegalName={undefined}
        uploadConfigured={true}
        uploadMode="DRY_RUN"
        uploadDocument={vi.fn()}
      />,
    );
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
    expect(screen.getByText(/A loan must be selected/i)).toBeInTheDocument();
  });

  it('renders the real upload form once configured and a loan is selected, with a DRY RUN banner', () => {
    const { container } = render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId="loan-1"
        loanNumber="LN-1001"
        borrowerLegalName="Acme LLC"
        uploadConfigured={true}
        uploadMode="DRY_RUN"
        uploadDocument={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-portfolio-upload-form]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-file]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-dry-run-banner]')).not.toBeNull();
  });

  it('a DRY_RUN upload shows honest "no file was actually stored" copy — never a fake link', async () => {
    const uploadDocument = vi.fn(
      async (_loanId: string, _upload: unknown, _doc: unknown): Promise<DocumentUploadResult> => ({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId="loan-1"
        loanNumber="LN-1001"
        borrowerLegalName="Acme LLC"
        uploadConfigured={true}
        uploadMode="DRY_RUN"
        uploadDocument={uploadDocument}
      />,
    );

    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));

    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).toMatch(/no file was actually stored/i);
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).not.toMatch(/Stored at/i);
    expect(uploadDocument).toHaveBeenCalledTimes(1);
    expect(uploadDocument.mock.calls[0][0]).toBe('loan-1');
    expect(uploadDocument.mock.calls[0][1]).toMatchObject({ loanNumber: 'LN-1001', fileName: 'note.pdf' });
  });

  it('a LIVE upload with a real link shows "Stored at <url>"', async () => {
    const uploadDocument = vi.fn(
      async (): Promise<DocumentUploadResult> => ({
        ok: true,
        operation: 'uploadDocument',
        fileReference: 'https://bank.sharepoint.com/x/note.pdf',
        mode: 'LIVE',
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId="loan-1"
        loanNumber="LN-1001"
        borrowerLegalName="Acme LLC"
        uploadConfigured={true}
        uploadMode="LIVE"
        uploadDocument={uploadDocument}
      />,
    );

    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));

    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).toMatch(
      /Stored at https:\/\/bank\.sharepoint\.com\/x\/note\.pdf/,
    );
    // LIVE mode does not show the DRY RUN banner.
    expect(container.querySelector('[data-portfolio-upload-dry-run-banner]')).toBeNull();
  });

  it('renders the failure reason via role="alert" when the upload fails', async () => {
    const uploadDocument = vi.fn(
      async (): Promise<DocumentUploadResult> => ({
        ok: false,
        operation: 'uploadDocument',
        errorCode: 'invalid-input',
        message: 'The file is empty.',
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <PortfolioLoanBoardingDocumentUploadPanel
        loanId="loan-1"
        loanNumber="LN-1001"
        borrowerLegalName="Acme LLC"
        uploadConfigured={true}
        uploadMode="DRY_RUN"
        uploadDocument={uploadDocument}
      />,
    );

    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));

    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-error]')).not.toBeNull());
    expect(container.querySelector('[data-portfolio-upload-error]')?.textContent).toMatch(/The file is empty\./);
  });
});

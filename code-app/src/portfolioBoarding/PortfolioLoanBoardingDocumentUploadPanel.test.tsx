// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortfolioLoanBoardingDocumentUploadPanel } from './PortfolioLoanBoardingDocumentUploadPanel';
import type { DocumentUploadResult } from './usePortfolioLoanDocumentPersistence';

/**
 * Phase 264 (P0) — PortfolioLoanBoardingDocumentUploadPanel real form.
 *
 * Pins (honest, mode-aware UI):
 *   - real document-type selector + file input; no placeholder text.
 *   - feature-disabled and connector-not-registered states are explained, never crash.
 *   - a DRY_RUN success says exactly "Recorded (dry-run) — no file was actually stored" and NEVER
 *     "Stored at" / a link.
 *   - a LIVE success with a real URL renders a real anchor link; LIVE never shows the DRY_RUN copy.
 *   - failures render via role="alert"; loading state shows; no duplicate submission while loading.
 */

function file(name: string, content = 'hello'): File {
  return new File([content], name, { type: 'application/pdf' });
}

type PanelProps = Parameters<typeof PortfolioLoanBoardingDocumentUploadPanel>[0];

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    loanId: 'loan-1',
    loanNumber: 'LN-1001',
    borrowerLegalName: 'Acme LLC',
    uploadConfigured: true,
    uploadMode: 'DRY_RUN',
    connectorAvailable: false,
    uploadDocument: vi.fn(async (): Promise<DocumentUploadResult> => ({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' })),
    ...overrides,
  };
  return { ...render(<PortfolioLoanBoardingDocumentUploadPanel {...props} />), props };
}

describe('Phase 264 (P0) — PortfolioLoanBoardingDocumentUploadPanel', () => {
  it('shows "not configured" (feature disabled) when the upload flag is off', () => {
    const { container } = renderPanel({ loanId: undefined, loanNumber: undefined, uploadConfigured: false });
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
    expect(container.querySelector('[data-portfolio-upload-form]')).toBeNull();
  });

  it('shows "not configured" when the flag is on but no loan is selected yet', () => {
    renderPanel({ loanId: undefined, loanNumber: undefined });
    expect(screen.getByText('Document upload not configured')).toBeInTheDocument();
    expect(screen.getByText(/A loan must be selected/i)).toBeInTheDocument();
  });

  it('LIVE selected without a wired connector renders a clear fail-closed explanation (never a form, never a crash)', () => {
    const { container } = renderPanel({ uploadMode: 'LIVE', connectorAvailable: false });
    expect(container.querySelector('[data-portfolio-upload-connector-missing]')).not.toBeNull();
    expect(screen.getByText('SharePoint connector not registered')).toBeInTheDocument();
    expect(container.querySelector('[data-portfolio-upload-form]')).toBeNull();
  });

  it('renders the REAL document-type selector + file input (no placeholder text) with a DRY RUN banner', () => {
    const { container } = renderPanel();
    expect(container.querySelector('[data-portfolio-upload-form]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-document-type]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-file]')).not.toBeNull();
    expect(container.querySelector('[data-portfolio-upload-dry-run-banner]')).not.toBeNull();
    // The old placeholder wording is gone.
    expect(screen.queryByText(/form will render here/i)).not.toBeInTheDocument();
  });

  it('a DRY_RUN success shows the exact honest copy — never "Stored at", never a link', async () => {
    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));
    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    const done = container.querySelector('[data-portfolio-upload-done]')!;
    expect(done.textContent).toMatch(/Recorded \(dry-run\) — no file was actually stored/i);
    expect(done.textContent).not.toMatch(/Stored at/i);
    expect(done.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-portfolio-upload-link]')).toBeNull();
  });

  it('passes the selected document type and file through to uploadDocument', async () => {
    const uploadDocument = vi.fn(async (): Promise<DocumentUploadResult> => ({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' }));
    const user = userEvent.setup();
    const { container } = renderPanel({ uploadDocument });
    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(1));
    const [loanIdArg, uploadArg, docArg] = uploadDocument.mock.calls[0] as unknown as Parameters<PanelProps['uploadDocument']>;
    expect(loanIdArg).toBe('loan-1');
    expect(uploadArg).toMatchObject({ loanNumber: 'LN-1001', fileName: 'note.pdf' });
    expect((docArg as { documentName?: string }).documentName).toBe('note.pdf');
  });

  it('a LIVE success with a real URL renders a real anchor LINK (safe attrs), and no DRY_RUN copy', async () => {
    const url = 'https://bank.sharepoint.com/x/note.pdf';
    const uploadDocument = vi.fn(async (): Promise<DocumentUploadResult> => ({ ok: true, operation: 'uploadDocument', fileReference: url, mode: 'LIVE' }));
    const user = userEvent.setup();
    const { container } = renderPanel({ uploadMode: 'LIVE', connectorAvailable: true, uploadDocument });
    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));
    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    const link = container.querySelector('[data-portfolio-upload-link]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).toMatch(/Stored at/);
    expect(container.querySelector('[data-portfolio-upload-done]')?.textContent).not.toMatch(/dry-run/i);
    expect(container.querySelector('[data-portfolio-upload-dry-run-banner]')).toBeNull();
  });

  it('renders the failure reason via role="alert" when the upload fails (empty file)', async () => {
    const uploadDocument = vi.fn(async (): Promise<DocumentUploadResult> => ({ ok: false, operation: 'uploadDocument', errorCode: 'invalid-input', message: 'The file is empty.' }));
    const user = userEvent.setup();
    const { container } = renderPanel({ uploadDocument });
    await user.upload(container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement, file('note.pdf'));
    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-error]')).not.toBeNull());
    const alert = container.querySelector('[data-portfolio-upload-error]')!;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toMatch(/The file is empty\./);
  });

  it('shows a loading state and prevents duplicate submission while a file is uploading', async () => {
    let resolveUpload: (r: DocumentUploadResult) => void = () => {};
    const uploadDocument = vi.fn(
      () => new Promise<DocumentUploadResult>((resolve) => { resolveUpload = resolve; }),
    );
    const user = userEvent.setup();
    const { container } = renderPanel({ uploadDocument });
    const fileInput = container.querySelector('[data-portfolio-upload-file]') as HTMLInputElement;

    await user.upload(fileInput, file('note.pdf'));
    // Loading state visible + file input disabled → no duplicate submission possible.
    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-pending]')).not.toBeNull());
    expect(fileInput.disabled).toBe(true);
    expect(uploadDocument).toHaveBeenCalledTimes(1);

    resolveUpload({ ok: true, operation: 'uploadDocument', fileReference: undefined, mode: 'DRY_RUN' });
    await waitFor(() => expect(container.querySelector('[data-portfolio-upload-done]')).not.toBeNull());
    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });
});

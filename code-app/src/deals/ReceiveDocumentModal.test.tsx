// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { MarkDocumentReceivedOutcome } from './documentActions';
import { ReceiveDocumentModal } from './ReceiveDocumentModal';

const sampleDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: '2026-04-01T00:00:00Z',
  receivedDate: undefined,
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'outstanding',
};

function deferredOutcome(): {
  promise: Promise<MarkDocumentReceivedOutcome>;
  resolve: (o: MarkDocumentReceivedOutcome) => void;
} {
  let resolve!: (o: MarkDocumentReceivedOutcome) => void;
  const promise = new Promise<MarkDocumentReceivedOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ReceiveDocumentModal', () => {
  it('disables Mark received until a non-empty note is entered', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={onClose} />,
    );

    const button = screen.getByRole('button', { name: /^mark received$/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const textarea = screen.getByLabelText(/receipt note/i);
    await user.type(textarea, 'emailed by borrower');
    expect(button).not.toBeDisabled();

    await user.clear(textarea);
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
  });

  it('renders the metadata-only banker-safe helper line and no file picker when onUploadFile is omitted', () => {
    render(
      <ReceiveDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Conservative-copy invariant: the modal must say metadata-only,
    // must NOT claim binary upload happens here, and must not render a file
    // picker at all — DOCUMENT_FILE_UPLOAD_ENABLED-gated capabilities stay
    // absent, not merely disabled, matching this codebase's convention.
    expect(screen.getByText(/metadata-only/i)).toBeInTheDocument();
    expect(screen.getByText(/binary file upload is not enabled in this environment/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/attach file/i)).not.toBeInTheDocument();
  });

  it('renders a file picker and allows submit without a note when onUploadFile is provided', async () => {
    const onUploadFile = vi.fn().mockResolvedValue({ kind: 'success' });
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={vi.fn()} onClose={vi.fn()} onUploadFile={onUploadFile} />,
    );

    expect(screen.getByLabelText(/attach file/i)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /mark received/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const file = new File(['%PDF-1.4 fake'], 'tax.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/attach file/i), file);

    expect(screen.getByRole('button', { name: /^upload & mark received$/i })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^upload & mark received$/i }));
    expect(onUploadFile).toHaveBeenCalledWith(file);
  });

  it('rejects a disallowed file type client-side before any submit is possible', async () => {
    const onUploadFile = vi.fn();
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={vi.fn()} onClose={vi.fn()} onUploadFile={onUploadFile} />,
    );

    // applyAccept:false simulates a user bypassing the input's `accept` filter (e.g. picking
    // "All Files" in the OS dialog) — the accept attribute is advisory only, so the component's
    // own validateInput/handleFileChange check is the real, non-bypassable boundary under test.
    const user = userEvent.setup({ applyAccept: false });
    const badFile = new File(['zip content'], 'archive.zip', { type: 'application/zip' });
    await user.upload(screen.getByLabelText(/attach file/i), badFile);

    expect(screen.getByRole('alert')).toHaveTextContent(/not an accepted file type/i);
    // Falls back to requiring the note, since no valid file is selected.
    expect(screen.getByRole('button', { name: /^mark received$/i })).toBeDisabled();
  });

  it('rejects an oversized file client-side', async () => {
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={vi.fn()} onClose={vi.fn()} onUploadFile={vi.fn()} />,
    );

    const user = userEvent.setup();
    const oversized = new File([new Uint8Array(26 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText(/attach file/i), oversized);

    expect(screen.getByRole('alert')).toHaveTextContent(/larger than the 25 MB limit/i);
  });

  it('falls back to the metadata-only onConfirm path when no file is attached, even with onUploadFile available', async () => {
    const onConfirm = vi.fn().mockResolvedValue({ kind: 'success' } satisfies MarkDocumentReceivedOutcome);
    const onUploadFile = vi.fn();
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={vi.fn()} onUploadFile={onUploadFile} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'hand-delivered, no scan available');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    expect(onConfirm).toHaveBeenCalledWith('hand-delivered, no scan available');
    expect(onUploadFile).not.toHaveBeenCalled();
  });

  it('prevents double-submit while the action is in-flight', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={onClose} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');

    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    const inFlightButton = screen.getByRole('button', { name: /recording/i });
    expect(inFlightButton).toBeDisabled();
    await user.click(inFlightButton);

    deferred.resolve({ kind: 'success' });
    await screen.findByRole('button', { name: /^close$/i });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the success outcome with the conservative "marked received" wording', async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValue({ kind: 'success' } satisfies MarkDocumentReceivedOutcome);
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    // Conservative wording: "marked received", not "uploaded".
    expect(await screen.findByText(/document marked received/i)).toBeInTheDocument();
  });

  it('shows the receive-failed outcome when the document update fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'receive-failed',
      docError: 'row locked',
    } satisfies MarkDocumentReceivedOutcome);
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    expect(await screen.findByText(/could not record receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/row locked/i)).toBeInTheDocument();
  });

  it('shows the critical governance-partial outcome when timeline write fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      auditError: undefined,
      timelineError: 'timeline endpoint 500',
    } satisfies MarkDocumentReceivedOutcome);
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    await screen.findByText(/critical: governance write failed/i);
    expect(screen.getByText(/timeline endpoint 500/i)).toBeInTheDocument();
    expect(
      screen.getByText(/do not retry — the document receipt is already recorded/i),
    ).toBeInTheDocument();
  });

  it('converts a thrown error in onConfirm to a kind: unknown outcome', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    render(
      <ReceiveDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={vi.fn()} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/receipt note/i), 'emailed by borrower');
    await user.click(screen.getByRole('button', { name: /^mark received$/i }));

    expect(await screen.findByText(/unexpected error/i)).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });
});

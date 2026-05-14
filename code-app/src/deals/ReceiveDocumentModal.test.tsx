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

  it('renders the metadata-only banker-safe helper line (no binary upload claim)', () => {
    render(
      <ReceiveDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // Conservative-copy invariant: the modal must say metadata-only,
    // must NOT claim binary upload happens here.
    expect(screen.getByText(/metadata-only/i)).toBeInTheDocument();
    expect(screen.getByText(/no binary upload occurs in this phase/i)).toBeInTheDocument();
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

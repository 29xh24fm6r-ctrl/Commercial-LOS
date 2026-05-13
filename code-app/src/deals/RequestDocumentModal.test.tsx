// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { RequestDocumentOutcome } from './documentActions';
import { RequestDocumentModal } from './RequestDocumentModal';

const sampleDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: undefined,
  receivedDate: undefined,
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'outstanding',
};

function deferredOutcome(): {
  promise: Promise<RequestDocumentOutcome>;
  resolve: (o: RequestDocumentOutcome) => void;
} {
  let resolve!: (o: RequestDocumentOutcome) => void;
  const promise = new Promise<RequestDocumentOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('RequestDocumentModal', () => {
  it('disables the confirm button until a non-empty note is entered', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<RequestDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={onClose} />);

    const button = screen.getByRole('button', { name: /^record request$/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const textarea = screen.getByLabelText(/request note/i);
    await user.type(textarea, 'please upload');
    expect(button).not.toBeDisabled();

    await user.clear(textarea);
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
  });

  it('shows "Re-request" copy when the document already has a prior request date', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const priorDoc: DealDocument = {
      ...sampleDoc,
      requestDate: '2026-04-01T00:00:00Z',
    };
    render(<RequestDocumentModal doc={priorDoc} onConfirm={onConfirm} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: /re-request document/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^record re-request$/i })).toBeInTheDocument();
  });

  it('prevents double-submit: a second click while in-flight does not invoke onConfirm again', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    render(<RequestDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');

    await user.click(screen.getByRole('button', { name: /^record request$/i }));

    const inFlightButton = screen.getByRole('button', { name: /recording/i });
    expect(inFlightButton).toBeDisabled();
    await user.click(inFlightButton);

    deferred.resolve({ kind: 'success' });
    await screen.findByRole('button', { name: /^close$/i });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the critical governance-partial outcome when timeline write fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      auditError: undefined,
      timelineError: 'timeline endpoint 500',
    } satisfies RequestDocumentOutcome);
    const onClose = vi.fn();

    render(<RequestDocumentModal doc={sampleDoc} onConfirm={onConfirm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.click(screen.getByRole('button', { name: /^record request$/i }));

    await screen.findByText(/critical: governance write failed/i);
    expect(screen.getByText(/timeline endpoint 500/i)).toBeInTheDocument();
    expect(
      screen.getByText(/do not retry — the document request is already recorded/i),
    ).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { RequestDocumentOutcome } from './documentActions';
import type { SendDocumentRequestEmailOutcome } from './sendDocumentRequestEmail';
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

// ---------------------------------------------------------------------------
// Phase 61: Outlook send path. When onSendEmail is provided the modal
// grows the email section and sequences the send after the request.
// ---------------------------------------------------------------------------

describe('RequestDocumentModal — Phase 61 Outlook send path', () => {
  it('renders the Mode badge and email section when onSendEmail is provided', () => {
    const onConfirm = vi.fn();
    const onSendEmail = vi.fn();
    const onClose = vi.fn();
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={onClose}
        onSendEmail={onSendEmail}
      />,
    );
    expect(screen.getByRole('status', { name: /email delivery mode/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/send email through outlook/i)).toBeChecked();
    expect(screen.getByLabelText(/send to/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subject/i)).toHaveValue(
      `Document request: ${sampleDoc.name}`,
    );
  });

  it('button label becomes "Record request & send" when sending is enabled', () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onSendEmail={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /^record request & send$/i }),
    ).toBeInTheDocument();
  });

  it('disables submit until both the note AND a recipient are provided', async () => {
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onSendEmail={vi.fn()}
      />,
    );
    const button = screen.getByRole('button', { name: /^record request & send$/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    // Note alone isn't enough — recipient is required when send is on.
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    expect(button).not.toBeDisabled();
  });

  it('does NOT attempt the send when the request itself fails (doc-failed)', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'doc-failed',
      docError: 'update failed',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn();
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    await user.click(screen.getByRole('button', { name: /^record request & send$/i }));

    await screen.findByText(/could not record request/i);
    expect(onSendEmail).not.toHaveBeenCalled();
    expect(
      screen.getByText(/no email was attempted because the request itself did not record/i),
    ).toBeInTheDocument();
  });

  it('sequences send after request success and shows both outcomes', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'success',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'success',
      mode: 'DRY_RUN',
      providerMessageId: undefined,
      maskedRecipient: 'b***@e***.com',
    } satisfies SendDocumentRequestEmailOutcome);
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    await user.click(screen.getByRole('button', { name: /^record request & send$/i }));

    await screen.findByText(/request recorded/i);
    expect(screen.getByText(/send recorded \(dry_run\)/i)).toBeInTheDocument();
    expect(screen.getAllByText(/b\*\*\*@e\*\*\*\.com/i).length).toBeGreaterThan(0);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onSendEmail).toHaveBeenCalledTimes(1);
    expect(onSendEmail).toHaveBeenCalledWith({
      recipient: 'borrower@example.com',
      subject: `Document request: ${sampleDoc.name}`,
      body: 'please upload',
    });
  });

  it('shows send-failed honestly while leaving the request-recorded confirmation in place', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'success',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'send-failed',
      sendError: 'mailbox over quota',
      transient: false,
      mode: 'LIVE',
    } satisfies SendDocumentRequestEmailOutcome);
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    await user.click(screen.getByRole('button', { name: /^record request & send$/i }));

    await screen.findByText(/request recorded/i);
    expect(screen.getByText(/outlook did not accept the message/i)).toBeInTheDocument();
    expect(screen.getByText(/mailbox over quota/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent — do not retry/i)).toBeInTheDocument();
  });

  it('shows critical "send governance write failed" panel for governance-partial send', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'success',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      mode: 'LIVE',
      providerMessageId: 'mid-1',
      maskedRecipient: 'b***@e***.com',
      auditError: undefined,
      timelineError: 'tl 500',
    } satisfies SendDocumentRequestEmailOutcome);
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    await user.click(screen.getByRole('button', { name: /^record request & send$/i }));

    await screen.findByText(/critical: send governance write failed/i);
    expect(screen.getByText(/do NOT retry/i)).toBeInTheDocument();
  });

  it('lets the banker toggle send OFF and revert to the request-only flow', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'success',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn();
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/send email through outlook/i));
    expect(
      screen.getByRole('button', { name: /^record request$/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.click(screen.getByRole('button', { name: /^record request$/i }));

    await screen.findByText(/request recorded/i);
    expect(onSendEmail).not.toHaveBeenCalled();
  });

  it('catches a thrown send error and renders the unknown panel', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'success',
    } satisfies RequestDocumentOutcome);
    const onSendEmail = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <RequestDocumentModal
        doc={sampleDoc}
        onConfirm={onConfirm}
        onClose={vi.fn()}
        onSendEmail={onSendEmail}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/request note/i), 'please upload');
    await user.type(screen.getByLabelText(/send to/i), 'borrower@example.com');
    await user.click(screen.getByRole('button', { name: /^record request & send$/i }));

    await screen.findByText(/unexpected error on send/i);
    expect(screen.getByText(/^boom$/)).toBeInTheDocument();
  });
});

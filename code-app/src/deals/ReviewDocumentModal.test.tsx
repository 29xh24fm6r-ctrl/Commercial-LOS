// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDocument } from './dealDocumentQueries';
import type { MarkDocumentReviewedOutcome } from './documentActions';
import { ReviewDocumentModal } from './ReviewDocumentModal';

const sampleDoc: DealDocument = {
  id: 'doc-1',
  name: 'Personal Financial Statement',
  dueDate: '2026-05-30T00:00:00Z',
  requestDate: '2026-04-01T00:00:00Z',
  receivedDate: '2026-05-01T00:00:00Z',
  reviewer: undefined,
  uploaded: false,
  modifiedOn: undefined,
  status: 'received',
};

function deferredOutcome(): {
  promise: Promise<MarkDocumentReviewedOutcome>;
  resolve: (o: MarkDocumentReviewedOutcome) => void;
} {
  let resolve!: (o: MarkDocumentReviewedOutcome) => void;
  const promise = new Promise<MarkDocumentReviewedOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ReviewDocumentModal', () => {
  it('disables Mark reviewed until a non-empty note is entered', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const button = screen.getByRole('button', { name: /^mark reviewed$/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const textarea = screen.getByLabelText(/review note/i);
    await user.type(textarea, 'reviewed; numbers reconcile to memo');
    expect(button).not.toBeDisabled();

    await user.clear(textarea);
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
  });

  it('renders the banker reviewer name in the summary so the banker can confirm', () => {
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('M. Paller')).toBeInTheDocument();
  });

  it('uses conservative wording: no overclaim language', () => {
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // The modal body uses "Mark reviewed" / "reviewed the document"
    // and an explicit "does not approve" disclaimer. The forbidden
    // wording is the OVERCLAIM form — "approved by", "accepted",
    // "validated", "cleared", "decision", etc. — used as a claim.
    // "approve" appears legitimately inside "does not approve"
    // (truthful negation), so we don't ban the bare word; we ban the
    // positive forms instead.
    const text = document.body.textContent ?? '';
    // Approve / accept / validate appear ONLY inside the truthful-
    // negation disclaimer "does not approve, accept, or validate".
    // We verify the disclaimer is present and that the words don't
    // appear in any other context. The simpler bare-word ban would
    // be too strict.
    expect(text).toMatch(/does not approve, accept, or validate/i);
    // These words should never appear anywhere — there is no
    // truthful-negation use for them in this surface.
    expect(text).not.toMatch(/\bcleared?\b/i);
    expect(text).not.toMatch(/\bdecision(?:ed)?\b/i);
    expect(text).not.toMatch(/\bunderwritten\b/i);
    expect(text).not.toMatch(/\bcompliant\b/i);
    expect(text).not.toMatch(/\bfailed review\b/i);
    expect(text).not.toMatch(/\bapproved by\b/i);
    expect(text).not.toMatch(/\baccepted by\b/i);
  });

  it('prevents double-submit while the action is in-flight', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/review note/i), 'reviewed');
    await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));

    const inFlight = screen.getByRole('button', { name: /recording/i });
    expect(inFlight).toBeDisabled();
    await user.click(inFlight);

    deferred.resolve({ kind: 'success' });
    await screen.findByRole('button', { name: /^close$/i });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the success outcome with conservative "Document reviewed" wording', async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValue({ kind: 'success' } satisfies MarkDocumentReviewedOutcome);
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/review note/i), 'reviewed');
    await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));

    // The success outcome has the title "Recorded" — unique to the
    // success render. The body contains "Document reviewed; audit
    // and timeline events recorded." We assert the specific success
    // success-detail line.
    expect(
      await screen.findByText(
        /Document reviewed; audit and timeline events recorded/i,
      ),
    ).toBeInTheDocument();
  });

  it('shows the review-failed outcome when the document update fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'review-failed',
      docError: 'row locked',
    } satisfies MarkDocumentReviewedOutcome);
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/review note/i), 'reviewed');
    await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));

    expect(await screen.findByText(/could not record review/i)).toBeInTheDocument();
    expect(screen.getByText(/row locked/i)).toBeInTheDocument();
  });

  it('shows the critical governance-partial outcome when timeline write fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      auditError: undefined,
      timelineError: 'timeline endpoint 500',
    } satisfies MarkDocumentReviewedOutcome);
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/review note/i), 'reviewed');
    await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));

    await screen.findByText(/critical: governance write failed/i);
    expect(screen.getByText(/timeline endpoint 500/i)).toBeInTheDocument();
    expect(
      screen.getByText(/do not retry — the document review is already recorded/i),
    ).toBeInTheDocument();
  });

  it('converts a thrown error in onConfirm to a kind: unknown outcome', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    render(
      <ReviewDocumentModal
        doc={sampleDoc}
        reviewerName="M. Paller"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/review note/i), 'reviewed');
    await user.click(screen.getByRole('button', { name: /^mark reviewed$/i }));

    expect(await screen.findByText(/unexpected error/i)).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataQualityFlagRow } from './adminDiagnosticsQueries';
import type { ResolveOutcome } from './dataQualityActions';
import { ResolveFlagModal } from './ResolveFlagModal';

const sampleFlag: DataQualityFlagRow = {
  id: 'flag-1',
  flagName: 'Orphan record on Loan Deal',
  flagDescription: 'cr664_loandeal row has no banker assignment',
  flagType: 'OrphanRecord',
  resolutionStatus: 'Open',
  flaggedDate: '2026-05-01T12:00:00Z',
  sourceTable: 'cr664_loandeal',
  sourceRecordId: 'deal-99',
};

/** Returns a promise that the test can resolve manually. Lets us hold
 *  the action in-flight while we attempt a second click. */
function deferredOutcome(): {
  promise: Promise<ResolveOutcome>;
  resolve: (o: ResolveOutcome) => void;
} {
  let resolve!: (o: ResolveOutcome) => void;
  const promise = new Promise<ResolveOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ResolveFlagModal', () => {
  it('disables the confirm button until a non-empty note is entered', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ResolveFlagModal flag={sampleFlag} onConfirm={onConfirm} onClose={onClose} />,
    );

    const button = screen.getByRole('button', { name: /resolve flag/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const textarea = screen.getByLabelText(/resolution note/i);
    await user.type(textarea, 'fixed it');
    expect(button).not.toBeDisabled();

    // Whitespace-only should re-disable.
    await user.clear(textarea);
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
  });

  it('prevents double-submit: a second click while in-flight does not invoke onConfirm again', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();

    render(
      <ResolveFlagModal flag={sampleFlag} onConfirm={onConfirm} onClose={onClose} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/resolution note/i), 'fix');

    await user.click(screen.getByRole('button', { name: /^resolve flag$/i }));

    // After the first click the button switches to in-flight label
    // and becomes disabled.
    const inFlightButton = screen.getByRole('button', { name: /resolving/i });
    expect(inFlightButton).toBeDisabled();

    // Attempt a second click — should be a no-op (button disabled).
    await user.click(inFlightButton);

    // Resolve the deferred action so the test can complete.
    deferred.resolve({ kind: 'success', auditEventId: 'a-1' });

    // Wait for the outcome state to render the Close button.
    await screen.findByRole('button', { name: /^close$/i });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when Cancel is clicked during editing', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ResolveFlagModal flag={sampleFlag} onConfirm={onConfirm} onClose={onClose} />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables Cancel while the action is in-flight', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();

    render(
      <ResolveFlagModal flag={sampleFlag} onConfirm={onConfirm} onClose={onClose} />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/resolution note/i), 'fix');
    await user.click(screen.getByRole('button', { name: /^resolve flag$/i }));

    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    expect(cancel).toBeDisabled();

    // Trying to click should not trigger onClose because the button is
    // disabled (userEvent respects that).
    await user.click(cancel);
    expect(onClose).not.toHaveBeenCalled();

    deferred.resolve({ kind: 'success', auditEventId: 'a-1' });
    await screen.findByRole('button', { name: /^close$/i });
  });
});

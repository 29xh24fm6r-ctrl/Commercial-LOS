// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealTask } from './dealTaskQueries';
import type { CompleteTaskOutcome } from './dealTaskActions';
import { CompleteTaskModal } from './CompleteTaskModal';

const sampleTask: DealTask = {
  id: 'task-1',
  title: 'Upload most recent tax return',
  completed: false,
  dueDate: '2026-05-30T00:00:00Z',
  assigneeName: 'Jane Banker',
  modifiedOn: undefined,
};

function deferredOutcome(): {
  promise: Promise<CompleteTaskOutcome>;
  resolve: (o: CompleteTaskOutcome) => void;
} {
  let resolve!: (o: CompleteTaskOutcome) => void;
  const promise = new Promise<CompleteTaskOutcome>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('CompleteTaskModal', () => {
  it('disables the confirm button until a non-empty note is entered', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<CompleteTaskModal task={sampleTask} onConfirm={onConfirm} onClose={onClose} />);

    const button = screen.getByRole('button', { name: /^complete task$/i });
    expect(button).toBeDisabled();

    const user = userEvent.setup();
    const textarea = screen.getByLabelText(/completion note/i);
    await user.type(textarea, 'done');
    expect(button).not.toBeDisabled();

    await user.clear(textarea);
    await user.type(textarea, '   ');
    expect(button).toBeDisabled();
  });

  it('prevents double-submit: a second click while in-flight does not invoke onConfirm again', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();

    render(<CompleteTaskModal task={sampleTask} onConfirm={onConfirm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/completion note/i), 'received and filed');

    await user.click(screen.getByRole('button', { name: /^complete task$/i }));

    const inFlightButton = screen.getByRole('button', { name: /completing/i });
    expect(inFlightButton).toBeDisabled();

    // Second click should be a no-op.
    await user.click(inFlightButton);

    deferred.resolve({ kind: 'success' });
    await screen.findByRole('button', { name: /^close$/i });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the critical governance-partial outcome when one governance write fails', async () => {
    const onConfirm = vi.fn().mockResolvedValue({
      kind: 'governance-partial',
      auditError: 'audit unavailable',
      timelineError: undefined,
    } satisfies CompleteTaskOutcome);
    const onClose = vi.fn();

    render(<CompleteTaskModal task={sampleTask} onConfirm={onConfirm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/completion note/i), 'done');
    await user.click(screen.getByRole('button', { name: /^complete task$/i }));

    await screen.findByText(/critical: governance write failed/i);
    expect(screen.getByText(/audit unavailable/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Do not retry — the task is already updated/i),
    ).toBeInTheDocument();
  });

  it('disables Cancel while the action is in-flight', async () => {
    const deferred = deferredOutcome();
    const onConfirm = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();

    render(<CompleteTaskModal task={sampleTask} onConfirm={onConfirm} onClose={onClose} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/completion note/i), 'done');
    await user.click(screen.getByRole('button', { name: /^complete task$/i }));

    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    expect(cancel).toBeDisabled();
    await user.click(cancel);
    expect(onClose).not.toHaveBeenCalled();

    deferred.resolve({ kind: 'success' });
    await screen.findByRole('button', { name: /^close$/i });
  });
});

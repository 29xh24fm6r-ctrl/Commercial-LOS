// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddDealTaskModal, type AddDealTaskFields } from './AddDealTaskModal';
import type { CreateDealTaskOutcome } from './createDealTaskAction';
import type { AssignableUser } from './assignableUserOptions';

const SELF = { id: 'banker-self', name: 'Matthew Paller' };
const OTHERS: readonly AssignableUser[] = [
  { id: 'u-dana', name: 'Dana Assignee', email: 'dana@bank.test' },
];

function renderModal(opts: { loadAssignees?: () => Promise<readonly AssignableUser[]> } = {}) {
  const onConfirm = vi.fn(async (_f: AddDealTaskFields): Promise<CreateDealTaskOutcome> => ({ kind: 'success', taskId: 't-1' }));
  render(
    <AddDealTaskModal
      dealName="Acme Working Capital"
      self={SELF}
      onConfirm={onConfirm}
      onClose={() => {}}
      loadAssignees={opts.loadAssignees ?? (async () => OTHERS)}
    />,
  );
  return { onConfirm };
}

describe('WF-1A — AddDealTaskModal', () => {
  it('defaults the assignee to self and boards the task with the entered fields', async () => {
    const { onConfirm } = renderModal();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Task title/i), 'Order flood determination');
    await user.click(document.querySelector('[data-add-task-submit]') as HTMLButtonElement);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      taskName: 'Order flood determination',
      assigneeSystemUserId: 'banker-self',
      assigneeName: 'Matthew Paller',
    });
  });

  it('can assign to a loaded teammate', async () => {
    const { onConfirm } = renderModal();
    const user = userEvent.setup();

    const assignee = document.querySelector('[data-add-task-assignee]') as HTMLSelectElement;
    await waitFor(() => expect(within(assignee).getAllByRole('option')).toHaveLength(2)); // self + Dana
    await user.type(screen.getByLabelText(/Task title/i), 'Call borrower');
    await user.selectOptions(assignee, 'u-dana');
    await user.click(document.querySelector('[data-add-task-submit]') as HTMLButtonElement);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ assigneeSystemUserId: 'u-dana', assigneeName: 'Dana Assignee' });
  });

  it('keeps submit disabled until a title is entered', async () => {
    renderModal();
    const submit = document.querySelector('[data-add-task-submit]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('still lets you self-assign when the teammate load fails', async () => {
    const { onConfirm } = renderModal({
      loadAssignees: async () => {
        throw new Error('Timeout');
      },
    });
    const user = userEvent.setup();

    await waitFor(() => expect(document.querySelector('[data-add-task-assignee-error]')).not.toBeNull());
    await user.type(screen.getByLabelText(/Task title/i), 'Self task');
    await user.click(document.querySelector('[data-add-task-submit]') as HTMLButtonElement);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ assigneeSystemUserId: 'banker-self' });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Phase 257 — governed workspace-entitlement dropdown UI.
 *
 * Pins the governed dropdown: options from real workspace data, current
 * workspace preselected, governed apply on change, success reflected, and
 * fail-closed UI for every non-success outcome (no identity, write failure,
 * readback mismatch).
 */

const adminIdentity = {
  upn: 'admin@oldglorybank.com',
  fullName: 'Ada Admin',
  profileName: 'Admin',
  entraObjectId: 'entra-1',
  systemUserId: 'sys-admin-1' as string | undefined,
  writeDisabledReason: undefined as string | undefined,
};

vi.mock('./AdminContext', () => ({
  useAdmin: () => adminIdentity,
}));

import { WorkspaceEntitlementManager } from './WorkspaceEntitlementManager';
import type { WorkspaceEntitlementData } from './adminWorkspaceEntitlementManagement';
import type { ChangeWorkspaceInput, ChangeWorkspaceOutcome } from './workspaceEntitlementWrite';

function data(): WorkspaceEntitlementData {
  return {
    users: [
      { id: 'user-1', fullName: 'Casey Banker', email: 'casey@oldglorybank.com', currentWorkspaceId: 'ws-banker', active: true },
    ],
    workspaces: [
      { id: 'ws-banker', name: 'Banker Workspace' },
      { id: 'ws-manager', name: 'Manager Command Center' },
    ],
  };
}

beforeEach(() => {
  adminIdentity.systemUserId = 'sys-admin-1';
  adminIdentity.writeDisabledReason = undefined;
});

async function renderReady(performChange: (i: ChangeWorkspaceInput) => Promise<ChangeWorkspaceOutcome>) {
  const utils = render(
    <WorkspaceEntitlementManager loadData={async () => data()} performChange={performChange} />,
  );
  await waitFor(() => {
    expect(utils.container.querySelector('[data-entitlement-table]')).not.toBeNull();
  });
  return utils;
}

describe('Phase 257 — WorkspaceEntitlementManager governed dropdown', () => {
  it('renders a workspace dropdown per user, preselected to the current workspace', async () => {
    await renderReady(async () => ({ kind: 'success', correlationId: 'c1', workspaceName: 'X', auditId: 'a1' }));
    const select = screen.getByLabelText('Primary workspace for Casey Banker') as HTMLSelectElement;
    expect(select.value).toBe('ws-banker');
    expect(within(select).getByRole('option', { name: 'Manager Command Center' })).toBeInTheDocument();
  });

  it('keeps Apply disabled until the selection changes, then performs the governed change', async () => {
    const perform = vi.fn(async (): Promise<ChangeWorkspaceOutcome> => ({
      kind: 'success', correlationId: 'corr-9', workspaceName: 'Manager Command Center', auditId: 'audit-1',
    }));
    const { container } = await renderReady(perform);
    const apply = container.querySelector('[data-entitlement-save="user-1"]') as HTMLButtonElement;
    expect(apply).toBeDisabled();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Primary workspace for Casey Banker'), 'ws-manager');
    expect(apply).not.toBeDisabled();
    await user.click(apply);

    await waitFor(() => {
      expect(container.querySelector('[data-entitlement-result="success"]')).not.toBeNull();
    });
    expect(perform).toHaveBeenCalledWith({
      platformUserId: 'user-1',
      userDisplayName: 'Casey Banker',
      targetWorkspaceId: 'ws-manager',
      targetWorkspaceName: 'Manager Command Center',
      actorEmail: 'admin@oldglorybank.com',
      actorSystemUserId: 'sys-admin-1',
      authorized: true,
    });
    expect(screen.getByText(/Primary workspace set to Manager Command Center/i)).toBeInTheDocument();
  });

  it('surfaces a write failure honestly (not reported as applied)', async () => {
    const { container } = await renderReady(async () => ({ kind: 'write-failed', error: 'update rejected', correlationId: 'c2' }));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Primary workspace for Casey Banker'), 'ws-manager');
    await user.click(container.querySelector('[data-entitlement-save="user-1"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(container.querySelector('[data-entitlement-result="write-failed"]')).not.toBeNull();
    });
    expect(screen.getByText(/could not be written/i)).toBeInTheDocument();
    expect(container.querySelector('[data-entitlement-result="success"]')).toBeNull();
  });

  it('surfaces a readback mismatch as an unverified, non-applied change', async () => {
    const { container } = await renderReady(async () => ({
      kind: 'readback-mismatch', expectedWorkspaceId: 'ws-manager', actualWorkspaceId: 'ws-banker', correlationId: 'c3',
    }));
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Primary workspace for Casey Banker'), 'ws-manager');
    await user.click(container.querySelector('[data-entitlement-save="user-1"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(container.querySelector('[data-entitlement-result="readback-mismatch"]')).not.toBeNull();
    });
    expect(screen.getByText(/did not verify on readback/i)).toBeInTheDocument();
  });

  it('is read-only and disables controls when no Dataverse write identity is available', async () => {
    adminIdentity.systemUserId = undefined;
    adminIdentity.writeDisabledReason = 'No cr664_systemuser binding for this admin.';
    const perform = vi.fn();
    const { container } = await renderReady(perform as never);
    expect(container.querySelector('[data-entitlement-write-disabled]')).not.toBeNull();
    expect(screen.getByLabelText('Primary workspace for Casey Banker')).toBeDisabled();
    expect(container.querySelector('[data-entitlement-save="user-1"]')).toBeDisabled();
    expect(perform).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminIdentityProvider } from './AdminContext';
import { GovernedUserProvisioningPanel } from './GovernedUserProvisioningPanel';
import { LOS_PRODUCTION, type ProvisioningClient } from './governedUserProvisioning';

const identity = { status: 'verified' as const, systemUserId: '11111111-1111-1111-1111-111111111111', fullName: 'Mary Banker', upn: 'mary@oldglorybank.com', businessUnit: 'Commercial LOS', enabled: true, baseDataverseRoles: ['Basic User'], availableRoles: ['Banker', 'Admin', 'Credit Approver', 'Funding Approver'] as const, availableWorkspaces: ['Banker Workspace', 'Admin Control Center', 'Team Workspace'] as const, existingRecordIds: {} };
function renderPanel(client: ProvisioningClient, onCompleted = vi.fn()) {
  return { onCompleted, ...render(<AdminIdentityProvider value={{ upn: 'admin@oldglorybank.com', fullName: 'Admin User', profileName: 'Admin', entraObjectId: 'e1', systemUserId: 's1', writeDisabledReason: undefined }}><GovernedUserProvisioningPanel client={client} onCompleted={onCompleted} /></AdminIdentityProvider>) };
}

describe('GovernedUserProvisioningPanel', () => {
  it('verifies identity, applies Banker Tester, reviews, provisions, copies the Production link, and refreshes', async () => {
    const user = userEvent.setup(); const onCompleted = vi.fn();
    const client: ProvisioningClient = { verify: vi.fn().mockResolvedValue(identity), provision: vi.fn().mockImplementation(async (request) => ({ status: 'completed', correlationId: 'c1', verification: 'verified', recordsCreated: { userDirectory: 'u1', entitlement: 'e1' }, recordsReused: {}, recordsUpdated: {}, request })) };
    renderPanel(client, onCompleted);
    await user.click(screen.getByRole('button', { name: /add new user/i }));
    await user.type(screen.getByLabelText(/old glory bank email/i), 'mary@oldglorybank.com');
    await user.click(screen.getByRole('button', { name: /verify user/i }));
    expect(await screen.findByText(/Microsoft user found/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Provisioning template/i)).toHaveValue('Banker Tester');
    await user.click(screen.getByRole('button', { name: /review access/i }));
    expect(screen.getByText(/New user review/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create user/i }));
    expect(await screen.findByText(/User created successfully/i)).toBeInTheDocument();
    expect(client.provision).toHaveBeenCalledWith(expect.objectContaining({ roleCode: 'Banker', primaryWorkspaceCode: 'Banker Workspace', bankerRequired: true, environmentId: LOS_PRODUCTION.environmentId }));
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it('shows precise identity errors and does not advance', async () => {
    const user = userEvent.setup();
    renderPanel({ verify: vi.fn().mockRejectedValue(new Error('MICROSOFT_USER_DISABLED: The Microsoft user exists but is disabled.')), provision: vi.fn() });
    await user.click(screen.getByRole('button', { name: /add new user/i })); await user.type(screen.getByLabelText(/email/i), 'disabled@oldglorybank.com'); await user.click(screen.getByRole('button', { name: /verify user/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/MICROSOFT_USER_DISABLED/);
    expect(screen.queryByLabelText(/LOS role/i)).toBeNull();
  });

  it('blocks Admin review until the second confirmation is checked', async () => {
    const user = userEvent.setup();
    renderPanel({ verify: vi.fn().mockResolvedValue(identity), provision: vi.fn() });
    await user.click(screen.getByRole('button', { name: /add new user/i })); await user.type(screen.getByLabelText(/email/i), identity.upn); await user.click(screen.getByRole('button', { name: /verify user/i }));
    await user.selectOptions(await screen.findByLabelText(/Provisioning template/i), 'Admin Tester');
    await user.click(screen.getByRole('button', { name: /review access/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ADMIN_CONFIRMATION_REQUIRED/);
    await user.click(screen.getByLabelText(/Confirm Admin access/i)); await user.click(screen.getByRole('button', { name: /review access/i }));
    await waitFor(() => expect(screen.getByText(/New user review/i)).toBeInTheDocument());
  });

  it('does not offer creation when an existing LOS user is returned', async () => {
    const user = userEvent.setup();
    renderPanel({ verify: vi.fn().mockResolvedValue({ ...identity, status: 'existing_los_user', existingRecordIds: { platformUser: 'p1' } }), provision: vi.fn() });
    await user.click(screen.getByRole('button', { name: /add new user/i })); await user.type(screen.getByLabelText(/email/i), identity.upn); await user.click(screen.getByRole('button', { name: /verify user/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Existing LOS user found/);
    expect(screen.queryByRole('button', { name: /create user/i })).toBeNull();
  });
});

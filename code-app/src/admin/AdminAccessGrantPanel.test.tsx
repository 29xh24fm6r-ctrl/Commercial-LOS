// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./AdminContext', () => ({ useAdmin: vi.fn() }));

const tierMock = vi.fn();
const listRowsMock = vi.fn();
const listUsersMock = vi.fn();
vi.mock('./adminAccessGrantLookup', () => ({
  loadCurrentAdminAccessTier: (...a: unknown[]) => tierMock(...a),
  listAdminEntitlementRows: (...a: unknown[]) => listRowsMock(...a),
  listGrantablePlatformUsers: (...a: unknown[]) => listUsersMock(...a),
}));

const writeMock = vi.fn();
vi.mock('./adminAccessGrantWrite', () => ({
  writeAdminAccessGrant: (...a: unknown[]) => writeMock(...a),
  buildLiveAdminAccessGrantDeps: () => ({}),
}));

import { useAdmin } from './AdminContext';
import { AdminAccessGrantPanel } from './AdminAccessGrantPanel';

const useAdminMock = vi.mocked(useAdmin);

function admin(over: Partial<ReturnType<typeof useAdmin>> = {}) {
  useAdminMock.mockReturnValue({
    upn: 'admin@bank.test',
    fullName: 'Ada Admin',
    profileName: undefined,
    entraObjectId: 'e1',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    ...over,
  } as ReturnType<typeof useAdmin>);
}

const USER_JANE = { id: 'u2', upn: 'jane.doe@bank.test', fullName: 'Jane Doe' };
const ROW = { id: 'e1', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevelKind: 'Full' as const, active: true };

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ success: true, rows: [USER_JANE] });
  listRowsMock.mockResolvedValue({ success: true, rows: [ROW] });
});

describe('AdminAccessGrantPanel', () => {
  it('is read-only when no Dataverse identity is resolved', async () => {
    admin({ systemUserId: undefined, writeDisabledReason: 'No systemuser provisioned.' });
    render(<AdminAccessGrantPanel />);
    expect(document.querySelector('[data-admin-access-grant-readonly]')?.textContent).toMatch(/No systemuser/i);
    expect(tierMock).not.toHaveBeenCalled();
  });

  it('shows a blocked banner and no grant/revoke controls for a Full-tier admin', async () => {
    admin();
    tierMock.mockResolvedValue({ tier: 'full' });
    render(<AdminAccessGrantPanel />);
    await waitFor(() => expect(document.querySelector('[data-admin-access-grant-tier-blocked="full"]')).not.toBeNull());
    expect(document.querySelector('[data-admin-access-grant-submit]')).toBeNull();
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it('grants access through the governed write for an Admin-tier admin', async () => {
    admin();
    tierMock.mockResolvedValue({ tier: 'admin' });
    writeMock.mockResolvedValue({ kind: 'success', action: 'grant', label: 'Admin Full access granted to Jane Doe.', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminAccessGrantPanel />);

    await waitFor(() => expect(screen.getByText('Jane Doe (jane.doe@bank.test)')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('User to grant access to'), 'u2');
    await user.click(document.querySelector('[data-admin-access-grant-submit]') as HTMLButtonElement);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    const arg = writeMock.mock.calls[0][0] as { action: { kind: string; targetPlatformUserId: string; accessLevel: string }; actorAccessTier: string };
    expect(arg.action).toMatchObject({ kind: 'grant', targetPlatformUserId: 'u2', accessLevel: 'Full' });
    expect(arg.actorAccessTier).toBe('admin');
    expect(await screen.findByText('Admin Full access granted to Jane Doe.')).toBeInTheDocument();
  });

  it('revokes access through the governed write', async () => {
    admin();
    tierMock.mockResolvedValue({ tier: 'admin' });
    writeMock.mockResolvedValue({ kind: 'success', action: 'revoke', label: 'revoked', correlationId: 'c', auditId: 'a' });
    const user = userEvent.setup();
    render(<AdminAccessGrantPanel />);

    await waitFor(() => expect(screen.getByText('jane.doe@bank.test - Admin Full Access')).toBeInTheDocument());
    await user.click(document.querySelector('[data-admin-access-grant-revoke="e1"]') as HTMLButtonElement);

    await waitFor(() => expect(writeMock).toHaveBeenCalledTimes(1));
    const arg = writeMock.mock.calls[0][0] as { action: { kind: string; entitlementId: string } };
    expect(arg.action).toMatchObject({ kind: 'revoke', entitlementId: 'e1' });
  });

  it('surfaces an honest error banner when the entitlement list read fails', async () => {
    admin();
    tierMock.mockResolvedValue({ tier: 'admin' });
    listRowsMock.mockResolvedValue({ success: false, error: 'selecting the id failed' });
    render(<AdminAccessGrantPanel />);
    await waitFor(() => expect(screen.getByText('selecting the id failed')).toBeInTheDocument());
  });
});

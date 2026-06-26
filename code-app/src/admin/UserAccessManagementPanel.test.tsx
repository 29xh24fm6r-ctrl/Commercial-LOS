// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';

/**
 * Phase 169B -- User & Access Management panel (read-only + preview).
 */

vi.mock('./adminUserAccessQueries', () => ({
  ADMIN_USER_ACCESS_ROW_CAP: 100,
  loadAdminUserAccessSummary: vi.fn(),
}));

// The governed workspace-entitlement dropdown is a separate concern with its
// own admin-context + governed-write dependencies and dedicated test
// (WorkspaceEntitlementManager.test.tsx). Stub it here so this panel test stays
// scoped to the read-only user/entitlement read + grant-new-user preview.
vi.mock('./WorkspaceEntitlementManager', () => ({
  WorkspaceEntitlementManager: () => <div data-testid="entitlement-manager-stub" />,
}));

import { loadAdminUserAccessSummary } from './adminUserAccessQueries';
import { UserAccessManagementPanel } from './UserAccessManagementPanel';

const loadMock = vi.mocked(loadAdminUserAccessSummary);

beforeEach(() => {
  loadMock.mockReset();
});

function summary() {
  return {
    userCount: 2,
    entitlementCount: 1,
    users: [
      {
        id: 'u1',
        email: 'matt@oldglorybank.com',
        fullName: 'Matt Paller',
        primaryWorkspaceName: 'Banker Workspace',
        active: true,
        identityStatus: 'Active',
      },
      {
        id: 'u2',
        email: 'ada@oldglorybank.com',
        fullName: 'Ada Admin',
        primaryWorkspaceName: 'Admin Control Center',
        active: false,
        identityStatus: 'Disabled',
      },
    ],
    entitlements: [
      {
        id: 'e1',
        // Phase 204N — live shape: numeric access level, raw profile GUID,
        // workspace display name not selected.
        entitlementName: 'Matthew Paller - Admin Full Access',
        accessLevel: '788190002',
        workspaceName: undefined,
        profileName: '4fa22088-0c56-f111-bec7-70a8a59be491',
        isDefault: false,
      },
    ],
    usersTruncated: false,
    entitlementsTruncated: false,
  };
}

describe('Phase 169B -- panel renders real read-only data', () => {
  it('shows real counts and a read-only user table (no fabricated rows)', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-user-access-users="table"]')).not.toBeNull();
    });
    const counts = container.querySelector('[data-admin-user-access-counts]') as HTMLElement;
    expect(within(counts).getByText('2')).toBeInTheDocument(); // userCount
    expect(within(counts).getByText('1')).toBeInTheDocument(); // entitlementCount
    expect(screen.getByText('matt@oldglorybank.com')).toBeInTheDocument();
    expect(screen.getByText('Matthew Paller - Admin Full Access')).toBeInTheDocument();
  });

  it('shows access levels as a friendly label plus the raw option-set number (Phase 204N)', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-entitlement-access]')).not.toBeNull();
    });
    expect(
      container.querySelector('[data-admin-entitlement-access]')!.textContent,
    ).toBe('Admin — 788190002');
  });

  it('shows the raw profile GUID and an honest blank workspace label (Phase 204N)', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-entitlement-profile]')).not.toBeNull();
    });
    expect(container.querySelector('[data-admin-entitlement-profile]')!.textContent).toBe(
      '4fa22088-0c56-f111-bec7-70a8a59be491',
    );
    expect(container.querySelector('[data-admin-entitlement-workspace]')!.textContent).toBe(
      'Not selected by safe-read contract',
    );
  });

  it('renders the safe-read explanation copy (Phase 204N)', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-user-access-safe-read-note]')).not.toBeNull();
    });
    const note = container.querySelector('[data-admin-user-access-safe-read-note]')!;
    expect(note.textContent).toMatch(/intentionally not selected from Dataverse/i);
    expect(note.textContent).toMatch(/live-safe entitlement fields only/i);
  });

  it('Phase 259: replaces the disabled grant-access preview form with operator guidance', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    // The disabled preview form is gone.
    expect(container.querySelector('[data-admin-grant-submit]')).toBeNull();
    expect(container.querySelector('[data-admin-grant-field="email"]')).toBeNull();
    // Honest operator guidance is shown instead.
    const guidance = container.querySelector('[data-admin-user-access-add-guidance]');
    expect(guidance?.textContent).toMatch(/provisioned by an operator/i);
    expect(guidance?.textContent).toMatch(/Workspace entitlement/i);
  });

  it('fails closed to "Not available" when the read rejects', async () => {
    loadMock.mockRejectedValue(new Error('Dataverse denied'));
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(
        container.querySelector('[data-admin-user-access-users="unavailable"]'),
      ).not.toBeNull();
    });
    expect(screen.getAllByText(/Not available/i).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a sanitized failure category labeling which read failed (Phase 204M)', async () => {
    loadMock.mockRejectedValue(
      new Error('Admin user access platform-user read failed: boom'),
    );
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-user-access-failure]')).not.toBeNull();
    });
    const note = container.querySelector('[data-admin-user-access-failure]')!;
    expect(note.textContent).toMatch(/Platform-user read failed\./);
    // The raw payload detail is NOT surfaced.
    expect(note.textContent).not.toMatch(/boom/);
  });
});

describe('Phase 169B -- panel keeps writes disabled and discloses scope', () => {
  it('shows the app-level-vs-Dataverse-security disclaimer', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    const disclaimer = container.querySelector('[data-admin-user-access-disclaimer]');
    expect(disclaimer?.textContent).toMatch(/does not grant Microsoft tenant access or Dataverse security roles/i);
  });

  it('Phase 259: exposes no disabled add-user write control', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    expect(container.querySelector('[data-admin-grant-submit]')).toBeNull();
    expect(container.querySelector('[data-admin-user-access-blocker]')).toBeNull();
  });

  it('shows the Power Platform admin center role notice', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    const notice = container.querySelector('[data-admin-user-access-role-notice]');
    expect(notice?.textContent).toMatch(/Power Platform admin center/i);
  });

  it('has no enabled write button anywhere in the panel', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    await waitFor(() => {
      expect(container.querySelector('[data-admin-user-access-users="table"]')).not.toBeNull();
    });
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect(b).toBeDisabled();
    }
  });
});

describe('Phase 169B -- panel source discipline', () => {
  const SRC = readFileSync(resolve(__dirname, 'UserAccessManagementPanel.tsx'), 'utf8');

  it('introduces no fetch / XHR / Graph / Dataverse write call', () => {
    expect(SRC).not.toMatch(/\bfetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/graph\.microsoft\.com/i);
    expect(SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(SRC).not.toMatch(/\.create\(|\.update\(|\.delete\(/);
  });
});

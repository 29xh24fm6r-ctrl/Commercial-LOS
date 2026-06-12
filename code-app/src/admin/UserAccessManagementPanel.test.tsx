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
        entitlementName: 'Banker Workspace (ReadOnly)',
        accessLevel: 'ReadOnly',
        workspaceName: 'Banker Workspace',
        profileName: 'Matt Paller',
        isDefault: true,
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
    expect(screen.getByText('Banker Workspace (ReadOnly)')).toBeInTheDocument();
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
});

describe('Phase 169B -- panel keeps writes disabled and discloses scope', () => {
  it('shows the app-level-vs-Dataverse-security disclaimer', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    const disclaimer = container.querySelector('[data-admin-user-access-disclaimer]');
    expect(disclaimer?.textContent).toMatch(/does not grant Microsoft tenant access or Dataverse security roles/i);
  });

  it('renders the grant form with a DISABLED submit and the exact blocker', async () => {
    loadMock.mockResolvedValue(summary());
    const { container } = render(<UserAccessManagementPanel />);
    const submit = container.querySelector('[data-admin-grant-submit]') as HTMLButtonElement;
    expect(submit).not.toBeNull();
    expect(submit).toBeDisabled();
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    const blocker = container.querySelector('[data-admin-user-access-blocker]');
    expect(blocker?.textContent).toMatch(/No governed app-level entitlement write adapter exists/i);
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

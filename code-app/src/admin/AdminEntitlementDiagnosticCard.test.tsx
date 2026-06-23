// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import type { AdminEntitlementDiagnostic } from './adminWorkspaceEntitlementQuery';

/**
 * Phase 204G — the diagnostic card is READ-ONLY: it renders the live probe's gate
 * detail with no buttons, no forms, no write affordances, and shows only sanitized
 * values. These tests pin that contract.
 */

const { useBootstrapMock } = vi.hoisted(() => ({ useBootstrapMock: vi.fn() }));
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: useBootstrapMock,
}));

const { loadDiagMock } = vi.hoisted(() => ({ loadDiagMock: vi.fn() }));
vi.mock('./adminWorkspaceEntitlementQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adminWorkspaceEntitlementQuery')>();
  return { ...actual, loadAdminWorkspaceEntitlementDiagnostic: loadDiagMock };
});

import { AdminEntitlementDiagnosticCard } from './AdminEntitlementDiagnosticCard';

const DIAG: AdminEntitlementDiagnostic = {
  platformUserFound: true,
  platformUserUsable: true,
  platformUserFullName: 'Matthew Paller',
  platformUserEmail: 'banker@oldglorybank.com',
  profileIdsCount: 0,
  entitlementQuerySuccess: true,
  entitlementRowsReturned: 1,
  rows: [
    {
      entitlementName: 'Generic Access',
      accessLevelRaw: '788190002',
      accessLevelKind: 'Admin',
      active: true,
      workspaceName: 'Admin Control Center',
      losUserProfileName: 'banker@oldglorybank.com',
      hasAdminName: false,
      hasAdminWorkspace: true,
      identityMatched: true,
      identityMatchReason: 'profile-label-upn',
      finalEligible: true,
    },
  ],
  finalResult: 'entitled',
  failureSummary: '',
};

beforeEach(() => {
  useBootstrapMock.mockReset();
  loadDiagMock.mockReset();
  useBootstrapMock.mockReturnValue({ upn: 'banker@oldglorybank.com', fullName: 'Matthew Paller' });
  loadDiagMock.mockResolvedValue(DIAG);
});

describe('Phase 204G — AdminEntitlementDiagnosticCard', () => {
  it('renders the temporary-phase title and the probe gate detail', async () => {
    render(<AdminEntitlementDiagnosticCard />);
    expect(screen.getByText(/Admin Entitlement Diagnostic — temporary Phase 204G/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('entitled')).toBeInTheDocument());
    // gate booleans / reason surfaced
    expect(screen.getByText('profile-label-upn')).toBeInTheDocument();
  });

  it('renders the Phase 204K visible build stamp so the live UI proves it is current', () => {
    render(<AdminEntitlementDiagnosticCard />);
    expect(
      screen.getByText('Diagnostic build: Phase 204K / four-field workspace entitlement read / master 6d806e3'),
    ).toBeInTheDocument();
  });

  it('renders the Phase 204K workspace-not-selected note', () => {
    render(<AdminEntitlementDiagnosticCard />);
    expect(
      screen.getByText('Workspace display name not selected; entitlement-name gate used.'),
    ).toBeInTheDocument();
  });

  it('is strictly read-only — no buttons, no forms, no write handlers in the DOM', async () => {
    const { container } = render(<AdminEntitlementDiagnosticCard />);
    await waitFor(() => expect(screen.getByText('entitled')).toBeInTheDocument());
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('form').length).toBe(0);
    expect(container.querySelectorAll('input,textarea,select').length).toBe(0);
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
  });

  it('passes the signed-in UPN to the probe diagnostic', async () => {
    render(<AdminEntitlementDiagnosticCard />);
    await waitFor(() => expect(loadDiagMock).toHaveBeenCalledWith('banker@oldglorybank.com'));
  });
});

describe('Phase 204G — card source is read-only and SDK-free', () => {
  const SRC = readFileSync(resolve(__dirname, 'AdminEntitlementDiagnosticCard.tsx'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

  it('has no write affordance, no onClick/onSubmit, no generated/SDK import', () => {
    expect(CODE).not.toMatch(/<button/i);
    expect(CODE).not.toMatch(/<form\b/i);
    expect(CODE).not.toMatch(/\bonSubmit\b/);
    expect(CODE).not.toMatch(/\bonClick\b/);
    expect(CODE).not.toMatch(/SendEmail|Office365|microsoft-graph/i);
    expect(CODE).not.toMatch(/from ['"][^'"]*\/generated\//);
  });

  it('contains no hard-coded operator email literal', () => {
    expect(CODE).not.toMatch(/mpaller@/i);
  });
});

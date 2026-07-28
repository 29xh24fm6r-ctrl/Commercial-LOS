// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Phase 257 — Admin shell consistency.
 *
 * The admin workspace must render inside the SAME Lending OS left-sidebar
 * shell (LendingOSLayout) as the banker / manager / executive / team
 * workspaces, so the admin route keeps the left hero/sidebar visible.
 * Authorization gating is unchanged — AdminProvider still wraps the
 * content and the route is still behind WorkspaceGate / the console's
 * fail-closed re-check.
 *
 * The many diagnostic panels carry live data dependencies, so they are
 * stubbed here; this test pins the SHELL composition, not panel internals.
 */

// Identity + provider plumbing.
vi.mock('../admin/AdminProvider', () => ({
  AdminProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-provider">{children}</div>
  ),
}));
vi.mock('../admin/AdminDataProvider', () => ({
  AdminDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../admin/AdminContext', () => ({
  useAdmin: () => ({
    upn: 'admin@oldglorybank.com',
    fullName: 'Ada Admin',
    profileName: 'Admin',
    entraObjectId: 'entra-1',
    systemUserId: 'sys-admin-1',
    writeDisabledReason: undefined,
  }),
}));

// Stub every diagnostic panel to a marker so the test isolates the shell.
// Factories are hoisted, so each must be self-contained (no outer refs).
vi.mock('../admin/AdminOperationsConsole', () => ({ AdminOperationsConsole: () => <div data-testid="panel-AdminOperationsConsole">AdminOperationsConsole</div> }));
vi.mock('../admin/SystemHealthSummary', () => ({ SystemHealthSummary: () => <div data-testid="panel-SystemHealthSummary" /> }));
vi.mock('../admin/DataQualityFlags', () => ({ DataQualityFlags: () => <div data-testid="panel-DataQualityFlags" /> }));
vi.mock('../admin/AuditAnomalies', () => ({ AuditAnomalies: () => <div data-testid="panel-AuditAnomalies" /> }));
vi.mock('../admin/RefreshStatus', () => ({ RefreshStatus: () => <div data-testid="panel-RefreshStatus" /> }));
vi.mock('../admin/AlertBacklog', () => ({ AlertBacklog: () => <div data-testid="panel-AlertBacklog" /> }));
vi.mock('../admin/ConfigurationOverview', () => ({ ConfigurationOverview: () => <div data-testid="panel-ConfigurationOverview" /> }));
vi.mock('../admin/StageGovernanceDiagnostics', () => ({ StageGovernanceDiagnostics: () => <div data-testid="panel-StageGovernanceDiagnostics" /> }));
vi.mock('../admin/ReleaseReadinessGate', () => ({ ReleaseReadinessGate: () => <div data-testid="panel-ReleaseReadinessGate" /> }));
vi.mock('../admin/OgbCrmWorkflowActivationPanel', () => ({ OgbCrmWorkflowActivationPanel: () => <div data-testid="panel-OgbCrmWorkflowActivationPanel" /> }));
vi.mock('../admin/EliteCrmLosActivationReadinessPanel', () => ({ EliteCrmLosActivationReadinessPanel: () => <div data-testid="panel-EliteCrmLosActivationReadinessPanel" /> }));
vi.mock('../admin/V1ActivationReadinessPanel', () => ({ V1ActivationReadinessPanel: () => <div data-testid="panel-V1ActivationReadinessPanel" /> }));
vi.mock('../admin/FullSystemLaunchReadinessConsole', () => ({ FullSystemLaunchReadinessConsole: () => <div data-testid="panel-FullSystemLaunchReadinessConsole" /> }));
vi.mock('../admin/AdminOperatorActionQueue', () => ({ AdminOperatorActionQueue: () => <div data-testid="panel-AdminOperatorActionQueue" /> }));
vi.mock('../admin/V1GoLiveReleaseCertificationPanel', () => ({ V1GoLiveReleaseCertificationPanel: () => <div data-testid="panel-V1GoLiveReleaseCertificationPanel" /> }));
vi.mock('../admin/FullSystemActivationLaunchPanel', () => ({ FullSystemActivationLaunchPanel: () => <div data-testid="panel-FullSystemActivationLaunchPanel" /> }));
vi.mock('../admin/PerformanceDiagnostics', () => ({ PerformanceDiagnostics: () => <div data-testid="panel-PerformanceDiagnostics" /> }));
vi.mock('../admin/EmailLiveDiagnostics', () => ({ EmailLiveDiagnostics: () => <div data-testid="panel-EmailLiveDiagnostics" /> }));
vi.mock('../admin/PlatformOperationsWorkspacePanel', () => ({ PlatformOperationsWorkspacePanel: () => <div data-testid="panel-PlatformOperationsWorkspacePanel" /> }));
vi.mock('../admin/AdminCapabilityTruthMatrix', () => ({ AdminCapabilityTruthMatrix: () => <div data-testid="panel-AdminCapabilityTruthMatrix" /> }));
vi.mock('../admin/AdminDurableRecordCapabilityPanel', () => ({ AdminDurableRecordCapabilityPanel: () => <div data-testid="panel-AdminDurableRecordCapabilityPanel" /> }));
vi.mock('../admin/FinalOperatingCertificationPanel', () => ({ FinalOperatingCertificationPanel: () => <div data-testid="panel-FinalOperatingCertificationPanel" /> }));
vi.mock('../admin/AdminDataQualityDetectionPanel', () => ({ AdminDataQualityDetectionPanel: () => <div data-testid="panel-AdminDataQualityDetectionPanel" /> }));
vi.mock('../admin/TestDataView', () => ({ TestDataView: () => <div data-testid="panel-TestDataView" /> }));

import { AdminWorkspace } from './AdminWorkspace';

function renderAdmin() {
  return render(
    <MemoryRouter>
      <AdminWorkspace />
    </MemoryRouter>,
  );
}

describe('Phase 257 — AdminWorkspace renders inside the Lending OS sidebar shell', () => {
  it('renders the Lending OS left sidebar (hero + nav) around the admin content', () => {
    renderAdmin();
    const nav = screen.getByRole('navigation', { name: /lending os navigation/i });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText('Lending OS')).toBeInTheDocument();
    expect(within(nav).getByText('Old Glory Bank')).toBeInTheDocument();
  });

  it('keeps the admin content (Admin Diagnostics) inside the shell content column', () => {
    const { container } = renderAdmin();
    expect(screen.getByRole('heading', { name: /admin diagnostics/i })).toBeInTheDocument();
    expect(container.querySelector('[data-admin-workspace-shell="lending-os"]')).not.toBeNull();
    // The operations console still mounts (gating surface preserved).
    expect(screen.getByTestId('panel-AdminOperationsConsole')).toBeInTheDocument();
  });

  it('shows the signed-in admin identity in the sidebar identity card', () => {
    renderAdmin();
    const identity = screen.getByLabelText('Signed in banker');
    expect(within(identity).getByText('Ada Admin')).toBeInTheDocument();
    expect(within(identity).getByText('admin@oldglorybank.com')).toBeInTheDocument();
  });

  it('still wraps content in the AdminProvider (authorization plumbing preserved)', () => {
    renderAdmin();
    // AdminProvider marker wraps the shell; nav lives inside it.
    const provider = screen.getByTestId('admin-provider');
    expect(
      within(provider).getByRole('navigation', { name: /lending os navigation/i }),
    ).toBeInTheDocument();
  });

  it('mounts one final certification verdict and retires competing legacy projections', () => {
    renderAdmin();
    expect(screen.getByTestId('panel-FinalOperatingCertificationPanel')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-ReleaseReadinessGate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-V1GoLiveReleaseCertificationPanel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-FullSystemActivationLaunchPanel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-OgbCrmWorkflowActivationPanel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-EliteCrmLosActivationReadinessPanel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-V1ActivationReadinessPanel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel-FullSystemLaunchReadinessConsole')).not.toBeInTheDocument();
  });
});

import { AdminProvider } from '../admin/AdminProvider';
import { AdminDataProvider } from '../admin/AdminDataProvider';
import { useAdmin } from '../admin/AdminContext';
import { AdminOperationsConsole } from '../admin/AdminOperationsConsole';
import { SystemHealthSummary } from '../admin/SystemHealthSummary';
import { DataQualityFlags } from '../admin/DataQualityFlags';
import { AuditAnomalies } from '../admin/AuditAnomalies';
import { RefreshStatus } from '../admin/RefreshStatus';
import { AlertBacklog } from '../admin/AlertBacklog';
import { ConfigurationOverview } from '../admin/ConfigurationOverview';
import { StageGovernanceDiagnostics } from '../admin/StageGovernanceDiagnostics';
import { ReleaseReadinessGate } from '../admin/ReleaseReadinessGate';
import { OgbCrmWorkflowActivationPanel } from '../admin/OgbCrmWorkflowActivationPanel';
import { EliteCrmLosActivationReadinessPanel } from '../admin/EliteCrmLosActivationReadinessPanel';
import { V1ActivationReadinessPanel } from '../admin/V1ActivationReadinessPanel';
import { FullSystemLaunchReadinessConsole } from '../admin/FullSystemLaunchReadinessConsole';
import { AdminOperatorActionQueue } from '../admin/AdminOperatorActionQueue';
import { V1GoLiveReleaseCertificationPanel } from '../admin/V1GoLiveReleaseCertificationPanel';
import { FullSystemActivationLaunchPanel } from '../admin/FullSystemActivationLaunchPanel';
import { PerformanceDiagnostics } from '../admin/PerformanceDiagnostics';
import { EmailLiveDiagnostics } from '../admin/EmailLiveDiagnostics';
import { AdminDealReferenceValues } from '../admin/AdminDealReferenceValues';
import { AdminLoanRemovalPanel } from '../admin/AdminLoanRemovalPanel';
import { PlatformOperationsWorkspacePanel } from '../admin/PlatformOperationsWorkspacePanel';
import { TestDataView } from '../admin/TestDataView';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { palette, spacing, typography } from '../shared/theme';

export function AdminWorkspace() {
  return (
    <AdminProvider>
      <AdminDataProvider>
        <AdminWorkspaceContent />
      </AdminDataProvider>
    </AdminProvider>
  );
}

function AdminWorkspaceContent() {
  const { fullName, upn } = useAdmin();
  return (
    // Phase 257 — admin shares the same Lending OS left-sidebar shell as the
    // banker/manager/executive/team workspaces so the admin route keeps the
    // left hero/sidebar visible. `onNavSelect` is intentionally omitted: the
    // banker nav items are non-interactive here (admin is a distinct route),
    // matching the Manager/Executive/Team shells. Authorization is unchanged:
    // the surrounding WorkspaceGate + AdminProvider gate still apply.
    <LendingOSLayout
      activeNav="dashboard"
      fullName={fullName}
      email={upn}
      workspaceName="Admin Control Center"
    >
      <div style={styles.page} data-admin-workspace-shell="lending-os">
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending Â· Governance</div>
          <h1 style={styles.title}>Admin Diagnostics</h1>
          <p style={styles.subtitle}>
            Operational control tower: data quality, audit anomalies, alert backlog,
            snapshot freshness, configuration, and governed app-level access.
            Governance and audit detail live here.
          </p>
        </div>
        <div style={styles.context} aria-label="Admin context">
          <div style={styles.contextLabel}>Signed in</div>
          <div style={styles.contextValue}>{fullName}</div>
          <div style={styles.contextEmail}>{upn}</div>
        </div>
      </header>
      <main style={styles.main}>
        <AdminOperationsConsole />
        {/* Factory Arc Phase 4 — Platform Operations Workspace: the 12-capability
            runtime/wiring/audit console (Runtime Capabilities, Dataverse Bindings,
            Smoke Evidence, Deployment Version, Feature Activation, Audit History).
            Admin-only (inherits the WorkspaceGate route + adminWorkspaceEntitlementQuery
            live entitlement gate) — bankers cannot reach this data, not merely have it
            hidden by CSS. Placed first among the launch/readiness panels since it is the
            live, operational replacement this phase's brief describes; the legacy
            static launch-readiness panels below remain for now (Phase 5 retires them
            from runtime UI). */}
        <PlatformOperationsWorkspacePanel />
        <ReleaseReadinessGate />
        {/* Phase 236: read-only V1.0 go-live release certification — the single
            leadership answer (operating restart ready; live-write expansion gated).
            No mutation, no gate flip, no action affordance. Admin-only. */}
        <V1GoLiveReleaseCertificationPanel />
        {/* Phase 237: read-only full system activation launch certification — the
            six live-write domains classified CERTIFIABLE_NOW / NEEDS_COMPLETION /
            NOT_SAFE_TO_ENABLE with exact blockers and operator unblock actions. No
            gate flip, no mutation, no action affordance. Admin-only. */}
        <FullSystemActivationLaunchPanel />
        {/* Phase 202: read-only OGB CRM / Lending Workflow activation status,
            admin-only (inherits the admin route + AdminProvider gate). */}
        <EliteCrmLosActivationReadinessPanel />
        <OgbCrmWorkflowActivationPanel />
        {/* Phase 203: read-only final V1 activation readiness gate, admin-only
            (inherits the admin route + AdminProvider gate). */}
        <V1ActivationReadinessPanel />
        {/* Phase 198: read-only full-system launch readiness, admin-only (inherits
            the WorkspaceGate admin route + AdminProvider identity gate). No new
            route, no entitlement widening, no action affordance. */}
        <FullSystemLaunchReadinessConsole />
        {/* Phase 234: read-only admin operator action queue — groups remaining
            readiness blockers into operator tasks by category. No mutation, no
            gate flip, no action affordance. Admin-only (inherits the route gate). */}
        <AdminOperatorActionQueue />
        <SystemHealthSummary />
        <div style={styles.twoCol}>
          <DataQualityFlags />
          <AuditAnomalies />
        </div>
        {/* PR 104 -- labeled test-data view: the classification every
            operational query's exclusion policy assumes (SYSTEM TEST -,
            [SMOKE TEST], [QA], [DEMO], ...) surfaced for an admin to see,
            not just an invisible filter. */}
        <TestDataView />
        <div style={styles.twoCol}>
          <AlertBacklog />
          <RefreshStatus />
        </div>
        <ConfigurationOverview />
        {/* Phase 4A — admin-managed deal dropdown values (Product Type / Loan
            Structure / Pricing Type). The first admin CONFIG-write panel; writes
            are fail-closed to a resolved Dataverse identity, readback-verified,
            and audited (inherits the admin route + AdminProvider gate). */}
        <AdminDealReferenceValues />
        {/* Admin-managed removal of a pipeline deal or a boarded portfolio loan.
            No hard delete exists anywhere in this app (see dealRemovalWrite.ts /
            portfolioLoanRemovalWrite.ts for why); this is a governed, audited,
            reversible withdrawal that hides the loan from every active view. */}
        <AdminLoanRemovalPanel />
        <StageGovernanceDiagnostics />
        <EmailLiveDiagnostics />
        <PerformanceDiagnostics />
      </main>
      </div>
    </LendingOSLayout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: typography.family,
    minHeight: '100vh',
    color: palette.text,
    background: palette.pageBg,
  },
  header: {
    padding: `${spacing.xl} ${spacing.xxl}`,
    background: palette.surface,
    borderBottom: `1px solid ${palette.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  titleBlock: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.primary,
    fontWeight: typography.weight.semibold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 720,
  },
  context: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  contextLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  contextValue: {
    fontWeight: typography.weight.semibold,
    color: palette.text,
    fontSize: typography.size.base,
  },
  contextEmail: { color: palette.textMuted, fontSize: typography.size.sm },
  main: { padding: `${spacing.xl} ${spacing.xxl}` },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: spacing.lg,
  },
};

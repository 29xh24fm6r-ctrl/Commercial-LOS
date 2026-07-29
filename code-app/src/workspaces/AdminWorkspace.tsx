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
import { AdminOperatorActionQueue } from '../admin/AdminOperatorActionQueue';
import { FinalOperatingCertificationPanel } from '../admin/FinalOperatingCertificationPanel';
import { PerformanceDiagnostics } from '../admin/PerformanceDiagnostics';
import { EmailLiveDiagnostics } from '../admin/EmailLiveDiagnostics';
import { AdminDealReferenceValues } from '../admin/AdminDealReferenceValues';
import { AdminLoanRemovalPanel } from '../admin/AdminLoanRemovalPanel';
import { AdminAssignServicingOwnerPanel } from '../admin/AdminAssignServicingOwnerPanel';
import { PlatformOperationsWorkspacePanel } from '../admin/PlatformOperationsWorkspacePanel';
import { AdminCapabilityTruthMatrix } from '../admin/AdminCapabilityTruthMatrix';
import { AdminDurableRecordCapabilityPanel } from '../admin/AdminDurableRecordCapabilityPanel';
import { AdminDataQualityDetectionPanel } from '../admin/AdminDataQualityDetectionPanel';
import { TestDataView } from '../admin/TestDataView';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
} from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
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
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const managerEntitled =
    bootstrap.route === WORKSPACE_ROUTES.manager ||
    entitled.routes.includes(WORKSPACE_ROUTES.manager);
  // Admin is a control-center surface, not a smaller workspace universe. Keep
  // the same entitlement-derived workspace switcher visible here that the
  // banker/team/manager shells render, without inventing access a user does
  // not already have.
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.admin,
    entitledRoutes: entitled.routes,
    includePortfolioSurface: managerEntitled,
  });
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
      workspaceLinks={workspaceLinks}
    >
      <div style={styles.page} data-admin-workspace-shell="lending-os">
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending · Governance</div>
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
            live operational capability view. PR E retires the competing legacy
            readiness projections from runtime composition. */}
        <PlatformOperationsWorkspacePanel />
        <FinalOperatingCertificationPanel />
        <AdminCapabilityTruthMatrix />
        {/* Final LOS Completion arc (Workstream M) -- records the six durable-record
            governed writes Workstreams C/D/E/F/H/J shipped and each one's domain status
            vocabulary, complementing the authoritative matrix above. */}
        <AdminDurableRecordCapabilityPanel />
        {/* PR E retires the seven competing legacy readiness/certification projections from
            runtime composition. Their source and focused tests remain for history, while the
            evidence-backed Final Operating Certification above is the single verdict. */}
        <AdminOperatorActionQueue />
        <SystemHealthSummary />
        <div style={styles.twoCol}>
          <DataQualityFlags />
          <AuditAnomalies />
        </div>
        <AdminDataQualityDetectionPanel />
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
        {/* Final LOS Completion arc (Workstream 146-E) -- governed assignment of the
            cr664_AssignedServicingOwner systemuser lookup, the durable fact
            BOARDED:servicing_owner (loanWorkflowRequirementEngine.ts) checks for. Until this
            panel, nothing anywhere wrote this field. */}
        <div id="assign-servicing-owner">
          <AdminAssignServicingOwnerPanel />
        </div>
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

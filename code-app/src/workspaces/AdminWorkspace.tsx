import { AdminProvider } from '../admin/AdminProvider';
import { AdminDataProvider } from '../admin/AdminDataProvider';
import { useAdmin } from '../admin/AdminContext';
import { SystemHealthSummary } from '../admin/SystemHealthSummary';
import { DataQualityFlags } from '../admin/DataQualityFlags';
import { AuditAnomalies } from '../admin/AuditAnomalies';
import { RefreshStatus } from '../admin/RefreshStatus';
import { AlertBacklog } from '../admin/AlertBacklog';
import { ConfigurationOverview } from '../admin/ConfigurationOverview';
import { StageGovernanceDiagnostics } from '../admin/StageGovernanceDiagnostics';
import { ReleaseReadinessGate } from '../admin/ReleaseReadinessGate';
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
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending · Governance</div>
          <h1 style={styles.title}>Admin Diagnostics</h1>
          <p style={styles.subtitle}>
            Operational control tower: data quality, audit anomalies, alert backlog,
            snapshot freshness, and configuration. Read-only; remediation actions
            land in a later phase.
          </p>
        </div>
        <div style={styles.context} aria-label="Admin context">
          <div style={styles.contextLabel}>Signed in</div>
          <div style={styles.contextValue}>{fullName}</div>
          <div style={styles.contextEmail}>{upn}</div>
        </div>
      </header>
      <main style={styles.main}>
        <ReleaseReadinessGate />
        <SystemHealthSummary />
        <div style={styles.twoCol}>
          <DataQualityFlags />
          <AuditAnomalies />
        </div>
        <div style={styles.twoCol}>
          <AlertBacklog />
          <RefreshStatus />
        </div>
        <ConfigurationOverview />
        <StageGovernanceDiagnostics />
      </main>
    </div>
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

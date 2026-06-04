import { ExecutiveProvider } from '../executive/ExecutiveProvider';
import { ExecutiveDataProvider } from '../executive/ExecutiveDataProvider';
import { useExecutive } from '../executive/ExecutiveContext';
import { ExecutiveCommandCenter } from '../executive/ExecutiveCommandCenter';
import { PortfolioSummary } from '../executive/PortfolioSummary';
import { AtRiskPortfolioSummary } from '../executive/AtRiskPortfolioSummary';
import { BankerProductionRollup } from '../executive/BankerProductionRollup';
import { PipelineByStage } from '../executive/PipelineByStage';
import { MonthlyClosingForecast } from '../executive/MonthlyClosingForecast';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
} from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { palette, spacing, typography } from '../shared/theme';

/**
 * Phase 133A — Executive Workspace.
 *
 * Permission-before-render: `ExecutiveProvider` is the executive
 * identity boundary (adapted from the already-authorized bootstrap
 * context). Data only loads inside `ExecutiveDataProvider`, nested
 * within that boundary — child data is never queried before the
 * workspace is authorized.
 *
 * SPEC W2 isolation preserved: the Executive Workspace consumes ONLY
 * `ExecutiveDataProvider` (governed snapshots + transitional
 * aggregates). It does NOT mount BankerProvider / ManagerProvider or
 * query their operational data.
 */
export function ExecutiveWorkspace() {
  return (
    <ExecutiveProvider>
      <ExecutiveDataProvider>
        <ExecutiveWorkspaceContent />
      </ExecutiveDataProvider>
    </ExecutiveProvider>
  );
}

function ExecutiveWorkspaceContent() {
  const { fullName, upn } = useExecutive();
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  // Surface the Portfolio switcher entry only for users who are also
  // manager-entitled (the same probe that widens the manager route).
  const managerEntitled = entitled.routes.includes(WORKSPACE_ROUTES.manager);
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.executive,
    entitledRoutes: entitled.routes,
    includePortfolioSurface: managerEntitled,
  });
  const showInlineSwitcher = workspaceLinks.length >= 2;

  return (
    <LendingOSLayout
      activeNav="dashboard"
      fullName={fullName}
      email={upn}
      workspaceName="Executive Workspace"
      workspaceLinks={workspaceLinks}
    >
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <div style={styles.eyebrow}>Commercial Lending · Board-safe view</div>
            <h1 style={styles.title}>Executive Command Center</h1>
            <p style={styles.subtitle}>
              Board-safe executive overview — a read-only command center
              followed by supporting snapshot detail, derived only from lending
              records currently authorized to this workspace.
            </p>
          </div>
          <div style={styles.context} aria-label="Executive context">
            {showInlineSwitcher && (
              <WorkspaceSwitcher
                links={workspaceLinks}
                tone="light"
                aria-label="Executive workspace switcher"
              />
            )}
            <div style={styles.contextLabel}>Signed in</div>
            <div style={styles.contextValue}>{fullName}</div>
            <div style={styles.contextEmail}>{upn}</div>
          </div>
        </header>
        <main style={styles.main}>
          {/* Phase 133A — the command center is the lead executive cockpit. */}
          <ExecutiveCommandCenter />
          {/* Existing board-safe snapshot cards remain below as detail. */}
          <PortfolioSummary />
          <AtRiskPortfolioSummary />
          <BankerProductionRollup />
          <div style={styles.twoCol}>
            <PipelineByStage />
            <MonthlyClosingForecast />
          </div>
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
    maxWidth: 680,
  },
  context: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: spacing.lg,
  },
};

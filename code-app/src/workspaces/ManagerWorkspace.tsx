import { ManagerProvider } from '../manager/ManagerProvider';
import { ManagerDataProvider } from '../manager/ManagerDataProvider';
import { useManager } from '../manager/ManagerContext';
import { ManagerBloombergControlPanel } from '../manager/ManagerBloombergControlPanel';
import { TeamPipelineSummary } from '../manager/TeamPipelineSummary';
import { TeamWorkQueue } from '../manager/TeamWorkQueue';
import { ManagerAutopilotRollup } from '../manager/ManagerAutopilotRollup';
import { ManagerMorningCatchUp } from '../manager/ManagerMorningCatchUp';
import { ManagerRelationshipMemory } from '../manager/ManagerRelationshipMemory';
import {
  ManagerBankerFilterControl,
  ManagerBankerFilterProvider,
} from '../manager/ManagerBankerFilter';
import { DealsByStage } from '../manager/DealsByStage';
import { AtRiskBlockedDeals } from '../manager/AtRiskBlockedDeals';
import { BankerWorkloadSummary } from '../manager/BankerWorkloadSummary';
import { ClosingForecast } from '../manager/ClosingForecast';
import { ManagerActivitySummary } from '../manager/ActivitySummary';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
} from '../bootstrap/workspaceEntitlements';
import {
  WORKSPACE_ROUTES,
  isPortfolioWorkspaceName,
} from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { PortfolioCommandCenter } from '../portfolio/PortfolioCommandCenter';
import { palette, spacing, typography } from '../shared/theme';

export function ManagerWorkspace() {
  return (
    <ManagerProvider>
      <ManagerDataProvider>
        <ManagerBankerFilterProvider>
          <ManagerWorkspaceContent />
        </ManagerBankerFilterProvider>
      </ManagerDataProvider>
    </ManagerProvider>
  );
}

function ManagerWorkspaceContent() {
  const { fullName, email, teamName } = useManager();
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.manager,
    entitledRoutes: entitled.routes,
  });
  const showInlineSwitcher = workspaceLinks.length >= 2;
  // Phase 126B — when the bootstrap-resolved workspace name matches
  // a Portfolio alias (Phase 116 maps 'Portfolio Management' → the
  // manager route), swap the primary cockpit to the
  // PortfolioCommandCenter so the same authorized team-scoped data
  // renders through an exposure / mix / concentration lens.
  // ManagerDataProvider, LendingOSLayout shell, workspace switcher,
  // and the existing nine manager cards all stay mounted — only
  // the lead cockpit + header copy + sidebar pill label swap.
  const isPortfolio = isPortfolioWorkspaceName(bootstrap.workspaceName);
  const shellWorkspaceName = isPortfolio
    ? 'Portfolio Workspace'
    : 'Manager Workspace';
  const headerTitle = isPortfolio
    ? 'Portfolio Command Center'
    : 'Manager Command Center';
  const headerSubtitle = isPortfolio
    ? 'Live authorized portfolio exposure, mix, and risk roll-up.'
    : 'Team pipeline health, banker production, and risk roll-up.';
  const headerContextAria = isPortfolio ? 'Portfolio context' : 'Manager context';
  const switcherAria = isPortfolio
    ? 'Portfolio workspace switcher'
    : 'Manager workspace switcher';

  // Phase 124E — wrap the manager body in the same LendingOSLayout
  // shell the banker workspace uses so the dark left toolbar +
  // workspace switcher render consistently across role surfaces.
  // `onNavSelect` is intentionally undefined — the Lending OS
  // sidebar nav items are banker-coded and remain non-interactive
  // on the manager + portfolio surfaces for now.
  return (
    <LendingOSLayout
      activeNav="dashboard"
      fullName={fullName}
      email={email}
      workspaceName={shellWorkspaceName}
      workspaceLinks={workspaceLinks}
    >
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <div style={styles.eyebrow}>Commercial Lending</div>
            <h1 style={styles.title}>{headerTitle}</h1>
            <p style={styles.subtitle}>{headerSubtitle}</p>
          </div>
          <div style={styles.context} aria-label={headerContextAria}>
            {showInlineSwitcher && (
              <WorkspaceSwitcher
                links={workspaceLinks}
                tone="light"
                aria-label={switcherAria}
              />
            )}
            <div style={styles.contextRow}>
              <div style={styles.contextLabel}>Team</div>
              <div style={styles.contextValue}>{teamName}</div>
            </div>
            <div style={styles.contextRow}>
              <div style={styles.contextLabel}>Signed in</div>
              <div style={styles.contextValue}>{fullName}</div>
            </div>
            <div style={styles.contextEmail}>{email}</div>
          </div>
        </header>
        <main style={styles.main}>
          {/* Phase 124A/B/E + 126B — Lead cockpit: Manager Bloomberg
              Control Panel for manager-name workspaces, Portfolio
              Command Center for portfolio-name workspaces. The
              existing nine manager cards below render unchanged in
              both modes (their data scope is the same authorized
              team pipeline). */}
          {isPortfolio ? <PortfolioCommandCenter /> : <ManagerBloombergControlPanel />}
          <TeamWorkQueue />
          <ManagerBankerFilterControl />
          <ManagerMorningCatchUp />
          <ManagerAutopilotRollup />
          <ManagerRelationshipMemory />
          <TeamPipelineSummary />
          <div style={styles.twoCol}>
            <DealsByStage />
            <ClosingForecast />
          </div>
          <AtRiskBlockedDeals />
          <BankerWorkloadSummary />
          <ManagerActivitySummary />
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
  },
  context: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  contextRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
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
  contextEmail: {
    color: palette.textMuted,
    fontSize: typography.size.sm,
  },
  main: {
    padding: `${spacing.xl} ${spacing.xxl}`,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: spacing.lg,
  },
};

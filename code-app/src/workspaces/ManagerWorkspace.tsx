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
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
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
  const showSwitcher = workspaceLinks.length >= 2;
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <div style={styles.eyebrow}>Commercial Lending</div>
          <h1 style={styles.title}>Manager Command Center</h1>
          <p style={styles.subtitle}>
            Team pipeline health, banker production, and risk roll-up.
          </p>
        </div>
        <div style={styles.context} aria-label="Manager context">
          {/* Phase 124C — workspace switcher rendered above the
              identity block so an entitled banker who has switched
              into the manager workspace can return to their
              bootstrap-primary workspace. Hidden for single-
              workspace users (length=1 → no switcher). */}
          {showSwitcher && (
            <WorkspaceSwitcher
              links={workspaceLinks}
              tone="light"
              aria-label="Manager workspace switcher"
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
        {/* Phase 124A — Manager Bloomberg Control Panel mounts as
            the FIRST cockpit at the top of the manager workspace.
            Reads the same ManagerDataProvider slots existing cards
            consume; renders pipeline command strip + exception tape
            + banker workload + top deals projected through the
            shared Phase-123A deal-intelligence VM. Existing cards
            below are unchanged in this phase. */}
        <ManagerBloombergControlPanel />
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

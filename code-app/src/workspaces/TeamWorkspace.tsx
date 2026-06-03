import { TeamProvider } from '../team/TeamProvider';
import { TeamDataProvider } from '../team/TeamDataProvider';
import { useTeam } from '../team/TeamContext';
import { TeamOpsQueue } from '../team/TeamOpsQueue';
import { TeamPipelineSummary } from '../team/TeamPipelineSummary';
import { SharedWorkQueue } from '../team/SharedWorkQueue';
import { SharedActiveDeals } from '../team/SharedActiveDeals';
import { BottlenecksAgingByStage } from '../team/BottlenecksAgingByStage';
import { TeamDocumentNeeds } from '../team/TeamDocumentNeeds';
import { TeamTaskLoad } from '../team/TeamTaskLoad';
import { SharedClosingCalendar } from '../team/SharedClosingCalendar';
import { TeamBankerActivityBreakdown } from '../team/TeamBankerActivityBreakdown';
import { TeamAutopilotRollup } from '../team/TeamAutopilotRollup';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
} from '../bootstrap/workspaceEntitlements';
import { WORKSPACE_ROUTES } from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { palette, spacing, typography } from '../shared/theme';

export function TeamWorkspace() {
  return (
    <TeamProvider>
      <TeamDataProvider>
        <TeamWorkspaceContent />
      </TeamDataProvider>
    </TeamProvider>
  );
}

function TeamWorkspaceContent() {
  const { fullName, email, teamName } = useTeam();
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  // Phase 127B — surface the workspace switcher in the team header so
  // manager-entitled users who reached the team route via the Phase
  // 127B entitlement widening can navigate back. Banker-only users
  // are still bounced by WorkspaceGate and never see this page; team-
  // bootstrap users with no additional entitlements see a single-link
  // list, which the switcher gate (links.length >= 2) hides honestly.
  // Portfolio surface is opt-in only when the manager route is in the
  // user's allowed set (same rule as banker/manager workspaces).
  const managerEntitled = entitled.routes.includes(WORKSPACE_ROUTES.manager);
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.team,
    entitledRoutes: entitled.routes,
    includePortfolioSurface: managerEntitled,
  });
  const showInlineSwitcher = workspaceLinks.length >= 2;

  // Phase 127C — wrap the team body in the same Lending OS shell the
  // banker / manager / portfolio surfaces use, so the dark left
  // sidebar (brand block, sidebar workspace switcher, My Pipeline /
  // Work Queue / Relationships / Resources nav) renders consistently
  // across role surfaces. `onNavSelect` is intentionally undefined —
  // the Lending OS nav items are banker-coded and remain
  // non-interactive on the team surface for now.
  return (
    <LendingOSLayout
      activeNav="dashboard"
      fullName={fullName}
      email={email}
      workspaceName="Team Workspace"
      workspaceLinks={workspaceLinks}
    >
      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.titleBlock}>
            <div style={styles.eyebrow}>Commercial Lending</div>
            <h1 style={styles.title}>Team Command Center</h1>
            <p style={styles.subtitle}>
              Shared pipeline, bottlenecks, document needs, and task load across the team.
            </p>
          </div>
          <div style={styles.context} aria-label="Team context">
            {showInlineSwitcher && (
              <WorkspaceSwitcher
                links={workspaceLinks}
                tone="light"
                aria-label="Team workspace switcher"
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
          {/* Phase 127A — Team Ops Queue mounts as the FIRST cockpit
              at the top of the team workspace: 10-tile command ribbon
              + 8 lanes + banker workload matrix + execution board +
              analytics row. Existing cards below render unchanged. */}
          <TeamOpsQueue />
          <SharedWorkQueue />
          <TeamAutopilotRollup />
          <TeamPipelineSummary />
          <div style={styles.twoCol}>
            <BottlenecksAgingByStage />
            <SharedClosingCalendar />
          </div>
          <div style={styles.twoCol}>
            <TeamDocumentNeeds />
            <TeamTaskLoad />
          </div>
          <SharedActiveDeals />
          <TeamBankerActivityBreakdown />
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
  contextRow: { display: 'flex', flexDirection: 'column', gap: 1 },
  contextLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  contextValue: { fontWeight: typography.weight.semibold, color: palette.text, fontSize: typography.size.base },
  contextEmail: { color: palette.textMuted, fontSize: typography.size.sm },
  main: { padding: `${spacing.xl} ${spacing.xxl}` },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: spacing.lg,
  },
};

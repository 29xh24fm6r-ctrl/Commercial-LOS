import { useEffect, useMemo, useState } from 'react';
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
import { useSearchParams } from 'react-router-dom';
import { useBootstrap } from '../bootstrap/BootstrapContext';
import {
  deriveWorkspaceLinks,
  useEntitledRoutes,
  PORTFOLIO_SURFACE_PARAM_NAME,
  PORTFOLIO_SURFACE_PARAM_VALUE,
} from '../bootstrap/workspaceEntitlements';
import {
  WORKSPACE_ROUTES,
  isPortfolioWorkspaceName,
} from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { PortfolioCommandCenter } from '../portfolio/PortfolioCommandCenter';
import { CrmManagerWorkingSurface } from '../crm/workspaceIntegration/CrmManagerWorkingSurface';
import { managerCrmPreviewInput } from '../crm/workspaceIntegration/crmWorkspacePreviewInputs';
import { deriveManagerCrmSurfaceInput } from '../crm/workspaceIntegration/crmWorkspaceRollupInputs';
import { CRM_LIVE_ROLLUPS_ENABLED } from '../crm/crmFeatureFlags';
import { loadCrmWorkspaceData, type CrmWorkspaceData } from '../crm/workspace/crmWorkspaceData';
import { deriveOrgHealthInputs, deriveAccountRollupRecords } from '../crm/workspace/crmRelationshipHealthData';
import { ManagerWorkflowLaunchReadinessPanel } from '../workflow/ManagerWorkflowLaunchReadinessPanel';
import { ManagerOperatingCommandCenter } from '../manager/ManagerOperatingCommandCenter';
import { palette, spacing, typography } from '../shared/theme';

// CRM-ELITE-1 Phase 3 — live manager CRM rollup data. Mirrors the LoadState +
// cancellation-guard pattern CrmHubWorkspace.tsx already uses. Only loads when
// the flag is on; flag-off leaves the workspace exactly as it renders today.
type CrmRollupLoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CrmWorkspaceData }
  | { kind: 'failed'; message: string };

function useCrmRollupWorkspaceData(): CrmRollupLoadState {
  const [state, setState] = useState<CrmRollupLoadState>({ kind: 'loading' });
  useEffect(() => {
    if (!CRM_LIVE_ROLLUPS_ENABLED) return;
    let cancelled = false;
    loadCrmWorkspaceData()
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

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
  const crmRollupState = useCrmRollupWorkspaceData();
  // Reaching this content means ManagerProvider has already authorized the
  // viewer as a manager — the same authorization the rollup is scoped to, so
  // this is not a permission widening.
  const liveManagerCrmSurfaceInput = useMemo(() => {
    if (crmRollupState.kind !== 'ready') return undefined;
    const nowIso = new Date().toISOString();
    const orgHealthInputs = deriveOrgHealthInputs(crmRollupState.data, nowIso);
    const accounts = [...deriveAccountRollupRecords(orgHealthInputs, new Map(), nowIso)];
    return deriveManagerCrmSurfaceInput({ accounts, viewerEntitled: true }, undefined);
  }, [crmRollupState]);
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const [searchParams] = useSearchParams();
  // Phase 126C â€” the `?surface=portfolio` query is the explicit
  // user-driven signal that they want the Portfolio cockpit. Falls
  // back to Phase 126B's bootstrap workspace-name rule when the
  // query is absent, so portfolio-primary users (whose bootstrap
  // workspaceName === 'Portfolio Management') still see the
  // portfolio surface by default. An explicit `?surface=manager`
  // overrides the bootstrap default.
  const surfaceParam = searchParams.get(PORTFOLIO_SURFACE_PARAM_NAME);
  const isPortfolio =
    surfaceParam === PORTFOLIO_SURFACE_PARAM_VALUE ||
    (surfaceParam === null && isPortfolioWorkspaceName(bootstrap.workspaceName));
  // Phase 126C â€” surface the portfolio link in the workspace
  // switcher for everyone on the manager route. By contract the
  // user already passed the manager-route gate (bootstrap-primary or
  // Phase 124C entitled probe), so adding the portfolio rendering
  // option does not widen permission. Banker-only users never reach
  // this code path because their bootstrap route is /workspaces/banker.
  const workspaceLinks = deriveWorkspaceLinks({
    bootstrapRoute: bootstrap.route,
    currentRoute: WORKSPACE_ROUTES.manager,
    entitledRoutes: Array.from(new Set([WORKSPACE_ROUTES.banker, WORKSPACE_ROUTES.manager, ...entitled.routes])),
    includePortfolioSurface: true,
    currentSurface: isPortfolio ? 'portfolio' : undefined,
  });
  const showInlineSwitcher = workspaceLinks.length >= 2;
  // Phase 126B â€” header / shell label copy swaps with the lead
  // cockpit. Manager and Portfolio surfaces share the manager route
  // and the manager data provider chain; only the cockpit and the
  // wrapper labels swap.
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

  // Phase 124E â€” wrap the manager body in the same LendingOSLayout
  // shell the banker workspace uses so the dark left toolbar +
  // workspace switcher render consistently across role surfaces.
  // `onNavSelect` is intentionally undefined â€” the Lending OS
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
          {/* Phase 124A/B/E + 126B â€” Lead cockpit: Manager Bloomberg
              Control Panel for manager-name workspaces, Portfolio
              Command Center for portfolio-name workspaces. The
              existing nine manager cards below render unchanged in
              both modes (their data scope is the same authorized
              team pipeline). */}
          {isPortfolio ? <PortfolioCommandCenter /> : <ManagerBloombergControlPanel />}
          {/* PE-WIRE-2 WI-3 — the cards below are the manager team/deal-pipeline
              surface. In portfolio mode they are gated OUT so the page renders
              ONLY the portfolio book cockpit (which self-contains its own
              provider, panels, and existing-loans/variable-rate sections). This
              stops the full team-pipeline stack — and its unrelated in-flight
              deals — from bleeding in under the $43K portfolio book.
              Banker-filter note: option (a) — ManagerBankerFilterControl is gated
              out with the rest on the portfolio surface. The book is manager/PM-
              scoped (not banker-scoped); PortfolioCommandCenterBook reads the
              filter via useOptionalManagerBankerFilter(), which simply resolves
              to "no filter" when the control is absent. */}
          {!isPortfolio && <ManagerOperatingCommandCenter />}
          {!isPortfolio && <ManagerWorkflowLaunchReadinessPanel />}
          {/* BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 â€” visible read-only CRM
              team intelligence (honest preview posture; no assignment mutation,
              no CRM writes, no permission widening). */}
          {!isPortfolio && !CRM_LIVE_ROLLUPS_ENABLED && (
            <CrmManagerWorkingSurface input={managerCrmPreviewInput()} />
          )}
          {!isPortfolio && CRM_LIVE_ROLLUPS_ENABLED && liveManagerCrmSurfaceInput && (
            <CrmManagerWorkingSurface input={liveManagerCrmSurfaceInput} />
          )}
          {!isPortfolio && CRM_LIVE_ROLLUPS_ENABLED && crmRollupState.kind === 'loading' && (
            <div style={styles.crmRollupNotice} aria-hidden="true">Loading CRM team intelligence…</div>
          )}
          {!isPortfolio && CRM_LIVE_ROLLUPS_ENABLED && crmRollupState.kind === 'failed' && (
            <div style={styles.crmRollupNotice} role="alert">
              CRM team intelligence is temporarily unavailable. Refresh to try again.
            </div>
          )}
          {!isPortfolio && <TeamWorkQueue />}
          {!isPortfolio && <ManagerBankerFilterControl />}
          {!isPortfolio && <ManagerMorningCatchUp />}
          {!isPortfolio && <ManagerAutopilotRollup />}
          {!isPortfolio && <ManagerRelationshipMemory />}
          {!isPortfolio && <TeamPipelineSummary />}
          {!isPortfolio && (
            <div style={styles.twoCol}>
              <DealsByStage />
              <ClosingForecast />
            </div>
          )}
          {!isPortfolio && <AtRiskBlockedDeals />}
          {!isPortfolio && <BankerWorkloadSummary />}
          {!isPortfolio && <ManagerActivitySummary />}
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
  crmRollupNotice: {
    padding: `${spacing.md} ${spacing.lg}`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
  },
};

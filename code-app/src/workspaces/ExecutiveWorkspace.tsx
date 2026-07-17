import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  WORKSPACE_ROUTES,
  PRODUCT_STRATEGY_SURFACE_PARAM_NAME,
  PRODUCT_STRATEGY_SURFACE_URL,
  isProductStrategySurface,
} from '../bootstrap/workspaceRoutes';
import { WorkspaceSwitcher } from '../bootstrap/WorkspaceSwitcher';
import { LendingOSLayout } from '../banker/LendingOSLayout';
import { ExecutiveProductStrategyWorkspace } from './ExecutiveProductStrategyWorkspace';
import { ProductStrategyNavigationCard } from '../competitive/ProductStrategyNavigationCard';
import { buildExecutiveProductStrategySurfaceState } from '../competitive/buildExecutiveProductStrategySurfaceState';
import { CrmExecutiveWorkingSurface } from '../crm/workspaceIntegration/CrmExecutiveWorkingSurface';
import { executiveCrmPreviewInput } from '../crm/workspaceIntegration/crmWorkspacePreviewInputs';
import { deriveExecutiveCrmSurfaceInput } from '../crm/workspaceIntegration/crmWorkspaceRollupInputs';
import { CRM_LIVE_ROLLUPS_ENABLED } from '../crm/crmFeatureFlags';
import { loadCrmWorkspaceData, type CrmWorkspaceData } from '../crm/workspace/crmWorkspaceData';
import { deriveOrgHealthInputs, deriveAccountRollupRecords } from '../crm/workspace/crmRelationshipHealthData';
import { ExecutiveWorkflowLaunchReadinessPanel } from '../workflow/ExecutiveWorkflowLaunchReadinessPanel';
import { ExecutiveRestartReadinessCommandCenter } from '../executive/ExecutiveRestartReadinessCommandCenter';
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
// CRM-ELITE-1 Phase 3 — live executive CRM rollup data. Mirrors the LoadState +
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
  const crmRollupState = useCrmRollupWorkspaceData();
  // Reaching this content means ExecutiveProvider has already authorized the
  // viewer as an executive — the same authorization the rollup is scoped to,
  // so this is not a permission widening.
  const liveExecutiveCrmSurfaceInput = useMemo(() => {
    if (crmRollupState.kind !== 'ready') return undefined;
    const nowIso = new Date().toISOString();
    const orgHealthInputs = deriveOrgHealthInputs(crmRollupState.data, nowIso);
    const accounts = [...deriveAccountRollupRecords(orgHealthInputs, new Map(), nowIso)];
    return deriveExecutiveCrmSurfaceInput({ accounts, viewerEntitled: true }, undefined);
  }, [crmRollupState]);
  const bootstrap = useBootstrap();
  const entitled = useEntitledRoutes();
  const [searchParams] = useSearchParams();
  // Phase 142I — the `?surface=product-strategy` query selects the read-only
  // competitive / product-strategy surface. It is subordinate to executive
  // access: this code only runs after the executive WorkspaceGate has already
  // admitted the user, so the surface adds no permission and no new route.
  const isProductStrategy = isProductStrategySurface(
    searchParams.get(PRODUCT_STRATEGY_SURFACE_PARAM_NAME),
  );
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
  const productStrategyState = buildExecutiveProductStrategySurfaceState();

  return (
    <LendingOSLayout
      activeNav="dashboard"
      fullName={fullName}
      email={upn}
      workspaceName="Executive Workspace"
      workspaceLinks={workspaceLinks}
    >
      {isProductStrategy ? (
        <ExecutiveProductStrategyWorkspace state={productStrategyState} />
      ) : (
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
            {/* Phase 233 — Executive Restart Readiness Command Center: high-visibility
                lending-restart posture across banker/manager/admin/CRM/LOS/portfolio
                and live gate categories. Read-only; no hidden writes. */}
            <ExecutiveRestartReadinessCommandCenter />
            <ExecutiveWorkflowLaunchReadinessPanel />
            {/* BUGFIX-PRODUCTION-CRM-SURFACES-NOT-VISIBLE-1 — visible read-only CRM
                strategy intelligence (honest preview posture; no fake revenue/ROE,
                no credit decisioning, no write controls, no permission widening). */}
            {!CRM_LIVE_ROLLUPS_ENABLED && (
              <CrmExecutiveWorkingSurface input={executiveCrmPreviewInput()} />
            )}
            {CRM_LIVE_ROLLUPS_ENABLED && liveExecutiveCrmSurfaceInput && (
              <CrmExecutiveWorkingSurface input={liveExecutiveCrmSurfaceInput} />
            )}
            {CRM_LIVE_ROLLUPS_ENABLED && crmRollupState.kind === 'loading' && (
              <div style={styles.crmRollupNotice} aria-hidden="true">Loading CRM strategy intelligence…</div>
            )}
            {CRM_LIVE_ROLLUPS_ENABLED && crmRollupState.kind === 'failed' && (
              <div style={styles.crmRollupNotice} role="alert">
                CRM strategy intelligence is temporarily unavailable. Refresh to try again.
              </div>
            )}
            {/* Existing board-safe snapshot cards remain below as detail. */}
            <PortfolioSummary />
            <AtRiskPortfolioSummary />
            <BankerProductionRollup />
            <div style={styles.twoCol}>
              <PipelineByStage />
              <MonthlyClosingForecast />
            </div>
            {/* Phase 142I — read-only navigation to the product-strategy surface. */}
            <ProductStrategyNavigationCard
              state={productStrategyState}
              to={PRODUCT_STRATEGY_SURFACE_URL}
            />
          </main>
        </div>
      )}
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

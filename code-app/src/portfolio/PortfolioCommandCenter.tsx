import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useManagerData } from '../manager/ManagerDataProvider';
import { useOptionalManagerBankerFilter, dealMatchesBankerFilter } from '../manager/ManagerBankerFilter';
import {
  deriveRiskDistribution,
  deriveAgingHistogram,
  deriveClosingForecast,
  deriveMissingFieldsDistribution,
  deriveDataQualityDistribution,
} from '../manager/managerDashboardCharts';
import {
  VerticalBarChart,
  HorizontalBarChart,
  Histogram,
  DonutChart,
  ForecastSparkline,
} from '../manager/ManagerChartPrimitives';
import {
  derivePortfolioCommandSnapshot,
  type PortfolioCommandRibbon,
  type PortfolioConcentrationRow,
  type PortfolioTopExposureRow,
  type PortfolioExceptionRow,
} from './portfolioCommandSnapshot';
import {
  concentrationToHorizontalBars,
  concentrationToVerticalBars,
  derivePortfolioExposureBands,
  exposureBandsToVerticalBars,
} from './portfolioDashboardCharts';
import {
  derivePortfolioRiskSnapshot,
  portfolioRiskCopilotSummaries,
} from './portfolioRiskEngine';
import { RiskConcentrationRadar } from './RiskConcentrationRadar';
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { portfolioKpiTargets } from './portfolioDrillThrough';
import { CopilotAssistPanel } from '../copilot/CopilotAssistPanel';
import { buildWorkspaceCopilotContext } from '../copilot/workspaceCopilotContext';
import { getCopilotConnector } from '../copilot/copilotConnector';
import {
  palette,
  radius,
  severityPalette,
  shadow,
  spacing,
  typography,
} from '../shared/theme';

/**
 * Phase 126A — Portfolio Command Center (foundation).
 *
 * Dense, read-only, institutional portfolio cockpit. Mirrors the
 * Phase 124E + 125A Manager Bloomberg Control Panel's layout
 * vocabulary but projects the same already-authorized records into
 * an exposure / mix / concentration lens.
 *
 * Sections:
 *   1. Header — title + subtitle + read-only chip + optional filter
 *      chip (when the Phase 124B banker filter is mounted upstream)
 *   2. KPI ribbon — 10 portfolio-scoped tiles
 *   3. Analytics grid — 9 chart cards
 *   4. Top exposures — top N deals by amount with concentration share
 *   5. Exceptions — blocked + at-risk deals consolidated
 *
 * Discipline:
 *   - Reuses ManagerDataProvider (the Phase 116 alias routes
 *     Portfolio Management → manager workspace, so the same
 *     authorized team-scoped data backs this cockpit).
 *   - No new loader, no Dataverse schema change, no write surface.
 *   - Honest absence — Unknown / Unassigned / Unset buckets are
 *     never coerced into real categories.
 *   - Fails closed when any of the four core data slots reports
 *     `failed` — no partial KPIs across a degraded load.
 *   - No predictive language anywhere. Weighted exposure / win
 *     rate are explicitly omitted (no probability-by-stage schema;
 *     no closed-deal cohort).
 */
export function PortfolioCommandCenter() {
  const { teamPipeline, teamBankers, teamTasks, teamDocuments } = useManagerData();
  const filter = useOptionalManagerBankerFilter();
  const filterSelection = filter?.selection;
  const filterLabel = filter?.selectionLabel;

  const failureSlot =
    teamPipeline.kind === 'failed'
      ? { name: 'team pipeline', message: teamPipeline.message }
      : teamBankers.kind === 'failed'
        ? { name: 'team bankers', message: teamBankers.message }
        : teamTasks.kind === 'failed'
          ? { name: 'team tasks', message: teamTasks.message }
          : teamDocuments.kind === 'failed'
            ? { name: 'team documents', message: teamDocuments.message }
            : undefined;

  const allReady =
    teamPipeline.kind === 'ready' &&
    teamBankers.kind === 'ready' &&
    teamTasks.kind === 'ready' &&
    teamDocuments.kind === 'ready';

  const snapshot = useMemo(() => {
    if (
      teamPipeline.kind !== 'ready' ||
      teamBankers.kind !== 'ready' ||
      teamTasks.kind !== 'ready' ||
      teamDocuments.kind !== 'ready'
    ) {
      return undefined;
    }
    // Apply the Phase 124B banker filter BEFORE derivation so the
    // ribbon / charts / top exposures / exceptions stay consistent
    // with the manager surface and the filter narrows the portfolio
    // view to the selected banker.
    const filteredPipeline =
      filterSelection && filterSelection.kind !== 'all'
        ? teamPipeline.data.filter((d) =>
            dealMatchesBankerFilter(d, filterSelection),
          )
        : teamPipeline.data;
    const dealIdsInScope = new Set(filteredPipeline.map((d) => d.id));
    const filteredTasks =
      filterSelection && filterSelection.kind !== 'all'
        ? teamTasks.data.filter((t) => t.dealId && dealIdsInScope.has(t.dealId))
        : teamTasks.data;
    const filteredDocuments =
      filterSelection && filterSelection.kind !== 'all'
        ? teamDocuments.data.filter((d) => d.dealId && dealIdsInScope.has(d.dealId))
        : teamDocuments.data;
    return derivePortfolioCommandSnapshot({
      teamPipeline: filteredPipeline,
      teamBankers: teamBankers.data,
      teamTasks: filteredTasks,
      teamDocuments: filteredDocuments,
    });
  }, [teamPipeline, teamBankers, teamTasks, teamDocuments, filterSelection]);

  // Phase 132A — risk & concentration snapshot layered on the same
  // already-derived command snapshot (single source of truth). Read-only.
  const riskSnapshot = useMemo(
    () => (snapshot ? derivePortfolioRiskSnapshot(snapshot) : undefined),
    [snapshot],
  );

  // Phase 130A + 132A — read-only Copilot workspace context derived from
  // the SAME already-derived snapshot. Counts + label summaries only (the
  // builder drops record ids), so no GUID and no cross-team data reaches
  // the assistant. Phase 132A adds the risk/concentration summary lines
  // and routes the top risk findings into the proposal topBlockers.
  const copilotContext =
    snapshot && !snapshot.isEmpty
      ? buildWorkspaceCopilotContext({
          workspaceRole: 'portfolio',
          userName: undefined,
          teamName: undefined,
          deals: snapshot.vmRows.map((r) => ({
            id: r.teamDeal.id,
            name: r.teamDeal.name,
            stage: r.teamDeal.stage,
          })),
          urgentItems: snapshot.exceptions.map((e) => ({ label: e.reason })),
          kpiSummaries: [
            ...portfolioCopilotKpiSummaries(snapshot.commandRibbon),
            ...(riskSnapshot ? portfolioRiskCopilotSummaries(riskSnapshot) : []),
          ],
        })
      : undefined;

  // SPEC-COPILOT-LIVE-CONNECTOR — confirmation-required proposals from the
  // governed connector. Empty in the default not_configured posture. Top
  // risk findings join the blocker list so a live assistant can reason
  // over concentration as well as per-deal exceptions.
  const copilotProposals =
    copilotContext && snapshot
      ? getCopilotConnector().assistWorkspace({
          workspace: copilotContext,
          topBlockers: [
            ...snapshot.exceptions.map((e) => e.reason),
            ...(riskSnapshot
              ? riskSnapshot.findings.slice(0, 5).map((f) => f.label)
              : []),
          ],
        }).proposed_actions
      : undefined;

  return (
    <section
      style={styles.deck}
      aria-label="Portfolio Command Center"
      data-portfolio-cockpit="command-center"
    >
      <header style={styles.header}>
        <div style={styles.headerTitleBlock}>
          <div style={styles.eyebrow}>Portfolio Cockpit</div>
          <h2 style={styles.title}>Portfolio Command Center</h2>
          <p style={styles.subtitle}>Live authorized portfolio exposure</p>
        </div>
        <div style={styles.headerMeta}>
          {filterLabel && (
            <span
              style={styles.filterChip}
              aria-label={`Banker filter: ${filterLabel}`}
              data-portfolio-cockpit-filter-label
            >
              {filterLabel}
            </span>
          )}
          <span style={styles.readOnlyChip} aria-label="Read-only portfolio view">
            Read-only
          </span>
        </div>
      </header>

      {failureSlot && (
        <FailureState slot={failureSlot.name} message={failureSlot.message} />
      )}
      {!failureSlot && !allReady && <LoadingStrip />}
      {!failureSlot && allReady && snapshot && snapshot.isEmpty && (
        <EmptyState
          filtered={Boolean(filterSelection && filterSelection.kind !== 'all')}
        />
      )}
      {!failureSlot && allReady && snapshot && !snapshot.isEmpty && (
        <div style={styles.body}>
          {copilotContext && (
            <div data-cockpit-copilot="portfolio">
              <CopilotAssistPanel
                surface="workspace"
                workspaceContext={copilotContext}
                proposedActions={copilotProposals}
              />
            </div>
          )}
          {riskSnapshot && <RiskConcentrationRadar risk={riskSnapshot} />}
          <KpiRibbon ribbon={snapshot.commandRibbon} exceptions={snapshot.exceptions} />
          <AnalyticsGrid snapshot={snapshot} />
          <TopExposures rows={snapshot.topExposures} />
          <Exceptions rows={snapshot.exceptions} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading / failure / empty
// ---------------------------------------------------------------------------

function LoadingStrip() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.statusRow}
      data-portfolio-cockpit-state="loading"
    >
      Loading authorized portfolio…
    </div>
  );
}

function FailureState({ slot, message }: { slot: string; message: string }) {
  return (
    <div role="alert" style={styles.failureRow} data-portfolio-cockpit-state="failed">
      <span style={styles.failureLabel}>
        Could not load {slot}. The cockpit is failing closed.
      </span>
      <span style={styles.failureDetail}>{message}</span>
      <span style={styles.failureHint}>
        No partial KPIs are shown across a failed load. Refresh to retry.
      </span>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.emptyRow}
      data-portfolio-cockpit-state="empty"
    >
      {filtered
        ? 'No authorized portfolio records match the current banker filter.'
        : 'No authorized portfolio records found.'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Ribbon
// ---------------------------------------------------------------------------

function KpiRibbon({
  ribbon,
  exceptions,
}: {
  ribbon: PortfolioCommandRibbon;
  exceptions: ReadonlyArray<PortfolioExceptionRow>;
}) {
  // Phase 144B — each KPI tile becomes a read-only drill-through disclosure that
  // explains its contributing counts / deals. The existing tile markup (aria-label
  // + data-portfolio-kpi) is preserved inside the disclosure face.
  const targets = portfolioKpiTargets(ribbon, exceptions);
  const tiles: Array<{
    label: string;
    value: string;
    tone: 'info' | 'clear' | 'atRisk' | 'blocked';
    ariaLabel: string;
  }> = [
    {
      label: 'Active deals',
      value: String(ribbon.activeDealCount),
      tone: 'info',
      ariaLabel: `${ribbon.activeDealCount} active deals`,
    },
    {
      label: 'Total exposure',
      value: formatCurrencyCompact(ribbon.totalExposure),
      tone: 'info',
      ariaLabel: `Total exposure ${formatCurrency(ribbon.totalExposure)}`,
    },
    {
      label: 'Closing 30d',
      value: String(ribbon.closingNext30DayCount),
      tone: ribbon.closingNext30DayCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.closingNext30DayCount} deals closing in the next 30 days, total ${formatCurrency(ribbon.closingNext30DayAmount)}`,
    },
    {
      label: 'Closing 30d $',
      value: formatCurrencyCompact(ribbon.closingNext30DayAmount),
      tone: 'info',
      ariaLabel: `Exposure closing in 30 days ${formatCurrency(ribbon.closingNext30DayAmount)}`,
    },
    {
      label: 'Blocked',
      value: String(ribbon.blockedDealCount),
      tone: ribbon.blockedDealCount === 0 ? 'clear' : 'blocked',
      ariaLabel: `${ribbon.blockedDealCount} deals blocked`,
    },
    {
      label: 'At risk',
      value: String(ribbon.atRiskDealCount),
      tone: ribbon.atRiskDealCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.atRiskDealCount} deals at risk`,
    },
    {
      label: 'Missing data',
      value: String(ribbon.missingDataCount),
      tone: ribbon.missingDataCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.missingDataCount} deals with missing required fields`,
    },
    {
      label: 'Stale deals',
      value: String(ribbon.staleDealCount),
      tone: ribbon.staleDealCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.staleDealCount} deals with no record activity in 14+ days`,
    },
    {
      label: 'Outstanding docs',
      value: String(ribbon.outstandingDocumentCount),
      tone: ribbon.outstandingDocumentCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.outstandingDocumentCount} outstanding documents`,
    },
    {
      label: 'Open tasks',
      value: String(ribbon.openTaskCount),
      tone: ribbon.openTaskCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.openTaskCount} open tasks`,
    },
    {
      label: 'Avg days in stage',
      value:
        ribbon.avgDaysInStage === undefined
          ? 'Not yet wired'
          : `${ribbon.avgDaysInStage}d`,
      tone: 'info',
      ariaLabel:
        ribbon.avgDaysInStage === undefined
          ? 'Average days in stage — no stage entry dates loaded'
          : `Average days in stage ${ribbon.avgDaysInStage}`,
    },
  ];
  return (
    <section
      style={styles.commandStrip}
      aria-label="Portfolio KPI ribbon"
      data-portfolio-cockpit-section="kpi-ribbon"
    >
      {tiles.map((t) => {
        const slug = t.label.toLowerCase().replace(/\s+/g, '-');
        const tile = (
          <div
            style={{
              ...styles.kpiTile,
              borderTopColor: severityPalette[t.tone].bar,
            }}
            aria-label={t.ariaLabel}
            data-portfolio-kpi={slug}
          >
            <span style={styles.kpiLabel}>{t.label}</span>
            <span style={styles.kpiValue}>{t.value}</span>
          </div>
        );
        const target = targets[slug];
        return target ? (
          <DrillThroughCard key={t.label} target={target} unstyled>
            {tile}
          </DrillThroughCard>
        ) : (
          <div key={t.label}>{tile}</div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Analytics grid — 9 chart cards
// ---------------------------------------------------------------------------

function AnalyticsGrid({
  snapshot,
}: {
  snapshot: {
    vmRows: ReadonlyArray<import('../manager/managerPipelineSnapshot').ManagerVMRow>;
    byStage: ReadonlyArray<PortfolioConcentrationRow>;
    byProductType: ReadonlyArray<PortfolioConcentrationRow>;
    byLoanStructure: ReadonlyArray<PortfolioConcentrationRow>;
    byPricingType: ReadonlyArray<PortfolioConcentrationRow>;
    byBanker: ReadonlyArray<PortfolioConcentrationRow>;
  };
}) {
  const aging = useMemo(() => deriveAgingHistogram(snapshot.vmRows), [snapshot.vmRows]);
  const risk = useMemo(() => deriveRiskDistribution(snapshot.vmRows), [snapshot.vmRows]);
  const forecast = useMemo(
    () => deriveClosingForecast(snapshot.vmRows),
    [snapshot.vmRows],
  );
  const missing = useMemo(
    () => deriveMissingFieldsDistribution(snapshot.vmRows),
    [snapshot.vmRows],
  );
  const quality = useMemo(
    () => deriveDataQualityDistribution(snapshot.vmRows),
    [snapshot.vmRows],
  );
  const exposureBands = useMemo(
    () => derivePortfolioExposureBands(snapshot.vmRows),
    [snapshot.vmRows],
  );

  return (
    <section
      style={styles.analyticsGrid}
      aria-label="Portfolio analytics grid"
      data-portfolio-cockpit-section="analytics-grid"
    >
      <VerticalBarChart
        title="Pipeline by stage"
        subtitle="Deal count"
        data={concentrationToVerticalBars(snapshot.byStage)}
      />
      <HorizontalBarChart
        title="Exposure by product type"
        subtitle="$ + share"
        data={concentrationToHorizontalBars(snapshot.byProductType)}
        valueFormatter={formatCurrencyCompact}
      />
      <HorizontalBarChart
        title="Loan structure mix"
        subtitle="$ + share"
        data={concentrationToHorizontalBars(snapshot.byLoanStructure)}
        valueFormatter={formatCurrencyCompact}
      />
      <HorizontalBarChart
        title="Pricing type mix"
        subtitle="$ + share"
        data={concentrationToHorizontalBars(snapshot.byPricingType)}
        valueFormatter={formatCurrencyCompact}
      />
      <HorizontalBarChart
        title="Exposure by banker"
        subtitle="$ + share"
        data={concentrationToHorizontalBars(snapshot.byBanker)}
        valueFormatter={formatCurrencyCompact}
      />
      <VerticalBarChart
        title="Deal size mix"
        subtitle="Count by band"
        data={exposureBandsToVerticalBars(exposureBands)}
      />
      <Histogram
        title="Aging — days in stage"
        data={aging.map((a) => ({
          label: a.label,
          value: a.dealCount,
          tone: a.lowDays >= 31 ? 'atRisk' : 'info',
        }))}
      />
      <DonutChart
        title="Risk distribution"
        subtitle="Blocker pipeline"
        segments={[
          { label: 'Blocked', value: risk.blocked, tone: 'blocked' },
          { label: 'At risk', value: risk.atRisk, tone: 'atRisk' },
          { label: 'Clear', value: risk.clear, tone: 'clear' },
          { label: 'Unknown', value: risk.unknown, tone: 'neutral' },
        ]}
      />
      <ForecastSparkline
        title="Closings forecast"
        subtitle="Next 6 months"
        points={forecast.map((f) => ({
          label: f.label,
          dealCount: f.dealCount,
          totalAmount: f.totalAmount,
        }))}
      />
      <HorizontalBarChart
        title="Missing field concentration"
        subtitle="Deals × field"
        data={missing.map((m) => ({
          label: m.label,
          value: m.dealCount,
          tone: 'atRisk',
        }))}
      />
      <HorizontalBarChart
        title="Data quality"
        subtitle="Completeness buckets"
        data={quality.map((q) => ({
          label: q.label,
          value: q.dealCount,
          tone:
            q.label === 'Complete (100%)'
              ? 'clear'
              : q.label === 'Sparse (<50%)'
                ? 'blocked'
                : 'atRisk',
        }))}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Top exposures
// ---------------------------------------------------------------------------

function TopExposures({ rows }: { rows: ReadonlyArray<PortfolioTopExposureRow> }) {
  return (
    <section
      style={styles.topExposures}
      aria-label="Top exposures"
      data-portfolio-cockpit-section="top-exposures"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Top exposures</h3>
        <span style={styles.sectionMeta}>
          Showing {rows.length} of portfolio
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No deals to display.</p>
      ) : (
        <ul style={styles.exposureList}>
          {rows.map((r) => (
            <li
              key={r.dealId}
              style={styles.exposureRow}
              data-portfolio-top-exposure={r.dealId}
            >
              <div style={styles.exposureHead}>
                <Link
                  to={`/deals/${r.dealId}`}
                  style={styles.exposureLink}
                  aria-label={`Open ${r.dealName} in the deal workspace`}
                  data-portfolio-drilldown-deal={r.dealId}
                >
                  {r.dealName}
                </Link>
                <div style={styles.exposureAmounts}>
                  <span style={styles.exposureAmount}>
                    {formatAmount(r.amount)}
                  </span>
                  <span style={styles.exposureShare}>{r.sharePct}% share</span>
                </div>
              </div>
              <div style={styles.exposureMeta}>
                <MetaCell label="Client" value={r.clientName ?? 'Not set'} />
                <MetaCell label="Banker" value={r.bankerName ?? 'Unassigned'} />
                <MetaCell label="Stage" value={r.stage ?? 'Not set'} />
                <MetaCell label="Status" value={r.status ?? 'Not set'} />
                {r.productType !== undefined && (
                  <MetaCell label="Product" value={r.productType} />
                )}
                {r.loanStructure !== undefined && (
                  <MetaCell label="Loan structure" value={r.loanStructure} />
                )}
                {r.pricingType !== undefined && (
                  <MetaCell label="Pricing" value={r.pricingType} />
                )}
              </div>
              <div style={styles.exposureFoot}>
                <span
                  style={{
                    ...styles.statusChip,
                    background:
                      severityPalette[severityToneForVm(r.blockerStatus)].bg,
                    color: severityPalette[severityToneForVm(r.blockerStatus)].fg,
                  }}
                  aria-label={`Blocker status ${r.blockerStatus ?? 'unknown'}`}
                  data-portfolio-blocker-status={r.blockerStatus ?? 'unknown'}
                >
                  {labelForBlockerStatus(r.blockerStatus)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Exceptions (blocked + at-risk consolidated)
// ---------------------------------------------------------------------------

function Exceptions({ rows }: { rows: ReadonlyArray<PortfolioExceptionRow> }) {
  return (
    <section
      style={styles.exceptions}
      aria-label="Portfolio exceptions"
      data-portfolio-cockpit-section="exceptions"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Exceptions — needs review</h3>
        <span style={styles.sectionMeta}>
          {rows.length} {rows.length === 1 ? 'deal' : 'deals'}
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>
          Portfolio clear — no blocked or at-risk deals.
        </p>
      ) : (
        <ul style={styles.exceptionList}>
          {rows.map((r) => {
            const tone = r.severity === 'blocked' ? 'blocked' : 'atRisk';
            return (
              <li
                key={r.dealId}
                style={{
                  ...styles.exceptionRow,
                  borderLeftColor: severityPalette[tone].bar,
                }}
                data-portfolio-exception={r.dealId}
                data-portfolio-exception-severity={r.severity}
              >
                <div style={styles.exceptionHead}>
                  <Link
                    to={`/deals/${r.dealId}`}
                    style={styles.exceptionLink}
                    aria-label={`Open ${r.dealName} in the deal workspace`}
                    data-portfolio-drilldown-deal={r.dealId}
                  >
                    {r.dealName}
                  </Link>
                  <span style={styles.exceptionAmount}>
                    {formatAmount(r.amount)}
                  </span>
                </div>
                <div style={styles.exceptionMeta}>
                  <span>{r.bankerName ?? 'Unassigned'}</span>
                  <span style={styles.exceptionSep} aria-hidden="true">·</span>
                  <span
                    style={{
                      ...styles.exceptionSeverityChip,
                      background: severityPalette[tone].bg,
                      color: severityPalette[tone].fg,
                    }}
                  >
                    {r.severity === 'blocked' ? 'Blocked' : 'At risk'}
                  </span>
                  <span style={styles.exceptionSep} aria-hidden="true">·</span>
                  <span style={styles.exceptionReason}>{r.reason}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <span style={styles.metaCell}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatCurrencyCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

/**
 * Phase 130A — concise, honest KPI summary lines for the Copilot
 * workspace context. Derived purely from the portfolio ribbon the
 * cockpit already renders. No predictive language, no GUIDs.
 */
function portfolioCopilotKpiSummaries(
  ribbon: PortfolioCommandRibbon,
): string[] {
  return [
    `Active deals: ${ribbon.activeDealCount}`,
    `Total exposure: ${formatCurrencyCompact(ribbon.totalExposure)}`,
    `Blocked: ${ribbon.blockedDealCount} · At risk: ${ribbon.atRiskDealCount}`,
    `Missing data: ${ribbon.missingDataCount} · Stale: ${ribbon.staleDealCount}`,
    `Outstanding docs: ${ribbon.outstandingDocumentCount} · Open tasks: ${ribbon.openTaskCount}`,
    `Closing next 30d: ${ribbon.closingNext30DayCount}`,
  ];
}

function formatAmount(amount: number | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'No amount';
  return formatCurrency(amount);
}

function labelForBlockerStatus(
  status: 'blocked' | 'at-risk' | 'clear' | undefined,
): string {
  switch (status) {
    case 'blocked':
      return 'Blocked';
    case 'at-risk':
      return 'At risk';
    case 'clear':
      return 'Clear';
    default:
      return 'Unknown';
  }
}

function severityToneForVm(
  status: 'blocked' | 'at-risk' | 'clear' | undefined,
): 'blocked' | 'atRisk' | 'clear' | 'neutral' {
  switch (status) {
    case 'blocked':
      return 'blocked';
    case 'at-risk':
      return 'atRisk';
    case 'clear':
      return 'clear';
    default:
      return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  deck: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.lg,
    boxShadow: shadow.elevated,
    padding: `${spacing.md} ${spacing.lg}`,
    marginBottom: spacing.lg,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottom: `1px solid ${palette.divider}`,
    marginBottom: spacing.md,
    flexWrap: 'wrap' as const,
  },
  headerTitleBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  headerMeta: {
    display: 'flex',
    gap: spacing.xs,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.primary,
    fontWeight: typography.weight.bold,
  },
  title: {
    margin: 0,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  subtitle: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
  },
  filterChip: {
    padding: `2px ${spacing.sm}`,
    background: palette.primaryBg,
    color: palette.primaryFg,
    border: `1px solid ${palette.primaryDim}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
  },
  readOnlyChip: {
    padding: `2px ${spacing.sm}`,
    background: palette.deckBg,
    color: palette.textMuted,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  statusRow: {
    padding: `${spacing.md} ${spacing.sm}`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic' as const,
  },
  failureRow: {
    padding: `${spacing.md} ${spacing.sm}`,
    background: severityPalette.blocked.bg,
    color: severityPalette.blocked.fg,
    borderRadius: radius.md,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  failureLabel: {
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  failureDetail: {
    fontSize: typography.size.xs,
    opacity: 0.85,
  },
  failureHint: {
    fontSize: typography.size.xs,
    fontStyle: 'italic' as const,
  },
  emptyRow: {
    padding: `${spacing.md} ${spacing.sm}`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  commandStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: spacing.sm,
  },
  kpiTile: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderTop: '3px solid',
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  kpiLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  kpiValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: palette.text,
    lineHeight: typography.lineHeight.tight,
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    margin: 0,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  sectionMeta: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  bucketEmpty: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
  },
  topExposures: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
  },
  exposureList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  exposureRow: {
    padding: `${spacing.sm} 0`,
    borderTop: `1px dashed ${palette.divider}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  exposureHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  exposureLink: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
  },
  exposureAmounts: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 2,
  },
  exposureAmount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
  },
  exposureShare: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
  },
  exposureMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: spacing.xs,
  },
  exposureFoot: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  metaCell: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  metaValue: {
    fontSize: typography.size.sm,
    color: palette.text,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  statusChip: {
    padding: `2px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  exceptions: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
  },
  exceptionList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  exceptionRow: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderLeft: '3px solid',
    borderRadius: radius.sm,
    background: palette.surface,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  exceptionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  exceptionLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
  },
  exceptionAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.textMuted,
    fontFamily: typography.mono,
  },
  exceptionMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  exceptionSep: {
    color: palette.textSubtle,
  },
  exceptionSeverityChip: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  exceptionReason: {
    color: palette.textMuted,
  },
};

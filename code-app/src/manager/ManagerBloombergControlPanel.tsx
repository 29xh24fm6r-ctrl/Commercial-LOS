import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useManagerData } from './ManagerDataProvider';
import {
  dealMatchesBankerFilter,
  useOptionalManagerBankerFilter,
} from './ManagerBankerFilter';
import {
  deriveManagerPipelineSnapshot,
  type ManagerExceptionRow,
  type ManagerExceptionSeverity,
  type BankerWorkloadRow,
  type ManagerTopDealRow,
  type ManagerPipelineCommandStrip,
  type ManagerVMRow,
} from './managerPipelineSnapshot';
import {
  deriveStageDistribution,
  deriveBankerAmountDistribution,
  deriveAgingHistogram,
  deriveRiskDistribution,
  deriveClosingForecast,
  deriveMissingFieldsDistribution,
  deriveDataQualityDistribution,
} from './managerDashboardCharts';
import {
  VerticalBarChart,
  HorizontalBarChart,
  Histogram,
  DonutChart,
  ForecastSparkline,
  type VerticalBarDatum,
  type HorizontalBarDatum,
} from './ManagerChartPrimitives';
import { CopilotAssistPanel } from '../copilot/CopilotAssistPanel';
import { buildWorkspaceCopilotContext } from '../copilot/workspaceCopilotContext';
import { getCopilotConnector } from '../copilot/copilotConnector';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../shared/theme';
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { managerKpiTargets } from './managerDrillThrough';

/**
 * Phase 124A — Manager Bloomberg Control Panel (foundation).
 *
 * Dense, read-only, institutional management cockpit projected from
 * the SAME shared deal-intelligence view-model the banker cockpit
 * consumes (Phase 123A). Sits at the top of the manager workspace
 * grid as the first management-facing command surface; existing
 * cards (TeamWorkQueue, TeamPipelineSummary, DealsByStage, etc.) are
 * unchanged in this phase.
 *
 * Four sections:
 *   1. Pipeline Command Strip — six KPIs across the team
 *   2. Exception Tape — blocked / at-risk / missing-fields / stale
 *      buckets, derived mechanically from the shared deriver
 *   3. Banker Workload — per-banker deal count + amount + work +
 *      at-risk count
 *   4. Top Deals — top N by amount, with shared-VM next-best-action
 *
 * Discipline carried from the rest of the codebase:
 *   - No write actions. No "send", "complete", "approve" buttons.
 *     The panel is observational.
 *   - No fake fallbacks. Missing client / stage / status / banker
 *     surface honest empty-state copy ('Not set' / 'Unassigned' /
 *     'No amount') exactly as they exist in the loaded record.
 *   - Permission-before-render: the panel mounts inside
 *     ManagerProvider + ManagerDataProvider, both of which enforce
 *     team-scoped authorization. If the manager has no authorized
 *     team or all four data slots fail to load, the panel renders
 *     an honest no-data state rather than zeros.
 *   - No banker-only imports. No write-surface side effects. Pinned
 *     by ManagerBloombergControlPanel.test.tsx static-source pins.
 *   - No predictive language. The next-best-action label is the
 *     same mechanical signal the shared VM emits — never a score,
 *     never an approval probability.
 */
export function ManagerBloombergControlPanel() {
  const { teamPipeline, teamBankers, teamTasks, teamDocuments } = useManagerData();
  // Phase 124B — when the manager workspace has the existing banker
  // filter provider mounted, narrow the cockpit to the selected
  // banker so command-strip / exception-tape / workload / top-deals
  // all stay consistent with the rest of the manager surface. Falls
  // back to "all team" when no provider is mounted (standalone test
  // mountability preserved).
  const filter = useOptionalManagerBankerFilter();
  const filterSelection = filter?.selection;
  const filterLabel = filter?.selectionLabel;

  // Fail closed: if ANY of the four core slots failed to load, we
  // refuse to render an aggregate. Showing zeros across a partial
  // load could leak the wrong story. The cockpit fails honestly
  // instead.
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
    // Apply the banker filter BEFORE derivation so every section
    // (command strip / exception tape / banker workload / top deals)
    // reflects the selection. The filter operates only over already-
    // authorized records — no permission widening.
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
    return deriveManagerPipelineSnapshot({
      teamPipeline: filteredPipeline,
      teamBankers: teamBankers.data,
      teamTasks: filteredTasks,
      teamDocuments: filteredDocuments,
    });
  }, [teamPipeline, teamBankers, teamTasks, teamDocuments, filterSelection]);

  // Phase 130A — build the read-only Copilot workspace context from the
  // SAME already-derived snapshot the cockpit renders. Only counts +
  // label summaries are forwarded (the builder drops record ids), so no
  // raw GUID and no cross-team data ever reaches the assistant. Built
  // only when the snapshot is ready + non-empty; otherwise the panel
  // simply does not mount.
  const copilotContext =
    snapshot && !snapshot.isEmpty
      ? buildWorkspaceCopilotContext({
          workspaceRole: 'manager',
          userName: undefined,
          teamName: undefined,
          deals: snapshot.vmRows.map((r) => ({
            id: r.teamDeal.id,
            name: r.teamDeal.name,
            stage: r.teamDeal.stage,
          })),
          urgentItems: [
            ...snapshot.exceptionTape.blocked,
            ...snapshot.exceptionTape.atRisk,
            ...snapshot.exceptionTape.missingFields,
            ...snapshot.exceptionTape.stale,
          ].map((e) => ({ label: e.reason })),
          kpiSummaries: managerCopilotKpiSummaries(snapshot.commandStrip),
        })
      : undefined;

  // SPEC-COPILOT-LIVE-CONNECTOR — confirmation-required proposals from the
  // governed connector. Empty in the default not_configured posture, so
  // the panel renders none.
  const copilotProposals =
    copilotContext && snapshot
      ? getCopilotConnector().assistWorkspace({
          workspace: copilotContext,
          topBlockers: [
            ...snapshot.exceptionTape.blocked,
            ...snapshot.exceptionTape.atRisk,
          ].map((e) => e.reason),
        }).proposed_actions
      : undefined;

  return (
    <section
      style={styles.deck}
      aria-label="Manager Bloomberg Control Panel"
      data-manager-cockpit="bloomberg-control-panel"
    >
      <header style={styles.header}>
        <div style={styles.headerTitleBlock}>
          <div style={styles.eyebrow}>Management Cockpit</div>
          <h2 style={styles.title}>Manager Bloomberg Control Panel</h2>
          <p style={styles.subtitle}>Live authorized pipeline snapshot</p>
        </div>
        <div style={styles.headerMeta}>
          {filterLabel && (
            <span
              style={styles.filterChip}
              aria-label={`Banker filter: ${filterLabel}`}
              data-manager-cockpit-filter-label
            >
              {filterLabel}
            </span>
          )}
          <span style={styles.readOnlyChip} aria-label="Read-only management view">
            Read-only
          </span>
        </div>
      </header>

      {failureSlot && (
        <FailureState slot={failureSlot.name} message={failureSlot.message} />
      )}
      {!failureSlot && !allReady && <LoadingStrip />}
      {!failureSlot && allReady && snapshot && snapshot.isEmpty && (
        <EmptyState filtered={Boolean(filterSelection && filterSelection.kind !== 'all')} />
      )}
      {!failureSlot && allReady && snapshot && !snapshot.isEmpty && (
        <div style={styles.body}>
          {copilotContext && (
            <div data-cockpit-copilot="manager">
              <CopilotAssistPanel
                surface="workspace"
                workspaceContext={copilotContext}
                proposedActions={copilotProposals}
              />
            </div>
          )}
          <CommandStrip strip={snapshot.commandStrip} />
          <AnalyticsGrid rows={snapshot.vmRows} />
          <ExceptionTape tape={snapshot.exceptionTape} />
          <div style={styles.bottomGrid}>
            <BankerWorkload rows={snapshot.bankerWorkload} />
            <TopDeals rows={snapshot.topDeals} />
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading / failure / empty states
// ---------------------------------------------------------------------------

function LoadingStrip() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.statusRow}
      data-manager-cockpit-state="loading"
    >
      Loading authorized team pipeline…
    </div>
  );
}

function FailureState({ slot, message }: { slot: string; message: string }) {
  return (
    <div role="alert" style={styles.failureRow} data-manager-cockpit-state="failed">
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
      data-manager-cockpit-state="empty"
    >
      {filtered
        ? 'No authorized records match the current banker filter.'
        : 'No authorized manager pipeline records found.'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (1) Command Strip
// ---------------------------------------------------------------------------

function CommandStrip({ strip }: { strip: ManagerPipelineCommandStrip }) {
  // Phase 144B — each KPI tile becomes a read-only drill-through disclosure that
  // explains its contributing counts. The existing tile markup (aria-label +
  // data-manager-kpi) is preserved inside the disclosure face.
  const kpiTargets = managerKpiTargets(strip);
  // Phase 125A — dense 10-tile KPI ribbon. Honest about the two
  // metrics the team-pipeline loader cannot derive cleanly:
  // "Weighted pipeline" (no probability-by-stage in schema) and
  // "Win rate / pull-through" (the pipeline query excludes terminal
  // deals; there is no closed-won/closed-lost history available
  // client-side). Both are omitted rather than faked.
  const tiles: Array<{
    label: string;
    value: string;
    tone: 'info' | 'clear' | 'atRisk' | 'blocked';
    ariaLabel: string;
  }> = [
    {
      label: 'Active deals',
      value: String(strip.activeDealCount),
      tone: 'info',
      ariaLabel: `${strip.activeDealCount} active deals`,
    },
    {
      label: 'Pipeline amount',
      value: formatCurrency(strip.totalPipelineAmount),
      tone: 'info',
      ariaLabel: `Total pipeline ${formatCurrency(strip.totalPipelineAmount)}`,
    },
    {
      label: 'Closing 30d',
      value: String(strip.closingNext30DayCount),
      tone: strip.closingNext30DayCount === 0 ? 'clear' : 'info',
      ariaLabel: `${strip.closingNext30DayCount} deals closing in the next 30 days, total ${formatCurrency(strip.closingNext30DayAmount)}`,
    },
    {
      label: 'Closing 30d $',
      value: formatCurrencyCompact(strip.closingNext30DayAmount),
      tone: 'info',
      ariaLabel: `Closing in 30 days total ${formatCurrency(strip.closingNext30DayAmount)}`,
    },
    {
      label: 'Blocked',
      value: String(strip.blockedDealCount),
      tone: strip.blockedDealCount === 0 ? 'clear' : 'blocked',
      ariaLabel: `${strip.blockedDealCount} deals blocked`,
    },
    {
      label: 'At risk',
      value: String(strip.atRiskDealCount),
      tone: strip.atRiskDealCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.atRiskDealCount} deals at risk`,
    },
    {
      label: 'Missing data',
      value: String(strip.missingDataCount),
      tone: strip.missingDataCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.missingDataCount} deals with missing required fields`,
    },
    {
      label: 'Stale deals',
      value: String(strip.staleDealCount),
      tone: strip.staleDealCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.staleDealCount} deals with no record activity in 14+ days`,
    },
    {
      label: 'Outstanding docs',
      value: String(strip.outstandingDocumentCount),
      tone: strip.outstandingDocumentCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.outstandingDocumentCount} outstanding documents`,
    },
    {
      label: 'Open tasks',
      value: String(strip.openTaskCount),
      tone: strip.openTaskCount === 0 ? 'clear' : 'info',
      ariaLabel: `${strip.openTaskCount} open tasks`,
    },
    {
      label: 'Overdue tasks',
      value: String(strip.overdueTaskCount),
      tone: strip.overdueTaskCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.overdueTaskCount} overdue tasks`,
    },
    {
      label: 'Avg days in stage',
      value:
        strip.avgDaysInStage === undefined
          ? 'Not yet wired'
          : `${strip.avgDaysInStage}d`,
      tone: 'info',
      ariaLabel:
        strip.avgDaysInStage === undefined
          ? 'Average days in stage — no stage entry dates loaded'
          : `Average days in stage ${strip.avgDaysInStage}`,
    },
  ];

  return (
    <section
      style={styles.commandStrip}
      aria-label="Pipeline command strip"
      data-manager-cockpit-section="command-strip"
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
            data-manager-kpi={slug}
          >
            <span style={styles.kpiLabel}>{t.label}</span>
            <span style={styles.kpiValue}>{t.value}</span>
          </div>
        );
        const target = kpiTargets[slug];
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
// (2) Analytics grid — Phase 125A dense chart panel
// ---------------------------------------------------------------------------

function AnalyticsGrid({ rows }: { rows: ReadonlyArray<ManagerVMRow> }) {
  const stageData = useMemo(() => deriveStageDistribution(rows), [rows]);
  const bankerData = useMemo(
    () => deriveBankerAmountDistribution(rows),
    [rows],
  );
  const aging = useMemo(() => deriveAgingHistogram(rows), [rows]);
  const risk = useMemo(() => deriveRiskDistribution(rows), [rows]);
  const forecast = useMemo(() => deriveClosingForecast(rows), [rows]);
  const missing = useMemo(() => deriveMissingFieldsDistribution(rows), [rows]);
  const quality = useMemo(() => deriveDataQualityDistribution(rows), [rows]);

  const stageBars: VerticalBarDatum[] = stageData.map((s) => ({
    label: s.stage,
    value: s.dealCount,
    tone: s.stage === 'Unset' ? 'neutral' : 'info',
  }));
  const bankerBars: HorizontalBarDatum[] = bankerData.map((b) => ({
    label: b.bankerName,
    value: b.dealCount,
    secondaryLabel: formatCurrencyCompact(b.totalAmount),
    tone: b.atRiskCount > 0 ? 'atRisk' : 'info',
  }));
  const tasksByBanker: HorizontalBarDatum[] = bankerData
    .filter((b) => b.openTaskCount > 0)
    .map((b) => ({
      label: b.bankerName,
      value: b.openTaskCount,
      secondaryLabel:
        b.overdueTaskCount > 0 ? `${b.overdueTaskCount} overdue` : undefined,
      tone: b.overdueTaskCount > 0 ? 'atRisk' : 'info',
    }));
  const docsByBanker: HorizontalBarDatum[] = bankerData
    .filter((b) => b.outstandingDocumentCount > 0)
    .map((b) => ({
      label: b.bankerName,
      value: b.outstandingDocumentCount,
      tone: 'atRisk',
    }));
  const missingBars: HorizontalBarDatum[] = missing.map((m) => ({
    label: m.label,
    value: m.dealCount,
    tone: 'atRisk',
  }));
  const qualityBars: HorizontalBarDatum[] = quality.map((q) => ({
    label: q.label,
    value: q.dealCount,
    tone:
      q.label === 'Complete (100%)'
        ? 'clear'
        : q.label === 'Sparse (<50%)'
          ? 'blocked'
          : 'atRisk',
  }));
  return (
    <section
      style={styles.analyticsGrid}
      aria-label="Analytics grid"
      data-manager-cockpit-section="analytics-grid"
    >
      <VerticalBarChart
        title="Pipeline by stage"
        subtitle="Deal count"
        data={stageBars}
        drillThroughSurface="manager_control_panel"
      />
      <HorizontalBarChart
        title="Pipeline by banker"
        subtitle="Deals + amount"
        data={bankerBars}
        drillThroughSurface="manager_control_panel"
      />
      <Histogram title="Aging — days in stage" data={aging.map((a) => ({
        label: a.label,
        value: a.dealCount,
        tone: a.lowDays >= 31 ? 'atRisk' : 'info',
      }))} drillThroughSurface="manager_control_panel" />
      <DonutChart
        title="Risk distribution"
        subtitle="Blocker pipeline"
        segments={[
          { label: 'Blocked', value: risk.blocked, tone: 'blocked' },
          { label: 'At risk', value: risk.atRisk, tone: 'atRisk' },
          { label: 'Clear', value: risk.clear, tone: 'clear' },
          { label: 'Unknown', value: risk.unknown, tone: 'neutral' },
        ]}
        drillThroughSurface="manager_control_panel"
      />
      <HorizontalBarChart
        title="Open tasks by banker"
        subtitle="Overdue highlighted"
        data={tasksByBanker}
        drillThroughSurface="manager_control_panel"
      />
      <HorizontalBarChart
        title="Outstanding docs by banker"
        data={docsByBanker}
        drillThroughSurface="manager_control_panel"
      />
      <ForecastSparkline
        title="Closings forecast"
        subtitle="Next 6 months"
        points={forecast.map((f) => ({
          label: f.label,
          dealCount: f.dealCount,
          totalAmount: f.totalAmount,
        }))}
        drillThroughSurface="manager_control_panel"
      />
      <HorizontalBarChart
        title="Missing fields"
        subtitle="Deals × field"
        data={missingBars}
        drillThroughSurface="manager_control_panel"
      />
      <HorizontalBarChart
        title="Data quality"
        subtitle="Completeness buckets"
        data={qualityBars}
        drillThroughSurface="manager_control_panel"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// (2) Exception Tape
// ---------------------------------------------------------------------------

function ExceptionTape({
  tape,
}: {
  tape: {
    blocked: ManagerExceptionRow[];
    atRisk: ManagerExceptionRow[];
    missingFields: ManagerExceptionRow[];
    stale: ManagerExceptionRow[];
  };
}) {
  const buckets: Array<{
    key: ManagerExceptionSeverity;
    label: string;
    rows: ManagerExceptionRow[];
  }> = [
    { key: 'blocked', label: 'Blocked', rows: tape.blocked },
    { key: 'at-risk', label: 'At risk', rows: tape.atRisk },
    { key: 'missing', label: 'Missing fields', rows: tape.missingFields },
    { key: 'stale', label: 'Stale', rows: tape.stale },
  ];
  return (
    <section
      style={styles.exceptionTape}
      aria-label="Exception tape"
      data-manager-cockpit-section="exception-tape"
    >
      {buckets.map((b) => (
        <ExceptionBucket key={b.key} label={b.label} severity={b.key} rows={b.rows} />
      ))}
    </section>
  );
}

function ExceptionBucket({
  label,
  severity,
  rows,
}: {
  label: string;
  severity: ManagerExceptionSeverity;
  rows: ManagerExceptionRow[];
}) {
  const tone = severityTone(severity);
  return (
    <div
      style={{
        ...styles.exceptionBucket,
        borderLeftColor: severityPalette[tone].bar,
      }}
      aria-label={`${label} bucket`}
      data-manager-cockpit-bucket={severity}
    >
      <header style={styles.bucketHeader}>
        <span style={styles.bucketLabel}>{label}</span>
        <span
          style={{
            ...styles.bucketCount,
            background: severityPalette[tone].bg,
            color: severityPalette[tone].fg,
          }}
        >
          {rows.length}
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>None.</p>
      ) : (
        <ul style={styles.bucketList}>
          {rows.map((r) => (
            <li
              key={r.dealId}
              style={styles.bucketRow}
              data-manager-exception-row={r.dealId}
            >
              <div style={styles.bucketRowHead}>
                <Link
                  to={`/deals/${r.dealId}`}
                  style={styles.bucketRowLink}
                  aria-label={`Open ${r.dealName} in the deal workspace`}
                  data-manager-drilldown-deal={r.dealId}
                >
                  {r.dealName}
                </Link>
                <span style={styles.bucketRowAmount}>{formatAmount(r.amount)}</span>
              </div>
              <div style={styles.bucketRowSub}>
                <span>{r.bankerName ?? 'Unassigned'}</span>
                <span style={styles.bucketRowSep} aria-hidden="true">·</span>
                <span style={styles.bucketRowReason}>{r.reason}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (3) Banker Workload
// ---------------------------------------------------------------------------

function BankerWorkload({ rows }: { rows: BankerWorkloadRow[] }) {
  return (
    <section
      style={styles.workload}
      aria-label="Banker workload"
      data-manager-cockpit-section="banker-workload"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Banker workload</h3>
        <span style={styles.sectionMeta}>
          {rows.length} banker{rows.length === 1 ? '' : 's'} on team
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No bankers on this team.</p>
      ) : (
        <table style={styles.workloadTable} aria-label="Banker workload table">
          <thead>
            <tr>
              <th style={styles.workloadTh}>Banker</th>
              <th style={styles.workloadThNum}>Active deals</th>
              <th style={styles.workloadThNum}>Pipeline $</th>
              <th style={styles.workloadThNum}>Open tasks</th>
              <th style={styles.workloadThNum}>Outstanding docs</th>
              <th style={styles.workloadThNum}>Blocked / at-risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bankerId} data-manager-banker-row={r.bankerId}>
                <td style={styles.workloadTd}>{r.bankerName}</td>
                <td style={styles.workloadTdNum}>{r.activeDealCount}</td>
                <td style={styles.workloadTdNum}>{formatCurrency(r.totalAmount)}</td>
                <td style={styles.workloadTdNum}>{r.openTaskCount}</td>
                <td style={styles.workloadTdNum}>{r.outstandingDocumentCount}</td>
                <td style={styles.workloadTdNum}>{r.atRiskCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// (4) Top Deals
// ---------------------------------------------------------------------------

function TopDeals({ rows }: { rows: ManagerTopDealRow[] }) {
  return (
    <section
      style={styles.topDeals}
      aria-label="Top deals by amount"
      data-manager-cockpit-section="top-deals"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Top deals by amount</h3>
        <span style={styles.sectionMeta}>
          Showing {rows.length} of pipeline
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No deals to display.</p>
      ) : (
        <ul style={styles.topDealList}>
          {rows.map((r) => (
            <li
              key={r.dealId}
              style={styles.topDealRow}
              data-manager-top-deal-row={r.dealId}
            >
              <div style={styles.topDealHead}>
                <Link
                  to={`/deals/${r.dealId}`}
                  style={styles.topDealLink}
                  aria-label={`Open ${r.dealName} in the deal workspace`}
                  data-manager-drilldown-deal={r.dealId}
                >
                  {r.dealName}
                </Link>
                <span style={styles.topDealAmount}>{formatAmount(r.amount)}</span>
              </div>
              <div style={styles.topDealMeta}>
                <MetaCell label="Client" value={r.clientName ?? 'Not set'} />
                <MetaCell label="Stage" value={r.stage ?? 'Not set'} />
                <MetaCell label="Status" value={r.status ?? 'Not set'} />
                <MetaCell label="Banker" value={r.bankerName ?? 'Unassigned'} />
                {/* Phase 125B — reference rows surfaced when present;
                    omitted entirely when undefined so the meta grid
                    does not pollute the cockpit with "Not set" cells
                    for fields that legitimately haven't been wired
                    yet on early-stage deals. */}
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
              <div style={styles.topDealFoot}>
                <span
                  style={{
                    ...styles.statusChip,
                    background: severityPalette[severityToneForVm(r.blockerStatus)].bg,
                    color: severityPalette[severityToneForVm(r.blockerStatus)].fg,
                  }}
                  aria-label={`Blocker status ${r.blockerStatus ?? 'unknown'}`}
                  data-manager-blocker-status={r.blockerStatus ?? 'unknown'}
                >
                  {labelForBlockerStatus(r.blockerStatus)}
                </span>
                {r.nextBestAction ? (
                  <span
                    style={styles.nextBestAction}
                    data-manager-next-best-action-id={r.nextBestAction.id}
                  >
                    Next: {r.nextBestAction.label}
                  </span>
                ) : (
                  <span style={styles.nextBestActionMuted}>No mechanical signal</span>
                )}
              </div>
            </li>
          ))}
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

/**
 * Phase 130A — concise, honest KPI summary lines for the Copilot
 * workspace context. Derived purely from the command strip the cockpit
 * already renders. No predictive language, no GUIDs.
 */
function managerCopilotKpiSummaries(
  strip: ManagerPipelineCommandStrip,
): string[] {
  return [
    `Active deals: ${strip.activeDealCount}`,
    `Pipeline amount: ${formatCurrencyCompact(strip.totalPipelineAmount)}`,
    `Blocked: ${strip.blockedDealCount} · At risk: ${strip.atRiskDealCount}`,
    `Missing data: ${strip.missingDataCount} · Stale: ${strip.staleDealCount}`,
    `Outstanding docs: ${strip.outstandingDocumentCount} · Open tasks: ${strip.openTaskCount} · Overdue: ${strip.overdueTaskCount}`,
    `Closing next 30d: ${strip.closingNext30DayCount}`,
  ];
}

function formatAmount(amount: number | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'No amount';
  return formatCurrency(amount);
}

function formatCurrencyCompact(amount: number): string {
  // Compact USD format for the KPI ribbon (e.g. $2.5M, $750K).
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${amount}`;
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

function severityTone(
  s: ManagerExceptionSeverity,
): 'blocked' | 'atRisk' | 'info' | 'neutral' {
  switch (s) {
    case 'blocked':
      return 'blocked';
    case 'at-risk':
      return 'atRisk';
    case 'missing':
      return 'atRisk';
    case 'stale':
      return 'neutral';
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
  bottomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: spacing.md,
    alignItems: 'start',
  },
  bucketRowLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  topDealLink: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
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
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.sm,
    alignItems: 'stretch',
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
  exceptionTape: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: spacing.sm,
  },
  exceptionBucket: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderLeft: '3px solid',
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    minWidth: 0,
  },
  bucketHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bucketLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  bucketCount: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  bucketEmpty: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
  },
  bucketList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  bucketRow: {
    padding: `${spacing.xs} 0`,
    borderTop: `1px dashed ${palette.divider}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  bucketRowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bucketRowName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  bucketRowAmount: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.textMuted,
    fontFamily: typography.mono,
  },
  bucketRowSub: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  bucketRowSep: {
    color: palette.textSubtle,
  },
  bucketRowReason: {
    color: palette.textMuted,
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
  workload: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    overflowX: 'auto' as const,
  },
  workloadTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: typography.size.sm,
  },
  workloadTh: {
    textAlign: 'left' as const,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px solid ${palette.divider}`,
  },
  workloadThNum: {
    textAlign: 'right' as const,
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px solid ${palette.divider}`,
  },
  workloadTd: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px dashed ${palette.divider}`,
    color: palette.text,
  },
  workloadTdNum: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderBottom: `1px dashed ${palette.divider}`,
    color: palette.text,
    fontFamily: typography.mono,
    textAlign: 'right' as const,
  },
  topDeals: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
  },
  topDealList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  topDealRow: {
    padding: `${spacing.sm} 0`,
    borderTop: `1px dashed ${palette.divider}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  topDealHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  topDealName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  topDealAmount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
  },
  topDealMeta: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: spacing.xs,
  },
  topDealFoot: {
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
  nextBestAction: {
    fontSize: typography.size.sm,
    color: palette.text,
    fontWeight: typography.weight.semibold,
  },
  nextBestActionMuted: {
    fontSize: typography.size.sm,
    color: palette.textSubtle,
    fontStyle: 'italic' as const,
  },
};

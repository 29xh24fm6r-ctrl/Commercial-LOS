import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useExecutiveData } from './ExecutiveDataProvider';
import {
  deriveExecutiveCommandSnapshot,
  executiveCopilotSummaries,
  type ExecutiveCommandSnapshot,
  type ExecutiveKpiRibbon,
  type ExecutiveTopDealRow,
  type ExecutiveRiskDistribution,
  type ExecutiveDataQuality,
} from './executiveCommandSnapshot';
import {
  VerticalBarChart,
  HorizontalBarChart,
  DonutChart,
  ForecastSparkline,
} from '../shared/CommandChartPrimitives';
import {
  stageCountBars,
  stageExposureBars,
  readinessDonutSegments,
  closingForecastPoints,
  executiveExceptionTape,
  type ExecutiveExceptionBucket,
} from './executiveDashboardCharts';
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
 * Phase 133A — Executive Command Center.
 *
 * Board/executive read-only cockpit. Consumes ONLY the data the
 * Executive Workspace already loads via ExecutiveDataProvider (governed
 * readiness snapshots + transitional stage / closing-forecast
 * aggregates + performance metrics). It does NOT touch the manager /
 * banker / portfolio operational providers (SPEC W2 isolation).
 *
 * Honest omissions are rendered in copy: per-deal dollar exposure,
 * exposure by product / banker, task counts, average days-in-stage,
 * profitability, yield, approval probability, and enterprise-wide
 * exposure are not derived because the executive snapshot does not
 * carry those fields. No predictive ranking is shown — "deals to watch"
 * are ranked by readiness concern, not by a fabricated score.
 */
export function ExecutiveCommandCenter() {
  const {
    snapshotReadiness,
    snapshotPerformance,
    snapshotProfitability,
    fallbackPipelineByStage,
    fallbackClosingForecast,
  } = useExecutiveData();

  // Phase 134B — performance + profitability are NON-CORE slots. They
  // never gate the cockpit (the three core slots below do). We surface
  // only honest availability counts; their per-banker / revenue / ROE
  // breakdowns are intentionally NOT rendered (see the "not yet wired"
  // panel + honest omissions).
  const performanceAvailableCount =
    snapshotPerformance.kind === 'ready' ? snapshotPerformance.data.length : 0;
  const profitabilityAvailableCount =
    snapshotProfitability.kind === 'ready'
      ? snapshotProfitability.data.length
      : 0;

  const failureSlot =
    snapshotReadiness.kind === 'failed'
      ? { name: 'readiness snapshots', message: snapshotReadiness.message }
      : fallbackPipelineByStage.kind === 'failed'
        ? { name: 'pipeline by stage', message: fallbackPipelineByStage.message }
        : fallbackClosingForecast.kind === 'failed'
          ? { name: 'closing forecast', message: fallbackClosingForecast.message }
          : undefined;

  const allReady =
    snapshotReadiness.kind === 'ready' &&
    fallbackPipelineByStage.kind === 'ready' &&
    fallbackClosingForecast.kind === 'ready';

  const snapshot = useMemo(() => {
    if (
      snapshotReadiness.kind !== 'ready' ||
      fallbackPipelineByStage.kind !== 'ready' ||
      fallbackClosingForecast.kind !== 'ready'
    ) {
      return undefined;
    }
    return deriveExecutiveCommandSnapshot({
      readiness: snapshotReadiness.data,
      pipelineByStage: fallbackPipelineByStage.data,
      closingForecast: fallbackClosingForecast.data,
      performance:
        snapshotPerformance.kind === 'ready' ? snapshotPerformance.data : [],
    });
  }, [
    snapshotReadiness,
    snapshotPerformance,
    fallbackPipelineByStage,
    fallbackClosingForecast,
  ]);

  // Read-only Copilot context (default not_configured → no proposals,
  // no external call). Counts + label summaries only; no GUIDs.
  const copilotContext =
    snapshot && !snapshot.isEmpty
      ? buildWorkspaceCopilotContext({
          workspaceRole: 'executive',
          userName: undefined,
          teamName: undefined,
          deals: Array.from(
            { length: snapshot.ribbon.totalActiveDeals },
            (_, i) => ({ id: `d${i}`, name: '', stage: undefined }),
          ),
          urgentItems: snapshot.topBlockers.map((d) => ({ label: d.dealName })),
          kpiSummaries: executiveCopilotSummaries(snapshot),
        })
      : undefined;
  const copilotProposals =
    copilotContext && snapshot
      ? getCopilotConnector().assistWorkspace({
          workspace: copilotContext,
          topBlockers: snapshot.topBlockers.map((d) => d.dealName),
        }).proposed_actions
      : undefined;

  return (
    <section
      style={styles.deck}
      aria-label="Executive Command Center"
      data-executive-cockpit="command-center"
    >
      <header style={styles.header}>
        <div style={styles.headerTitleBlock}>
          <div style={styles.eyebrow}>Executive Cockpit</div>
          <h2 style={styles.title}>Executive Command Center</h2>
          <p style={styles.subtitle}>
            Strategic, read-only roll-up of lending activity, exposure, risk
            posture, operations health, and data quality.
          </p>
        </div>
        <span style={styles.readOnlyChip} aria-label="Read-only executive view">
          Read-only
        </span>
      </header>

      {failureSlot && (
        <FailureState slot={failureSlot.name} message={failureSlot.message} />
      )}
      {!failureSlot && !allReady && <LoadingStrip />}
      {!failureSlot && allReady && snapshot && snapshot.isEmpty && <EmptyState />}
      {!failureSlot && allReady && snapshot && !snapshot.isEmpty && (
        <div style={styles.body}>
          {copilotContext && (
            <div data-cockpit-copilot="executive">
              <CopilotAssistPanel
                surface="workspace"
                workspaceContext={copilotContext}
                proposedActions={copilotProposals}
              />
            </div>
          )}
          <KpiRibbon ribbon={snapshot.ribbon} />
          <ExceptionTape buckets={executiveExceptionTape(snapshot)} />
          <StrategicRiskStrip
            risk={snapshot.riskDistribution}
            ribbon={snapshot.ribbon}
          />
          <div style={styles.twoCol}>
            <PortfolioExposureSummary snapshot={snapshot} />
            <StageDistribution snapshot={snapshot} />
          </div>
          <ClosingForecastCard snapshot={snapshot} />
          <div style={styles.twoCol}>
            <OperationsHealthSummary ribbon={snapshot.ribbon} />
            <DataQualitySummary dq={snapshot.dataQuality} />
          </div>
          <div style={styles.twoCol}>
            <TopDealsToWatch rows={snapshot.topDeals} />
            <TopBottlenecks rows={snapshot.topBlockers} />
          </div>
          <PerformanceProfitabilityPanel
            performanceCount={performanceAvailableCount}
            profitabilityCount={profitabilityAvailableCount}
          />
          <HonestOmissions />
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
      data-executive-cockpit-state="loading"
    >
      Loading authorized executive snapshot…
    </div>
  );
}

function FailureState({ slot, message }: { slot: string; message: string }) {
  return (
    <div role="alert" style={styles.failureRow} data-executive-cockpit-state="failed">
      <span style={styles.failureLabel}>
        Could not load {slot}. The executive view is failing closed.
      </span>
      <span style={styles.failureDetail}>{message}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.emptyRow}
      data-executive-cockpit-state="empty"
    >
      No authorized executive snapshot records found. This is an expected
      state until executive snapshot data is available — no metrics are
      fabricated to fill the view.
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI ribbon
// ---------------------------------------------------------------------------

function KpiRibbon({ ribbon }: { ribbon: ExecutiveKpiRibbon }) {
  const tiles: Array<{
    label: string;
    value: string;
    tone: 'info' | 'clear' | 'atRisk' | 'blocked';
    ariaLabel: string;
  }> = [
    { label: 'Active deals', value: String(ribbon.totalActiveDeals), tone: 'info', ariaLabel: `${ribbon.totalActiveDeals} active deals` },
    { label: 'Total exposure', value: formatCurrencyCompact(ribbon.totalExposure), tone: 'info', ariaLabel: `Total exposure ${formatCurrency(ribbon.totalExposure)}` },
    {
      label: ribbon.closingWindowLabel ? `Closing — ${ribbon.closingWindowLabel}` : 'Closing window',
      value: formatCurrencyCompact(ribbon.closingWindowExposure),
      tone: 'info',
      ariaLabel: `Closing-window exposure ${formatCurrency(ribbon.closingWindowExposure)}`,
    },
    { label: 'Blocked', value: String(ribbon.blockedCount), tone: ribbon.blockedCount === 0 ? 'clear' : 'blocked', ariaLabel: `${ribbon.blockedCount} blocked deals` },
    { label: 'At risk', value: String(ribbon.atRiskCount), tone: ribbon.atRiskCount === 0 ? 'clear' : 'atRisk', ariaLabel: `${ribbon.atRiskCount} at-risk deals` },
    { label: 'Open blockers', value: String(ribbon.openBlockerCount), tone: ribbon.openBlockerCount === 0 ? 'clear' : 'atRisk', ariaLabel: `${ribbon.openBlockerCount} open blockers` },
    { label: 'Outstanding docs', value: String(ribbon.outstandingDocumentCount), tone: ribbon.outstandingDocumentCount === 0 ? 'clear' : 'atRisk', ariaLabel: `${ribbon.outstandingDocumentCount} outstanding documents` },
    { label: 'Pending approvals', value: String(ribbon.pendingApprovalCount), tone: ribbon.pendingApprovalCount === 0 ? 'clear' : 'info', ariaLabel: `${ribbon.pendingApprovalCount} pending approvals` },
    { label: 'Stale items', value: String(ribbon.staleItemCount), tone: ribbon.staleItemCount === 0 ? 'clear' : 'atRisk', ariaLabel: `${ribbon.staleItemCount} stale items` },
    { label: 'Readiness unknown', value: String(ribbon.readinessUnknownCount), tone: ribbon.readinessUnknownCount === 0 ? 'clear' : 'atRisk', ariaLabel: `${ribbon.readinessUnknownCount} deals without a readiness band` },
  ];
  return (
    <section style={styles.commandStrip} aria-label="Executive KPI ribbon" data-executive-cockpit-section="kpi-ribbon">
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{ ...styles.kpiTile, borderTopColor: severityPalette[t.tone].bar }}
          aria-label={t.ariaLabel}
          data-executive-kpi={t.label.toLowerCase().replace(/\s+/g, '-')}
        >
          <span style={styles.kpiLabel}>{t.label}</span>
          <span style={styles.kpiValue}>{t.value}</span>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Strategic risk strip
// ---------------------------------------------------------------------------

function StrategicRiskStrip({
  risk,
  ribbon,
}: {
  risk: ExecutiveRiskDistribution;
  ribbon: ExecutiveKpiRibbon;
}) {
  return (
    <section style={styles.panel} aria-label="Strategic risk strip" data-executive-cockpit-section="strategic-risk">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Strategic risk posture</h3>
        <span style={styles.sectionMeta}>Readiness distribution</span>
      </header>
      <div style={styles.twoCol}>
        <DonutChart
          title="Readiness distribution"
          subtitle="Across authorized readiness snapshots"
          segments={readinessDonutSegments(risk)}
        />
        <div style={styles.statColumn}>
          <Stat label="Blocked deals" value={String(ribbon.blockedCount)} tone="blocked" />
          <Stat label="At risk (low readiness)" value={String(ribbon.atRiskCount)} tone="atRisk" />
          <Stat label="Scored deals" value={String(ribbon.readinessScoredCount)} tone="info" />
          <Stat label="No readiness band" value={String(ribbon.readinessUnknownCount)} tone="atRisk" />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Portfolio exposure summary
// ---------------------------------------------------------------------------

function PortfolioExposureSummary({
  snapshot,
}: {
  snapshot: ExecutiveCommandSnapshot;
}) {
  return (
    <section style={styles.panel} aria-label="Portfolio exposure summary" data-executive-cockpit-section="exposure">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Portfolio exposure</h3>
        <span style={styles.sectionMeta}>By stage · {formatCurrency(snapshot.ribbon.totalExposure)}</span>
      </header>
      <HorizontalBarChart
        title="Exposure by stage"
        subtitle="$ + share"
        data={stageExposureBars(snapshot)}
        valueFormatter={formatCurrencyCompact}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Stage distribution (deal count by stage)
// ---------------------------------------------------------------------------

function StageDistribution({
  snapshot,
}: {
  snapshot: ExecutiveCommandSnapshot;
}) {
  return (
    <section style={styles.panel} aria-label="Stage distribution" data-executive-cockpit-section="stage-distribution">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Stage distribution</h3>
        <span style={styles.sectionMeta}>{snapshot.ribbon.totalActiveDeals} active deals</span>
      </header>
      <VerticalBarChart
        title="Deals by stage"
        subtitle="Count per stage"
        data={stageCountBars(snapshot)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Closing forecast (its own card)
// ---------------------------------------------------------------------------

function ClosingForecastCard({
  snapshot,
}: {
  snapshot: ExecutiveCommandSnapshot;
}) {
  const points = closingForecastPoints(snapshot);
  return (
    <section style={styles.panel} aria-label="Closing forecast" data-executive-cockpit-section="closing-forecast">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Closing forecast</h3>
        <span style={styles.sectionMeta}>Upcoming windows</span>
      </header>
      {points.length === 0 ? (
        <p style={styles.bucketEmpty}>No upcoming closing windows in the forecast.</p>
      ) : (
        <ForecastSparkline title="Closing forecast" subtitle="$ by window" points={points} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Executive exception tape
// ---------------------------------------------------------------------------

function ExceptionTape({
  buckets,
}: {
  buckets: ReadonlyArray<ExecutiveExceptionBucket>;
}) {
  return (
    <section style={styles.exceptionTape} aria-label="Executive exception tape" data-executive-cockpit-section="exception-tape">
      {buckets.map((b) => (
        <div
          key={b.key}
          style={{ ...styles.exceptionBucket, borderLeftColor: severityPalette[b.tone].bar }}
          data-executive-exception={b.key}
          aria-label={`${b.label}: ${b.count}`}
        >
          <span style={styles.exceptionLabel}>{b.label}</span>
          <span
            style={{
              ...styles.exceptionCount,
              background: severityPalette[b.tone].bg,
              color: severityPalette[b.tone].fg,
            }}
          >
            {b.count}
          </span>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Performance & profitability availability (honest "not yet wired")
// ---------------------------------------------------------------------------

function PerformanceProfitabilityPanel({
  performanceCount,
  profitabilityCount,
}: {
  performanceCount: number;
  profitabilityCount: number;
}) {
  return (
    <section
      style={styles.panel}
      aria-label="Performance and profitability availability"
      data-executive-cockpit-section="performance-profitability"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Performance &amp; profitability</h3>
        <span style={styles.sectionMeta}>Not yet wired</span>
      </header>
      <div style={styles.statRow}>
        <Stat label="Performance metric rows" value={String(performanceCount)} tone="info" />
        <Stat label="Profitability snapshots" value={String(profitabilityCount)} tone="info" />
      </div>
      <p style={styles.note}>
        Per-banker production, revenue, ROE, yield, and margin breakdowns are
        Not yet wired in the executive cockpit. Only the availability counts
        above are shown — no figures are derived from these slots, and a
        failed load of either does not affect the cockpit.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Operations health summary
// ---------------------------------------------------------------------------

function OperationsHealthSummary({ ribbon }: { ribbon: ExecutiveKpiRibbon }) {
  return (
    <section style={styles.panel} aria-label="Operations health summary" data-executive-cockpit-section="operations">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Operations health</h3>
        <span style={styles.sectionMeta}>From readiness snapshots</span>
      </header>
      <div style={styles.statColumn}>
        <Stat label="Open blockers" value={String(ribbon.openBlockerCount)} tone={ribbon.openBlockerCount === 0 ? 'clear' : 'atRisk'} />
        <Stat label="Outstanding documents" value={String(ribbon.outstandingDocumentCount)} tone={ribbon.outstandingDocumentCount === 0 ? 'clear' : 'atRisk'} />
        <Stat label="Pending approvals" value={String(ribbon.pendingApprovalCount)} tone="info" />
        <Stat label="Stale items" value={String(ribbon.staleItemCount)} tone={ribbon.staleItemCount === 0 ? 'clear' : 'atRisk'} />
      </div>
      <p style={styles.note}>
        Task and overdue-task counts and average days-in-stage are not part
        of the executive snapshot and are intentionally omitted.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Data quality / readiness
// ---------------------------------------------------------------------------

function DataQualitySummary({ dq }: { dq: ExecutiveDataQuality }) {
  return (
    <section style={styles.panel} aria-label="Data quality and readiness summary" data-executive-cockpit-section="data-quality">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Data quality &amp; readiness</h3>
        <span style={styles.sectionMeta}>Snapshot completeness</span>
      </header>
      <div style={styles.statRow}>
        <Stat label="Scored deals" value={String(dq.readinessScored)} tone="clear" />
        <Stat label="No readiness band" value={String(dq.readinessUnknown)} tone={dq.readinessUnknown === 0 ? 'clear' : 'atRisk'} />
        <Stat label="Deals missing docs" value={String(dq.dealsWithMissingDocs)} tone={dq.dealsWithMissingDocs === 0 ? 'clear' : 'atRisk'} />
        <Stat label="Deals with stale items" value={String(dq.dealsWithStaleItems)} tone={dq.dealsWithStaleItems === 0 ? 'clear' : 'atRisk'} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Top deals to watch / bottlenecks (deal links)
// ---------------------------------------------------------------------------

function TopDealsToWatch({ rows }: { rows: ReadonlyArray<ExecutiveTopDealRow> }) {
  return (
    <section style={styles.panel} aria-label="Top deals to watch" data-executive-cockpit-section="top-deals">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Top deals to watch</h3>
        <span style={styles.sectionMeta}>Ranked by readiness</span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No readiness snapshots to display.</p>
      ) : (
        <ul style={styles.dealList}>
          {rows.map((r, i) => (
            <DealRow key={`${r.dealId ?? r.dealName}-${i}`} row={r} metric={readinessMeta(r)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TopBottlenecks({ rows }: { rows: ReadonlyArray<ExecutiveTopDealRow> }) {
  return (
    <section style={styles.panel} aria-label="Top operational bottlenecks" data-executive-cockpit-section="top-bottlenecks">
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Top bottlenecks</h3>
        <span style={styles.sectionMeta}>Most open blockers</span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No open blockers across authorized snapshots.</p>
      ) : (
        <ul style={styles.dealList}>
          {rows.map((r, i) => (
            <DealRow
              key={`${r.dealId ?? r.dealName}-${i}`}
              row={r}
              metric={`${r.openBlockersCount} open blocker(s) · ${r.missingDocsCount} doc(s)`}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DealRow({ row, metric }: { row: ExecutiveTopDealRow; metric: string }) {
  const tone = bandTone(row.readinessBand);
  return (
    <li style={styles.dealRow} data-executive-deal={row.dealId ?? row.dealName}>
      <div style={styles.dealHead}>
        {row.dealId ? (
          <Link
            to={`/deals/${row.dealId}`}
            style={styles.dealLink}
            aria-label={`Open ${row.dealName} in the deal workspace`}
            data-executive-deal-link={row.dealId}
          >
            {row.dealName}
          </Link>
        ) : (
          <span style={styles.dealName}>{row.dealName}</span>
        )}
        <span
          style={{ ...styles.bandChip, background: severityPalette[tone].bg, color: severityPalette[tone].fg }}
        >
          {row.readinessBandLabel ?? row.readinessBand ?? 'No band'}
        </span>
      </div>
      <span style={styles.dealMetric}>{metric}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Honest omissions
// ---------------------------------------------------------------------------

function HonestOmissions() {
  return (
    <section style={styles.omissions} aria-label="Executive view limitations" data-executive-cockpit-section="omissions">
      <p style={styles.note}>
        Executive view is derived from authorized lending records currently
        available to this workspace.
      </p>
      <p style={styles.noteSubtle}>
        Profitability, yield, legal lending limit, CECL/ALLL,
        criticized/classified assets, and enterprise-wide exposure require
        additional source fields and governance.
      </p>
      <p style={styles.noteSubtle}>
        No approval probabilities or predictive rankings are shown.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small components / helpers
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'info' | 'clear' | 'atRisk' | 'blocked';
}) {
  return (
    <div style={{ ...styles.stat, borderLeftColor: severityPalette[tone].bar }}>
      <span style={styles.statLabel}>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

function readinessMeta(r: ExecutiveTopDealRow): string {
  return `${r.openBlockersCount} blocker(s) · ${r.missingDocsCount} doc(s) · ${r.pendingApprovalsCount} approval(s)`;
}

function bandTone(
  band: ExecutiveTopDealRow['readinessBand'],
): 'blocked' | 'atRisk' | 'info' | 'clear' | 'neutral' {
  switch (band) {
    case 'Blocked':
      return 'blocked';
    case 'Low':
      return 'atRisk';
    case 'Medium':
      return 'info';
    case 'High':
      return 'clear';
    default:
      return 'neutral';
  }
}

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
  headerTitleBlock: { display: 'flex', flexDirection: 'column' as const, gap: 2, minWidth: 0 },
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
    maxWidth: 620,
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
  statusRow: { padding: `${spacing.md} ${spacing.sm}`, color: palette.textMuted, fontSize: typography.size.sm, fontStyle: 'italic' as const },
  failureRow: {
    padding: `${spacing.md} ${spacing.sm}`,
    background: severityPalette.blocked.bg,
    color: severityPalette.blocked.fg,
    borderRadius: radius.md,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  failureLabel: { fontWeight: typography.weight.bold, fontSize: typography.size.sm },
  failureDetail: { fontSize: typography.size.xs, opacity: 0.85 },
  emptyRow: {
    padding: `${spacing.md} ${spacing.sm}`,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: spacing.md },
  commandStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
  kpiValue: { fontSize: typography.size.xl, fontWeight: typography.weight.bold, color: palette.text, lineHeight: typography.lineHeight.tight },
  panel: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
    minWidth: 0,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: spacing.sm,
    alignItems: 'start',
  },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: spacing.xs },
  sectionTitle: { margin: 0, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: palette.text },
  sectionMeta: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  statColumn: { display: 'flex', flexDirection: 'column' as const, gap: spacing.xs },
  statRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.xs },
  exceptionTape: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
    gap: spacing.sm,
  },
  exceptionBucket: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderLeft: '3px solid',
    borderRadius: radius.md,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  exceptionLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  exceptionCount: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    flexShrink: 0,
  },
  stat: {
    background: palette.surface,
    borderLeft: '3px solid',
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  statLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  statValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: palette.text },
  dealList: { listStyle: 'none' as const, margin: 0, padding: 0, display: 'flex', flexDirection: 'column' as const, gap: spacing.xs },
  dealRow: {
    padding: `${spacing.xs} 0`,
    borderTop: `1px dashed ${palette.divider}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  dealHead: { display: 'flex', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'baseline' },
  dealLink: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.primary, textDecoration: 'none' as const },
  dealName: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: palette.text },
  bandChip: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  dealMetric: { fontSize: typography.size.xs, color: palette.textMuted },
  bucketEmpty: { margin: 0, fontSize: typography.size.sm, color: palette.textMuted, fontStyle: 'italic' as const },
  omissions: {
    background: palette.deckBg,
    border: `1px dashed ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  note: { margin: 0, fontSize: typography.size.xs, color: palette.textMuted, fontStyle: 'italic' as const, lineHeight: typography.lineHeight.snug },
  noteSubtle: { margin: 0, fontSize: typography.size.xs, color: palette.textSubtle, lineHeight: typography.lineHeight.snug },
};

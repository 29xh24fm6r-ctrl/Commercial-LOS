import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTeamData } from './TeamDataProvider';
import {
  deriveTeamOpsQueueSnapshot,
  type TeamOpsCommandRibbon,
  type TeamOpsQueueLanes,
  type TeamBankerWorkloadRow,
  type WorkItem,
  type WorkItemSeverity,
} from './teamOpsQueueSnapshot';
import {
  deriveWorkItemTypeCounts,
  deriveOverdueByBanker,
  deriveOutstandingDocsByBanker,
  deriveRiskDistributionForTeam,
  deriveClosingForecastForTeam,
} from './teamOpsQueueDashboardCharts';
import {
  VerticalBarChart,
  HorizontalBarChart,
  DonutChart,
  ForecastSparkline,
} from '../shared/CommandChartPrimitives';
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
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { useDrillThroughDeepLink, deepLinkCardProps } from '../shared/drillthrough/useDrillThroughDeepLink';
import { teamOpsKpiTargets } from './teamOpsQueueDrillThrough';

/**
 * Phase 127A — Team Ops Queue.
 *
 * Dense execution-focused cockpit that lets a team see what must be
 * worked TODAY: overdue tasks, due-soon tasks, outstanding documents,
 * pending-review docs, missing data, stale deals, blocked / at-risk
 * deals, and closing-soon deals.
 *
 * Reads `useTeamData()` (the existing TeamDataProvider) and renders:
 *   1. 10-tile command ribbon
 *   2. 8 work-queue lanes (per execution category)
 *   3. Banker workload matrix
 *   4. Execution board — every work item flattened + sorted by
 *      severity + urgency, drill-down links to /deals/<id>
 *   5. Analytics row — work-items-by-type / overdue-by-banker /
 *      outstanding-docs-by-banker / risk-distribution / closings
 *      forecast (reuses the shared CommandChartPrimitives).
 *
 * Discipline:
 *   - No write affordances. Strictly read-only. Zero <button> /
 *     <form> / onClick / onSubmit (pinned by static-source tests).
 *   - No fake values. 'Unassigned' / 'Unknown' / 'Not set' /
 *     'No amount' / 'No date' only when source truly absent.
 *   - Fails closed when any of the three core data slots reports
 *     `failed`. No partial KPIs across a degraded load.
 *   - Honest empty state (zero deals on the team).
 *   - Permission-before-render preserved: mounted inside
 *     TeamProvider + TeamDataProvider; data scope is the
 *     authorized team pipeline.
 */
export function TeamOpsQueue() {
  const { deals, tasks, documents } = useTeamData();

  const failureSlot =
    deals.kind === 'failed'
      ? { name: 'team deals', message: deals.message }
      : tasks.kind === 'failed'
        ? { name: 'team tasks', message: tasks.message }
        : documents.kind === 'failed'
          ? { name: 'team documents', message: documents.message }
          : undefined;

  const allReady =
    deals.kind === 'ready' &&
    tasks.kind === 'ready' &&
    documents.kind === 'ready';

  const snapshot = useMemo(() => {
    if (deals.kind !== 'ready' || tasks.kind !== 'ready' || documents.kind !== 'ready') {
      return undefined;
    }
    return deriveTeamOpsQueueSnapshot({
      deals: deals.data,
      tasks: tasks.data,
      documents: documents.data,
    });
  }, [deals, tasks, documents]);

  // Phase 130A — read-only Copilot workspace context derived from the
  // SAME already-derived ops-queue snapshot. Counts + label summaries
  // only (the builder drops record ids), so no GUID and no cross-team
  // data reaches the assistant. Mounted only when ready + non-empty.
  const copilotContext =
    snapshot && !snapshot.isEmpty
      ? buildWorkspaceCopilotContext({
          workspaceRole: 'team',
          userName: undefined,
          teamName: undefined,
          deals: snapshot.vmRows.map((r) => ({
            id: r.teamDeal.id,
            name: r.teamDeal.name,
            stage: r.teamDeal.stage,
          })),
          urgentItems: snapshot.executionBoard.map((i) => ({ label: i.reason })),
          kpiSummaries: teamCopilotKpiSummaries(snapshot.commandRibbon),
        })
      : undefined;

  // SPEC-COPILOT-LIVE-CONNECTOR — confirmation-required proposals from the
  // governed connector. Empty in the default not_configured posture.
  const copilotProposals =
    copilotContext && snapshot
      ? getCopilotConnector().assistWorkspace({
          workspace: copilotContext,
          topBlockers: snapshot.executionBoard.map((i) => i.reason),
        }).proposed_actions
      : undefined;

  return (
    <section
      style={styles.deck}
      aria-label="Team Ops Queue"
      data-team-cockpit="ops-queue"
    >
      <header style={styles.header}>
        <div style={styles.headerTitleBlock}>
          <div style={styles.eyebrow}>Team Execution</div>
          <h2 style={styles.title}>Team Ops Queue</h2>
          <p style={styles.subtitle}>
            What must be worked today across the authorized team pipeline.
          </p>
        </div>
        <span style={styles.readOnlyChip} aria-label="Read-only team view">
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
            <div data-cockpit-copilot="team">
              <CopilotAssistPanel
                surface="workspace"
                workspaceContext={copilotContext}
                proposedActions={copilotProposals}
              />
            </div>
          )}
          <CommandRibbon ribbon={snapshot.commandRibbon} />
          <Lanes lanes={snapshot.lanes} />
          <BankerWorkloadMatrix rows={snapshot.bankerWorkload} />
          <ExecutionBoard items={snapshot.executionBoard} />
          <AnalyticsRow snapshot={snapshot} />
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
      data-team-cockpit-state="loading"
    >
      Loading authorized team queue…
    </div>
  );
}

function FailureState({ slot, message }: { slot: string; message: string }) {
  return (
    <div role="alert" style={styles.failureRow} data-team-cockpit-state="failed">
      <span style={styles.failureLabel}>
        Could not load {slot}. The queue is failing closed.
      </span>
      <span style={styles.failureDetail}>{message}</span>
      <span style={styles.failureHint}>
        No partial KPIs are shown across a failed load. Refresh to retry.
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.emptyRow}
      data-team-cockpit-state="empty"
    >
      No authorized team records found.
    </div>
  );
}

// ---------------------------------------------------------------------------
// (1) Command ribbon
// ---------------------------------------------------------------------------

function CommandRibbon({ ribbon }: { ribbon: TeamOpsCommandRibbon }) {
  // Phase 144B — each KPI tile becomes a read-only drill-through disclosure that
  // explains its contributing counts. The existing tile markup is preserved.
  const kpiTargets = teamOpsKpiTargets(ribbon);
  // Phase 144E — deep-link: a ?drill=<target id> param reopens the matching KPI
  // panel from the current authorized page (payload from `kpiTargets`, not URL).
  const deepLink = useDrillThroughDeepLink(Object.values(kpiTargets).map((t) => t.id));
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
      label: 'Open tasks',
      value: String(ribbon.openTaskCount),
      tone: ribbon.openTaskCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.openTaskCount} open tasks`,
    },
    {
      label: 'Overdue tasks',
      value: String(ribbon.overdueTaskCount),
      tone: ribbon.overdueTaskCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.overdueTaskCount} overdue tasks`,
    },
    {
      label: 'Due soon',
      value: String(ribbon.dueSoonTaskCount),
      tone: ribbon.dueSoonTaskCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.dueSoonTaskCount} tasks due in the next 7 days`,
    },
    {
      label: 'Outstanding docs',
      value: String(ribbon.outstandingDocumentCount),
      tone: ribbon.outstandingDocumentCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.outstandingDocumentCount} outstanding documents`,
    },
    {
      label: 'Pending review',
      value: String(ribbon.docsPendingReviewCount),
      tone: ribbon.docsPendingReviewCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.docsPendingReviewCount} documents pending review`,
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
      label: 'Stale deals',
      value: String(ribbon.staleDealCount),
      tone: ribbon.staleDealCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${ribbon.staleDealCount} deals with no record activity in 14+ days`,
    },
    {
      label: 'Closing 30d',
      value: String(ribbon.closingNext30DayCount),
      tone: ribbon.closingNext30DayCount === 0 ? 'clear' : 'info',
      ariaLabel: `${ribbon.closingNext30DayCount} deals closing in the next 30 days`,
    },
  ];
  return (
    <section
      style={styles.commandStrip}
      aria-label="Team command ribbon"
      data-team-cockpit-section="command-ribbon"
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
            data-team-kpi={slug}
          >
            <span style={styles.kpiLabel}>{t.label}</span>
            <span style={styles.kpiValue}>{t.value}</span>
          </div>
        );
        const target = kpiTargets[slug];
        return target ? (
          <DrillThroughCard key={t.label} target={target} unstyled {...deepLinkCardProps(deepLink, target.id)}>
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
// (2) Lanes
// ---------------------------------------------------------------------------

function Lanes({ lanes }: { lanes: TeamOpsQueueLanes }) {
  const laneList: Array<{
    label: string;
    severity: WorkItemSeverity;
    items: WorkItem[];
    dataKey: string;
  }> = [
    {
      label: 'Overdue tasks',
      severity: 'atRisk',
      items: lanes.overdueTasks,
      dataKey: 'overdue-tasks',
    },
    {
      label: 'Due soon tasks',
      severity: 'info',
      items: lanes.dueSoonTasks,
      dataKey: 'due-soon-tasks',
    },
    {
      label: 'Outstanding documents',
      severity: 'atRisk',
      items: lanes.outstandingDocuments,
      dataKey: 'outstanding-docs',
    },
    {
      label: 'Pending review docs',
      severity: 'info',
      items: lanes.pendingReviewDocs,
      dataKey: 'pending-review-docs',
    },
    {
      label: 'Missing data',
      severity: 'atRisk',
      items: lanes.missingData,
      dataKey: 'missing-data',
    },
    {
      label: 'Stale deals',
      severity: 'atRisk',
      items: lanes.staleDeals,
      dataKey: 'stale-deals',
    },
    {
      label: 'Blocked / at-risk',
      severity: 'blocked',
      items: lanes.blockedAtRisk,
      dataKey: 'blocked-at-risk',
    },
    {
      label: 'Closing soon',
      severity: 'info',
      items: lanes.closingSoon,
      dataKey: 'closing-soon',
    },
  ];
  return (
    <section
      style={styles.lanesGrid}
      aria-label="Work queue lanes"
      data-team-cockpit-section="lanes"
    >
      {laneList.map((lane) => (
        <Lane
          key={lane.dataKey}
          label={lane.label}
          severity={lane.severity}
          items={lane.items}
          dataKey={lane.dataKey}
        />
      ))}
    </section>
  );
}

function Lane({
  label,
  severity,
  items,
  dataKey,
}: {
  label: string;
  severity: WorkItemSeverity;
  items: WorkItem[];
  dataKey: string;
}) {
  const tone = severity === 'clear' ? 'info' : severity;
  return (
    <div
      style={{
        ...styles.lane,
        borderLeftColor: severityPalette[tone].bar,
      }}
      aria-label={`${label} lane`}
      data-team-lane={dataKey}
    >
      <header style={styles.laneHeader}>
        <span style={styles.laneLabel}>{label}</span>
        <span
          style={{
            ...styles.laneCount,
            background: severityPalette[tone].bg,
            color: severityPalette[tone].fg,
          }}
        >
          {items.length}
        </span>
      </header>
      {items.length === 0 ? (
        <p style={styles.laneEmpty}>None.</p>
      ) : (
        <ul style={styles.laneList}>
          {items.slice(0, 6).map((item) => (
            <li
              key={`${item.kind}-${item.itemId}`}
              style={styles.laneRow}
              data-team-lane-item={item.itemId}
            >
              <div style={styles.laneRowHead}>
                <Link
                  to={`/deals/${item.dealId}`}
                  style={styles.laneRowLink}
                  aria-label={`Open ${item.dealName} in the deal workspace`}
                  data-team-drilldown-deal={item.dealId}
                >
                  {item.title}
                </Link>
                <span style={styles.laneRowMeta}>
                  {formatUrgency(item)}
                </span>
              </div>
              <div style={styles.laneRowSub}>
                <span>{displayOwner(item)}</span>
                <span style={styles.laneRowSep} aria-hidden="true">·</span>
                <span style={styles.laneRowReason}>{item.reason}</span>
              </div>
            </li>
          ))}
          {items.length > 6 && (
            <li style={styles.laneRowOverflow}>
              +{items.length - 6} more on the execution board.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// (3) Banker workload matrix
// ---------------------------------------------------------------------------

function BankerWorkloadMatrix({
  rows,
}: {
  rows: ReadonlyArray<TeamBankerWorkloadRow>;
}) {
  return (
    <section
      style={styles.workload}
      aria-label="Banker workload matrix"
      data-team-cockpit-section="banker-workload"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Banker workload</h3>
        <span style={styles.sectionMeta}>
          {rows.length} banker{rows.length === 1 ? '' : 's'}
        </span>
      </header>
      {rows.length === 0 ? (
        <p style={styles.bucketEmpty}>No bankers on this team yet.</p>
      ) : (
        <table style={styles.workloadTable} aria-label="Banker workload table">
          <thead>
            <tr>
              <th style={styles.workloadTh}>Banker</th>
              <th style={styles.workloadThNum}>Active</th>
              <th style={styles.workloadThNum}>Open tasks</th>
              <th style={styles.workloadThNum}>Overdue</th>
              <th style={styles.workloadThNum}>Outstanding docs</th>
              <th style={styles.workloadThNum}>Blocked / at-risk</th>
              <th style={styles.workloadThNum}>Closing 30d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bankerId} data-team-banker-row={r.bankerId}>
                <td style={styles.workloadTd}>{r.bankerName}</td>
                <td style={styles.workloadTdNum}>{r.activeDealCount}</td>
                <td style={styles.workloadTdNum}>{r.openTaskCount}</td>
                <td style={styles.workloadTdNum}>{r.overdueTaskCount}</td>
                <td style={styles.workloadTdNum}>{r.outstandingDocumentCount}</td>
                <td style={styles.workloadTdNum}>{r.blockerAtRiskCount}</td>
                <td style={styles.workloadTdNum}>{r.closingNext30Count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// (4) Execution board
// ---------------------------------------------------------------------------

function ExecutionBoard({ items }: { items: ReadonlyArray<WorkItem> }) {
  return (
    <section
      style={styles.executionBoard}
      aria-label="Execution board"
      data-team-cockpit-section="execution-board"
    >
      <header style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>Execution board</h3>
        <span style={styles.sectionMeta}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </header>
      {items.length === 0 ? (
        <p style={styles.bucketEmpty}>Queue clear — nothing to action right now.</p>
      ) : (
        <ul style={styles.executionList}>
          {items.slice(0, 20).map((item) => {
            const tone = item.severity === 'clear' ? 'info' : item.severity;
            // Phase 127C — show the deal-name link separately from the
            // title when they differ (tasks / documents have their own
            // titles; deal-level items collapse to one row).
            const showDealLine =
              item.title !== item.dealName ? item.dealName : undefined;
            return (
              <li
                key={`${item.kind}-${item.itemId}`}
                style={{
                  ...styles.executionRow,
                  borderLeftColor: severityPalette[tone].bar,
                }}
                data-team-execution-item={item.itemId}
              >
                <div style={styles.executionHead}>
                  <div style={styles.executionTitleGroup}>
                    <Link
                      to={`/deals/${item.dealId}`}
                      style={styles.executionLink}
                      aria-label={`Open ${item.dealName} in the deal workspace`}
                      data-team-drilldown-deal={item.dealId}
                    >
                      {item.title}
                    </Link>
                    {showDealLine && (
                      <span style={styles.executionDeal}>{showDealLine}</span>
                    )}
                  </div>
                  <div style={styles.executionBadgeGroup}>
                    <span
                      style={{
                        ...styles.executionKindChip,
                        background: severityPalette[tone].bg,
                        color: severityPalette[tone].fg,
                      }}
                      data-team-execution-kind={item.kind}
                    >
                      {labelForKind(item.kind)}
                    </span>
                    <span
                      style={{
                        ...styles.executionSeverityDot,
                        background: severityPalette[tone].bar,
                      }}
                      aria-label={`Severity ${labelForSeverity(item.severity)}`}
                      data-team-execution-severity={item.severity}
                    />
                  </div>
                </div>
                <div style={styles.executionMeta}>
                  <span>{item.clientName ?? 'Not set'}</span>
                  <span style={styles.executionSep} aria-hidden="true">·</span>
                  <span>{item.stage ?? 'Stage not set'}</span>
                  <span style={styles.executionSep} aria-hidden="true">·</span>
                  <span>{item.status ?? 'Status not set'}</span>
                  <span style={styles.executionSep} aria-hidden="true">·</span>
                  <span>{displayOwner(item)}</span>
                  <span style={styles.executionSep} aria-hidden="true">·</span>
                  <span>{formatUrgency(item)}</span>
                  <span style={styles.executionSep} aria-hidden="true">·</span>
                  <span style={styles.executionReason}>{item.reason}</span>
                </div>
              </li>
            );
          })}
          {items.length > 20 && (
            <li style={styles.laneRowOverflow}>
              +{items.length - 20} more in the queue.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// (5) Analytics row
// ---------------------------------------------------------------------------

function AnalyticsRow({
  snapshot,
}: {
  snapshot: {
    lanes: TeamOpsQueueLanes;
    bankerWorkload: ReadonlyArray<TeamBankerWorkloadRow>;
    vmRows: ReadonlyArray<import('./teamOpsQueueSnapshot').TeamOpsVMRow>;
  };
}) {
  const workItemTypes = useMemo(
    () => deriveWorkItemTypeCounts(snapshot.lanes),
    [snapshot.lanes],
  );
  const overdueByBanker = useMemo(
    () => deriveOverdueByBanker(snapshot.bankerWorkload),
    [snapshot.bankerWorkload],
  );
  const docsByBanker = useMemo(
    () => deriveOutstandingDocsByBanker(snapshot.bankerWorkload),
    [snapshot.bankerWorkload],
  );
  const risk = useMemo(
    () => deriveRiskDistributionForTeam(snapshot.vmRows),
    [snapshot.vmRows],
  );
  const forecast = useMemo(
    () => deriveClosingForecastForTeam(snapshot.vmRows),
    [snapshot.vmRows],
  );
  return (
    <section
      style={styles.analyticsGrid}
      aria-label="Team analytics row"
      data-team-cockpit-section="analytics-row"
    >
      <VerticalBarChart
        title="Work items by type"
        subtitle="Count per lane"
        data={workItemTypes}
        drillThroughSurface="team_ops_queue"
      />
      <HorizontalBarChart
        title="Overdue tasks by banker"
        data={overdueByBanker.map((b) => ({ label: b.label, value: b.value, tone: 'atRisk' as const }))}
        drillThroughSurface="team_ops_queue"
      />
      <HorizontalBarChart
        title="Outstanding docs by banker"
        data={docsByBanker.map((b) => ({ label: b.label, value: b.value, tone: 'atRisk' as const }))}
        drillThroughSurface="team_ops_queue"
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
        drillThroughSurface="team_ops_queue"
      />
      <ForecastSparkline
        title="Closings forecast"
        subtitle="Next 6 months"
        points={forecast.map((f) => ({
          label: f.label,
          dealCount: f.dealCount,
          totalAmount: f.totalAmount,
        }))}
        drillThroughSurface="team_ops_queue"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Phase 130A — concise, honest KPI summary lines for the Copilot
 * workspace context. Derived purely from the command ribbon the
 * cockpit already renders. No predictive language, no GUIDs.
 */
function teamCopilotKpiSummaries(
  ribbon: TeamOpsCommandRibbon,
): string[] {
  return [
    `Active deals: ${ribbon.activeDealCount}`,
    `Open tasks: ${ribbon.openTaskCount} · Overdue: ${ribbon.overdueTaskCount} · Due soon: ${ribbon.dueSoonTaskCount}`,
    `Outstanding docs: ${ribbon.outstandingDocumentCount} · Pending review: ${ribbon.docsPendingReviewCount}`,
    `Blocked: ${ribbon.blockedDealCount} · At risk: ${ribbon.atRiskDealCount} · Stale: ${ribbon.staleDealCount}`,
    `Closing next 30d: ${ribbon.closingNext30DayCount}`,
  ];
}

function formatUrgency(item: WorkItem): string {
  if (item.daysStale !== undefined) {
    return `${item.daysStale}d stale`;
  }
  if (item.daysUntilDue === undefined) return 'No date';
  if (item.daysUntilDue < 0) return `${Math.abs(item.daysUntilDue)}d overdue`;
  if (item.daysUntilDue === 0) return 'Due today';
  return `${item.daysUntilDue}d to go`;
}

function labelForKind(kind: WorkItem['kind']): string {
  switch (kind) {
    case 'overdue-task':
      return 'Overdue task';
    case 'due-soon-task':
      return 'Due soon';
    case 'outstanding-document':
      return 'Outstanding doc';
    case 'pending-review-document':
      return 'Pending review';
    case 'missing-data':
      return 'Missing data';
    case 'stale-deal':
      return 'Stale';
    case 'blocked-deal':
      return 'Blocked';
    case 'at-risk-deal':
      return 'At risk';
    case 'closing-soon':
      return 'Closing soon';
  }
}

function labelForSeverity(severity: WorkItemSeverity): string {
  switch (severity) {
    case 'blocked':
      return 'blocked';
    case 'atRisk':
      return 'at risk';
    case 'info':
      return 'info';
    case 'clear':
      return 'clear';
  }
}

/**
 * Phase 127C — honest owner display rule. When the deal carries an
 * assigned banker name, show it. When the FK is present but the name
 * didn't hydrate (e.g. team query returned only the _value/GUID),
 * surface 'Unknown banker' instead of leaking the raw GUID. When no
 * FK is present at all, the row is genuinely unassigned.
 */
function displayOwner(item: WorkItem): string {
  if (item.ownerName) return item.ownerName;
  if (item.ownerId) return 'Unknown banker';
  return 'Unassigned';
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
  lanesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.sm,
  },
  lane: {
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
  laneHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  laneLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  laneCount: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  laneEmpty: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
  },
  laneList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  laneRow: {
    padding: `${spacing.xs} 0`,
    borderTop: `1px dashed ${palette.divider}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  laneRowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  laneRowLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  laneRowMeta: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontFamily: typography.mono,
    fontWeight: typography.weight.semibold,
  },
  laneRowSub: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  laneRowSep: {
    color: palette.textSubtle,
  },
  laneRowReason: {
    color: palette.textMuted,
  },
  laneRowOverflow: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic' as const,
    paddingTop: spacing.xs,
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
  executionBoard: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
  },
  executionList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  executionRow: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderLeft: '3px solid',
    borderRadius: radius.sm,
    background: palette.surface,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  executionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  executionLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
  },
  executionTitleGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    gap: 1,
  },
  executionDeal: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
  },
  executionBadgeGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  executionKindChip: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  executionSeverityDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
  },
  executionMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  executionSep: {
    color: palette.textSubtle,
  },
  executionReason: {
    color: palette.textMuted,
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
};

import { useMemo } from 'react';
import { useManagerData } from './ManagerDataProvider';
import {
  deriveManagerPipelineSnapshot,
  type ManagerExceptionRow,
  type ManagerExceptionSeverity,
  type BankerWorkloadRow,
  type ManagerTopDealRow,
  type ManagerPipelineCommandStrip,
} from './managerPipelineSnapshot';
import { palette, radius, severityPalette, shadow, spacing, typography } from '../shared/theme';

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
    return deriveManagerPipelineSnapshot({
      teamPipeline: teamPipeline.data,
      teamBankers: teamBankers.data,
      teamTasks: teamTasks.data,
      teamDocuments: teamDocuments.data,
    });
  }, [teamPipeline, teamBankers, teamTasks, teamDocuments]);

  return (
    <section
      style={styles.deck}
      aria-label="Manager Bloomberg Control Panel"
      data-manager-cockpit="bloomberg-control-panel"
    >
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Management Cockpit</div>
          <h2 style={styles.title}>Bloomberg Control Panel</h2>
        </div>
        <span style={styles.readOnlyChip} aria-label="Read-only management view">
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
          <CommandStrip strip={snapshot.commandStrip} />
          <ExceptionTape tape={snapshot.exceptionTape} />
          <BankerWorkload rows={snapshot.bankerWorkload} />
          <TopDeals rows={snapshot.topDeals} />
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
      <span style={styles.failureLabel}>Could not load {slot}.</span>
      <span style={styles.failureDetail}>{message}</span>
      <span style={styles.failureHint}>Refresh to retry.</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={styles.emptyRow}
      data-manager-cockpit-state="empty"
    >
      No authorized manager pipeline records found.
    </div>
  );
}

// ---------------------------------------------------------------------------
// (1) Command Strip
// ---------------------------------------------------------------------------

function CommandStrip({ strip }: { strip: ManagerPipelineCommandStrip }) {
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
      label: 'Missing data',
      value: String(strip.missingDataCount),
      tone: strip.missingDataCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.missingDataCount} deals with missing required fields`,
    },
    {
      label: 'Blocked / at-risk',
      value: String(strip.blockerAtRiskCount),
      tone: strip.blockerAtRiskCount === 0 ? 'clear' : 'atRisk',
      ariaLabel: `${strip.blockerAtRiskCount} deals blocked or at risk`,
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
  ];

  return (
    <section
      style={styles.commandStrip}
      aria-label="Pipeline command strip"
      data-manager-cockpit-section="command-strip"
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            ...styles.kpiTile,
            borderTopColor: severityPalette[t.tone].bar,
          }}
          aria-label={t.ariaLabel}
          data-manager-kpi={t.label.toLowerCase().replace(/\s+/g, '-')}
        >
          <span style={styles.kpiLabel}>{t.label}</span>
          <span style={styles.kpiValue}>{t.value}</span>
        </div>
      ))}
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
                <span style={styles.bucketRowName}>{r.dealName}</span>
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
                <span style={styles.topDealName}>{r.dealName}</span>
                <span style={styles.topDealAmount}>{formatAmount(r.amount)}</span>
              </div>
              <div style={styles.topDealMeta}>
                <MetaCell label="Client" value={r.clientName ?? 'Not set'} />
                <MetaCell label="Stage" value={r.stage ?? 'Not set'} />
                <MetaCell label="Status" value={r.status ?? 'Not set'} />
                <MetaCell label="Banker" value={r.bankerName ?? 'Unassigned'} />
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
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
    borderBottom: `1px solid ${palette.divider}`,
    marginBottom: spacing.md,
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
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

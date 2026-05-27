import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import { deriveDealCockpitMetrics } from './dealCockpitMetrics';
import {
  CompletenessRing,
  MetricTile,
} from '../shared/cockpitPrimitives';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125D — Deal Metric Deck.
 *
 * The KPI strip that sits between the navy command hero and the
 * two-column cockpit grid. The deck is the banker's "Bloomberg
 * status bar" — eight tightly-spaced tiles that always render in
 * the same order so the banker scans them as a fixed instrument
 * panel, not as freeform widgets.
 *
 * Composition:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │                                                          │
 *   │  ╭──╮  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐  │
 *   │  │██│  │Amt │ │TClo│ │D-Stg│ │Blkr│ │Tasks│ │Docs│ │Memo│  │
 *   │  ╰──╯  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘  │
 *   │ Ring   8 KPI tiles                                       │
 *   │                                                          │
 *   │  Missing fields: Industry · Guarantor · Pricing          │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Every value is derived from authorized records via
 * `deriveDealCockpitMetrics`. Missing values render as italic
 * "Not set" inside the tile (never as fabricated defaults). The
 * completeness percentage is a count of populated profile fields
 * — NOT a credit score, NOT an approval probability, NOT a
 * predictive close-date estimate.
 *
 * Governance:
 *   - Pure render; consumes the same DealDataProvider slot the
 *     rest of the workspace uses.
 *   - No new hooks beyond useDealData + useMemo for the metrics
 *     derivation (memoized for render stability).
 *   - Never writes; never sends; never advances stage.
 */
export function DealMetricDeck() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  const now = useMemo(() => new Date(), []);
  const metrics = useMemo(
    () =>
      deriveDealCockpitMetrics(
        {
          deal,
          tasks: tasks.kind === 'ready' ? tasks.data : undefined,
          documents: documents.kind === 'ready' ? documents.data : undefined,
          creditMemo: creditMemo.kind === 'ready' ? creditMemo.data : undefined,
          activity: activity.kind === 'ready' ? activity.data : undefined,
        },
        now,
      ),
    [deal, tasks, documents, creditMemo, activity, now],
  );

  return (
    <section
      data-cockpit-zone="metric-deck"
      style={styles.deck}
      aria-label="Deal metric deck"
    >
      <div style={styles.ringWrap}>
        <CompletenessRing
          percent={metrics.profileCompletenessPct}
          caption={`${metrics.populatedFieldCount} / ${metrics.totalFieldCount} fields`}
          aria-label={`Deal profile completeness: ${metrics.profileCompletenessPct} percent (${metrics.populatedFieldCount} of ${metrics.totalFieldCount} fields populated)`}
        />
      </div>
      <div style={styles.tiles}>
        <MetricTile
          label="Loan amount"
          value={formatCurrency(metrics.loanAmount)}
          tone="info"
        />
        <MetricTile
          label="Target close"
          value={formatTargetCloseDate(metrics.targetCloseIso)}
          sub={formatRelativeDays(metrics.daysToClose)}
          tone={tonalForDaysToClose(metrics.daysToClose)}
        />
        <MetricTile
          label="Days in stage"
          value={formatDaysCount(metrics.daysInStage)}
          tone={tonalForDaysInStage(metrics.daysInStage)}
        />
        <MetricTile
          label="Blockers"
          value={formatNonNegativeCount(metrics.docOutstandingCount + metrics.taskOverdueCount)}
          sub={blockersSubLabel(metrics)}
          tone={tonalForBlockers(metrics)}
          aria-label={`Blockers: ${metrics.taskOverdueCount} overdue tasks, ${metrics.docOutstandingCount} outstanding documents`}
        />
        <MetricTile
          label="Tasks"
          value={formatNonNegativeCount(metrics.taskOpenCount)}
          sub={
            metrics.taskOverdueCount > 0
              ? `${metrics.taskOverdueCount} overdue`
              : metrics.taskOpenCount === 0
                ? 'none open'
                : 'all on schedule'
          }
          tone={metrics.taskOverdueCount > 0 ? 'atRisk' : 'neutral'}
        />
        <MetricTile
          label="Documents"
          value={formatNonNegativeCount(metrics.docOutstandingCount)}
          sub={
            metrics.docOutstandingCount === 0
              ? 'none outstanding'
              : `${metrics.docReceivedCount} received`
          }
          tone={metrics.docOutstandingCount > 0 ? 'atRisk' : 'neutral'}
        />
        <MetricTile
          label="Credit memo"
          value={memoStateLabel(metrics.memoState)}
          sub={
            metrics.memoCount === 0
              ? 'no memo records'
              : `${metrics.memoCount} version${metrics.memoCount === 1 ? '' : 's'}`
          }
          tone={memoStateTone(metrics.memoState)}
        />
        <MetricTile
          label="Last touched"
          value={formatLastTouched(metrics.daysSinceLastTouched)}
          sub={
            metrics.lastTouchedIso === undefined
              ? 'no activity recorded'
              : `${metrics.rightRail.communicationEvents} comms event${metrics.rightRail.communicationEvents === 1 ? '' : 's'}`
          }
          tone={tonalForLastTouched(metrics.daysSinceLastTouched)}
        />
      </div>
      <div style={styles.missingRow}>
        <span style={styles.missingLabel}>MISSING FIELDS</span>
        {metrics.missingFieldLabels.length === 0 ? (
          <span style={styles.missingNone}>None — every tracked field is populated.</span>
        ) : (
          <span style={styles.missingList}>
            {metrics.missingFieldLabels.join(' · ')}
          </span>
        )}
      </div>
    </section>
  );
}

function formatCurrency(amount: number | undefined): string | undefined {
  if (amount === undefined) return undefined;
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatTargetCloseDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeDays(days: number | undefined): string | undefined {
  if (days === undefined) return undefined;
  if (days < 0) return `${Math.abs(days)}d past`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days}d`;
}

function formatDaysCount(days: number | undefined): string | undefined {
  if (days === undefined) return undefined;
  if (days < 0) return '—';
  if (days === 0) return 'today';
  return `${days}d`;
}

function formatNonNegativeCount(n: number): string {
  return Math.max(0, n).toString();
}

function blockersSubLabel(
  m: ReturnType<typeof deriveDealCockpitMetrics>,
): string {
  const parts: string[] = [];
  if (m.taskOverdueCount > 0) parts.push(`${m.taskOverdueCount} overdue task${m.taskOverdueCount === 1 ? '' : 's'}`);
  if (m.docOutstandingCount > 0)
    parts.push(`${m.docOutstandingCount} doc${m.docOutstandingCount === 1 ? '' : 's'} outstanding`);
  if (parts.length === 0) return 'no attention items';
  return parts.join(' · ');
}

function memoStateLabel(
  state: ReturnType<typeof deriveDealCockpitMetrics>['memoState'],
): string | undefined {
  switch (state) {
    case 'none':
      return undefined;
    case 'final':
      return 'Final';
    case 'borrower-safe':
      return 'Borrower safe';
    case 'draft':
      return 'Draft';
    case 'stale':
      return 'Stale';
    case 'unknown':
      return 'Unmapped';
  }
}

function memoStateTone(
  state: ReturnType<typeof deriveDealCockpitMetrics>['memoState'],
): 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral' {
  switch (state) {
    case 'final':
      return 'clear';
    case 'borrower-safe':
      return 'info';
    case 'draft':
      return 'neutral';
    case 'stale':
      return 'atRisk';
    default:
      return 'neutral';
  }
}

function formatLastTouched(days: number | undefined): string | undefined {
  if (days === undefined) return undefined;
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function tonalForDaysToClose(
  days: number | undefined,
): 'info' | 'atRisk' | 'blocked' | 'neutral' {
  if (days === undefined) return 'neutral';
  if (days < 0) return 'blocked';
  if (days <= 14) return 'atRisk';
  return 'info';
}

function tonalForDaysInStage(
  days: number | undefined,
): 'info' | 'atRisk' | 'neutral' {
  if (days === undefined) return 'neutral';
  if (days >= 30) return 'atRisk';
  return 'info';
}

function tonalForBlockers(
  m: ReturnType<typeof deriveDealCockpitMetrics>,
): 'blocked' | 'atRisk' | 'clear' | 'neutral' {
  const overdue = m.taskOverdueCount;
  const outstanding = m.docOutstandingCount;
  if (overdue + outstanding === 0) return 'clear';
  if (overdue > 0) return 'blocked';
  return 'atRisk';
}

function tonalForLastTouched(
  days: number | undefined,
): 'info' | 'atRisk' | 'neutral' {
  if (days === undefined) return 'neutral';
  if (days >= 14) return 'atRisk';
  return 'info';
}

const styles: Record<string, React.CSSProperties> = {
  deck: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    boxShadow: shadow.deck,
    padding: spacing.md,
    marginBottom: spacing.lg,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: spacing.md,
    rowGap: spacing.sm,
    alignItems: 'center',
  },
  ringWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `0 ${spacing.xs}`,
  },
  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
    gap: spacing.xs,
    minWidth: 0,
  },
  missingRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: spacing.xs,
    alignItems: 'baseline',
    flexWrap: 'wrap' as const,
    borderTop: `1px dashed ${palette.divider}`,
    paddingTop: spacing.xs,
    minWidth: 0,
  },
  missingLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    flexShrink: 0,
  },
  missingNone: {
    fontSize: typography.size.sm,
    color: palette.clearFg,
    fontStyle: 'italic' as const,
  },
  missingList: {
    fontSize: typography.size.sm,
    color: palette.text,
    minWidth: 0,
    flex: 1,
  },
};

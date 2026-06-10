import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import { deriveDealCockpitMetrics } from './dealCockpitMetrics';
import { useOptionalDealIntelligence } from '../shared/dealIntelligenceContext';
import {
  CompletenessRing,
  LargeMetricTile,
} from '../shared/cockpitPrimitives';
import {
  AlertIcon,
  CalendarIcon,
  ChecklistIcon,
  DocumentsIcon,
  DollarIcon,
  PipelineIcon,
} from '../shared/cockpitIcons';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';
import { DrillThroughCard } from '../shared/drillthrough/DrillThroughCard';
import { dealMetricDeckTargets } from './dealCockpitDrillThrough';

/**
 * Phase 125E — Deal Metric Deck (recomposed).
 *
 * Replaces the Phase 125D 8-tile compact strip with **six large
 * tonal tiles + a prominent profile-completeness ring on the
 * left**. Each tile is ~140px tall, carries a CockpitIcon halo
 * + display-scale value typography, and lives on a slate deck
 * surface so the deck reads as the cockpit's primary instrument
 * panel — not as a row of decorative chips.
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │  ┌─────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐ │
 *   │  │  ◯  │  │  $   │  │  ⚠   │  │  ▤   │  │  ✓   │  │  📄  │ │
 *   │  │ 0%  │  │$2.5M │  │  13  │  │  0   │  │  0   │  │  0   │ │
 *   │  │     │  │Loan  │  │Miss. │  │Block.│  │Tasks │  │ Docs │ │
 *   │  └─────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘ │
 *   │                                                           │
 *   │  + Target close tile (violet, second row when fits)       │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Values are derived from authorized records via
 * `deriveDealCockpitMetrics`. Missing values render as italic
 * "Not set" inside the tile; never a fabricated default. The
 * completeness percentage is a populated-field ratio — NOT a
 * credit score, NOT an approval probability, NOT a predictive
 * close-date estimate.
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

  // Phase 123C — completeness numbers + missing-field labels prefer
  // the shared Deal Intelligence VM when the BankerDealWorkspace's
  // DealIntelligenceProvider is mounted; fall back to the locally-
  // computed cockpit metrics otherwise (so this card stays usable
  // without the provider, e.g. in its existing standalone tests).
  // The values are byte-equivalent today — the VM consumes the same
  // deriveDealCockpitMetrics output — so the swap is structural, not
  // visual. The other tiles (Loan amount / Blockers / Tasks /
  // Documents / Target close) remain on `metrics` per Phase 123C
  // scope; they will be wired in a later phase.
  const vm = useOptionalDealIntelligence();
  const populatedFieldCount =
    vm?.completeness.populatedFieldCount ?? metrics.populatedFieldCount;
  const totalFieldCount =
    vm?.completeness.totalFieldCount ?? metrics.totalFieldCount;
  const profileCompletenessPct =
    vm?.completeness.completenessPct ?? metrics.profileCompletenessPct;
  const missingFieldLabels =
    vm?.completeness.missingFieldLabels ?? metrics.missingFieldLabels;

  // Phase 144B — each metric tile becomes a read-only drill-through disclosure
  // explaining its populated/missing fields and contributing counts. Values are
  // the same `deriveDealCockpitMetrics` output the tiles already render.
  const targetCloseLabel = formatTargetCloseDate(metrics.targetCloseIso) ?? 'No date set';
  const deckTargets = dealMetricDeckTargets({
    loanAmountLabel: formatCurrency(metrics.loanAmount) ?? 'Not set',
    loanAmountKnown: metrics.loanAmount !== undefined,
    missingFieldLabels,
    totalFieldCount,
    populatedFieldCount,
    taskOpenCount: metrics.taskOpenCount,
    taskOverdueCount: metrics.taskOverdueCount,
    taskCompletedCount: metrics.taskCompletedCount,
    docOutstandingCount: metrics.docOutstandingCount,
    docReceivedCount: metrics.docReceivedCount,
    docReviewedCount: metrics.docReviewedCount,
    targetCloseLabel,
    daysToCloseLabel: formatRelativeDays(metrics.daysToClose) ?? 'No date set',
    memoStateLabel: memoStateLabel(metrics.memoState),
  });

  return (
    <section
      data-cockpit-zone="metric-deck"
      style={styles.deck}
      aria-label="Deal metric deck"
    >
      <div style={styles.ringWrap}>
        <CompletenessRing
          percent={profileCompletenessPct}
          size={104}
          caption={`PROFILE · ${populatedFieldCount} of ${totalFieldCount}`}
          aria-label={`Deal profile completeness: ${profileCompletenessPct} percent (${populatedFieldCount} of ${totalFieldCount} fields populated)`}
        />
      </div>
      <div className="cc-metric-deck-tiles" data-metric-deck-tiles="phase-125g">
        <DrillThroughCard target={deckTargets['loan-amount']} unstyled>
          <LargeMetricTile
            label="Loan amount"
            value={formatCurrency(metrics.loanAmount)}
            sub="Authorized cr664_loandeal record"
            tone="info"
            icon={<DollarIcon />}
          />
        </DrillThroughCard>
        <DrillThroughCard target={deckTargets['missing-fields']} unstyled>
          <LargeMetricTile
            label="Missing fields"
            value={formatNonNegativeCount(missingFieldLabels.length)}
            sub={
              missingFieldLabels.length === 0
                ? 'Every tracked field populated'
                : `of ${totalFieldCount} tracked`
            }
            tone={missingFieldLabels.length === 0 ? 'clear' : 'atRisk'}
            icon={<ChecklistIcon />}
          />
        </DrillThroughCard>
        <DrillThroughCard target={deckTargets['blockers']} unstyled>
          <LargeMetricTile
            label="Blockers"
            value={formatNonNegativeCount(
              metrics.taskOverdueCount + metrics.docOutstandingCount,
            )}
            sub={blockerSubLabel(metrics)}
            tone={tonalForBlockers(metrics)}
            icon={<AlertIcon />}
            aria-label={`Blockers: ${metrics.taskOverdueCount} overdue tasks, ${metrics.docOutstandingCount} outstanding documents`}
          />
        </DrillThroughCard>
        <DrillThroughCard target={deckTargets['tasks-open']} unstyled>
          <LargeMetricTile
            label="Tasks open"
            value={formatNonNegativeCount(metrics.taskOpenCount)}
            sub={
              metrics.taskOverdueCount > 0
                ? `${metrics.taskOverdueCount} overdue · ${metrics.taskCompletedCount} completed`
                : metrics.taskOpenCount === 0
                  ? `${metrics.taskCompletedCount} completed`
                  : `${metrics.taskCompletedCount} completed`
            }
            tone={metrics.taskOverdueCount > 0 ? 'atRisk' : metrics.taskOpenCount === 0 ? 'clear' : 'info'}
            icon={<PipelineIcon />}
          />
        </DrillThroughCard>
        <DrillThroughCard target={deckTargets['documents']} unstyled>
          <LargeMetricTile
            label="Documents"
            value={formatNonNegativeCount(metrics.docOutstandingCount)}
            sub={
              metrics.docOutstandingCount === 0
                ? `${metrics.docReceivedCount} received · ${metrics.docReviewedCount} reviewed`
                : `${metrics.docOutstandingCount} outstanding · ${metrics.docReceivedCount} received`
            }
            tone={metrics.docOutstandingCount > 0 ? 'atRisk' : 'clear'}
            icon={<DocumentsIcon />}
          />
        </DrillThroughCard>
        <DrillThroughCard target={deckTargets['target-close']} unstyled>
          <LargeMetricTile
            label="Target close"
            value={formatTargetCloseDate(metrics.targetCloseIso)}
            sub={formatRelativeDays(metrics.daysToClose) ?? 'No date set'}
            tone={tonalForDaysToClose(metrics.daysToClose)}
            icon={<CalendarIcon />}
          />
        </DrillThroughCard>
      </div>
      <div style={styles.footerRow}>
        <span style={styles.footerLabel}>LAST TOUCHED</span>
        <span style={styles.footerValue}>
          {metrics.lastTouchedIso === undefined
            ? 'No activity recorded'
            : formatLastTouched(metrics.daysSinceLastTouched)}
        </span>
        <span style={styles.footerSep} aria-hidden="true">·</span>
        <span style={styles.footerLabel}>COMMS</span>
        <span style={styles.footerValue}>
          {metrics.rightRail.communicationEvents}{' '}
          event{metrics.rightRail.communicationEvents === 1 ? '' : 's'}
        </span>
        <span style={styles.footerSep} aria-hidden="true">·</span>
        <span style={styles.footerLabel}>MEMO</span>
        <span style={styles.footerValue}>{memoStateLabel(metrics.memoState)}</span>
        {missingFieldLabels.length > 0 && (
          <>
            <span style={styles.footerSepBreak} aria-hidden="true">·</span>
            <span style={styles.footerMissingLabel}>MISSING:</span>
            <span style={styles.footerMissingList}>
              {missingFieldLabels.join(' · ')}
            </span>
          </>
        )}
        {missingFieldLabels.length === 0 && (
          <>
            <span style={styles.footerSepBreak} aria-hidden="true">·</span>
            <span style={styles.footerMissingNone}>
              None — every tracked field is populated.
            </span>
          </>
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

function formatNonNegativeCount(n: number): string {
  return Math.max(0, n).toString();
}

function blockerSubLabel(
  m: ReturnType<typeof deriveDealCockpitMetrics>,
): string {
  if (m.taskOverdueCount + m.docOutstandingCount === 0) return 'No attention items';
  const parts: string[] = [];
  if (m.taskOverdueCount > 0)
    parts.push(`${m.taskOverdueCount} overdue task${m.taskOverdueCount === 1 ? '' : 's'}`);
  if (m.docOutstandingCount > 0)
    parts.push(`${m.docOutstandingCount} doc${m.docOutstandingCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function memoStateLabel(
  state: ReturnType<typeof deriveDealCockpitMetrics>['memoState'],
): string {
  switch (state) {
    case 'none':
      return 'Not set';
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

function formatLastTouched(days: number | undefined): string {
  if (days === undefined) return 'No activity';
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function tonalForDaysToClose(
  days: number | undefined,
): 'info' | 'atRisk' | 'blocked' | 'neutral' | 'violet' {
  if (days === undefined) return 'neutral';
  if (days < 0) return 'blocked';
  if (days <= 14) return 'atRisk';
  return 'violet';
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

const styles: Record<string, React.CSSProperties> = {
  deck: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.lg,
    boxShadow: shadow.elevated,
    // Phase 125G — tighter vertical padding so the deck is a
    // bit shorter and the Stage Map peeks above the fold on
    // typical viewports.
    padding: `${spacing.sm} ${spacing.lg} ${spacing.md}`,
    marginBottom: spacing.lg,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: spacing.xl,
    rowGap: spacing.sm,
    alignItems: 'center',
  },
  ringWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `0 ${spacing.sm}`,
    borderRight: `1px solid ${palette.divider}`,
  },
  // Phase 125G — `tiles` style is now handled by the
  // .cc-metric-deck-tiles class in src/index.css so the grid
  // template can use real media-query breakpoints.
  footerRow: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'baseline',
    gap: `${spacing.xs} ${spacing.sm}`,
    borderTop: `1px solid ${palette.divider}`,
    paddingTop: spacing.xs,
    minWidth: 0,
    fontSize: typography.size.sm,
  },
  footerLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
    flexShrink: 0,
  },
  footerValue: {
    fontSize: typography.size.sm,
    color: palette.text,
    fontWeight: typography.weight.semibold,
  },
  footerSep: {
    color: palette.textSubtle,
    fontSize: typography.size.sm,
  },
  footerSepBreak: {
    color: palette.textSubtle,
    fontSize: typography.size.sm,
    flexBasis: '100%',
    display: 'none',
  },
  footerMissingLabel: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: typography.letterSpacing.label,
    color: palette.atRiskFg,
    fontWeight: typography.weight.bold,
  },
  footerMissingList: {
    fontSize: typography.size.sm,
    color: palette.text,
    minWidth: 0,
    flex: 1,
  },
  footerMissingNone: {
    fontSize: typography.size.sm,
    color: palette.clearFg,
    fontStyle: 'italic' as const,
  },
};

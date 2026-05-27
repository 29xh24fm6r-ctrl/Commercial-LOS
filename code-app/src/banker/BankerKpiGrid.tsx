import type { CSSProperties, ReactNode } from 'react';
import { deriveBankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import { type BankerWorkQueueData } from './workQueueQueries';
import {
  ActivityIcon,
  AlertIcon,
  CalendarIcon,
  DollarIcon,
  PipelineIcon,
  SparkleIcon,
  StageIcon,
  CompletenessIcon,
  MemoIcon,
  ChecklistIcon,
} from '../shared/cockpitIcons';
import { palette, radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125F — flat Lending OS KPI grid.
 *
 * Replaces the Phase 117 three-section grouped KPI grid with a
 * flat 10-tile grid that matches the original Lending OS
 * reference: small colored icon + small uppercase label + LARGE
 * value (color-coded by tone).
 *
 *   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 *   │ $ PIPELINE│ │% WEIGHTED│ │📈ACTIVE │ │⚠ URGENT │ │📅CLOSING │
 *   │  $60.2M  │ │  $41.9M  │ │   4     │ │   2     │ │   0     │
 *   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
 *   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 *   │ $ YTD     │ │% WIN RATE│ │↗ HIGH PB│ │🕒STALE   │ │▤ IN UW   │
 *   │   $0     │ │   0%     │ │   3     │ │   4     │ │   1     │
 *   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
 *
 * Honest discipline:
 *   - PIPELINE, ACTIVE DEALS, URGENT, CLOSING SOON, STALE 14D+,
 *     IN UW are derived from `deriveBankerPersonalActivity`.
 *   - WEIGHTED, YTD CLOSED, WIN RATE, HIGH PROB render as italic
 *     "Not yet wired" with explicit tooltips. They need a
 *     `cr664_loandeal.probability` / win-status field that does
 *     not exist in the current schema. Phase 118 inventory §3.3
 *     marks them as bucket C (scope phase needed).
 *   - Zero values render honestly. No fabricated numbers.
 */

type KpiTone = 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral' | 'violet' | 'teal';

interface KpiSpec {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly tone: KpiTone;
  readonly value: string | undefined;
  readonly hint?: string;
  readonly tooltip?: string;
}

export interface BankerKpiGridProps {
  /** Current load state of the parent shell's banker work-queue snapshot. */
  state:
    | { kind: 'loading' }
    | { kind: 'failed'; message: string }
    | { kind: 'ready'; data: BankerWorkQueueData };
  /** Override `now` (primarily for tests). */
  now?: Date;
}

const NOT_YET_WIRED_TOOLTIP_WEIGHTED =
  'Weighted pipeline requires a cr664_loandeal.probability field that is not in the live schema today. Marked as bucket C in PHASE_118_ORIGINAL_UI_UX_INVENTORY.md §3.3.';
const NOT_YET_WIRED_TOOLTIP_YTD_CLOSED =
  'YTD closed dollars require a closed-won flag + close date that the live schema does not surface today. Bucket C.';
const NOT_YET_WIRED_TOOLTIP_WIN_RATE =
  'Win rate requires a closed-won vs closed-lost discriminator that the live schema does not surface today. Bucket C.';
const NOT_YET_WIRED_TOOLTIP_HIGH_PROB =
  'High-probability count requires a cr664_loandeal.probability field that is not in the live schema today. Bucket C.';

export function BankerKpiGrid({ state, now }: BankerKpiGridProps) {
  if (state.kind === 'loading') {
    return (
      <section
        className="cc-kpi-grid"
        style={styles.grid}
        aria-label="Workload KPIs (loading)"
        data-banker-kpi-grid="phase-125g"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <KpiTile key={i} spec={loadingSpec(i)} />
        ))}
      </section>
    );
  }
  if (state.kind === 'failed') {
    return (
      <section
        className="cc-kpi-grid"
        style={styles.grid}
        aria-label="Workload KPIs (failed)"
        data-banker-kpi-grid="phase-125g"
      >
        <div style={styles.failed} role="alert">
          <div style={styles.failedTitle}>Could not load workload snapshot</div>
          <div style={styles.failedDetail}>{state.message}</div>
          <div style={styles.failedHint}>
            Refresh to retry. The cards below load independently and may
            still render.
          </div>
        </div>
      </section>
    );
  }
  const kpis = deriveBankerPersonalActivity(state.data, now ?? new Date());
  const specs: ReadonlyArray<KpiSpec> = [
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: <DollarIcon />,
      tone: 'info',
      value: formatCurrencyCompact(kpis.totalAmount),
      hint:
        kpis.dealsMissingAmount > 0
          ? `${kpis.dealsMissingAmount} deal${kpis.dealsMissingAmount === 1 ? '' : 's'} missing amount`
          : 'Sum across active deals',
    },
    {
      id: 'weighted',
      label: 'Weighted',
      icon: <SparkleIcon />,
      tone: 'neutral',
      value: undefined,
      hint: 'Not yet wired',
      tooltip: NOT_YET_WIRED_TOOLTIP_WEIGHTED,
    },
    {
      id: 'active-deals',
      label: 'Active Deals',
      icon: <PipelineIcon />,
      tone: 'info',
      value: kpis.activeDeals.toString(),
      hint: 'Authorized to you',
    },
    {
      id: 'urgent',
      label: 'Urgent',
      icon: <AlertIcon />,
      tone: kpis.urgentItemCount > 0 ? 'blocked' : 'clear',
      value: kpis.urgentItemCount.toString(),
      hint: 'Overdue tasks · docs · closes',
    },
    {
      id: 'closing-soon',
      label: 'Closing Soon',
      icon: <CalendarIcon />,
      tone: kpis.closingSoonCount > 0 ? 'atRisk' : 'neutral',
      value: kpis.closingSoonCount.toString(),
      hint: 'Target close ≤ 14d',
    },
    {
      id: 'ytd-closed',
      label: 'YTD Closed',
      icon: <CompletenessIcon />,
      tone: 'neutral',
      value: undefined,
      hint: 'Not yet wired',
      tooltip: NOT_YET_WIRED_TOOLTIP_YTD_CLOSED,
    },
    {
      id: 'win-rate',
      label: 'Win Rate',
      icon: <ActivityIcon />,
      tone: 'neutral',
      value: undefined,
      hint: 'Not yet wired',
      tooltip: NOT_YET_WIRED_TOOLTIP_WIN_RATE,
    },
    {
      id: 'high-prob',
      label: 'High Prob',
      icon: <MemoIcon />,
      tone: 'neutral',
      value: undefined,
      hint: 'Not yet wired',
      tooltip: NOT_YET_WIRED_TOOLTIP_HIGH_PROB,
    },
    {
      id: 'stale',
      label: 'Stale 14d+',
      icon: <ChecklistIcon />,
      tone: kpis.staleActivityCount > 0 ? 'atRisk' : 'clear',
      value: kpis.staleActivityCount.toString(),
      hint: 'No activity in 14+ days',
    },
    {
      id: 'in-uw',
      label: 'In UW',
      icon: <StageIcon />,
      tone: kpis.inUnderwritingCount > 0 ? 'info' : 'neutral',
      value: kpis.inUnderwritingCount.toString(),
      hint: 'Active deals in Underwriting',
    },
  ];
  return (
    <section
      className="cc-kpi-grid"
      style={styles.grid}
      aria-label="Workload KPIs"
      data-banker-kpi-grid="phase-125g"
    >
      {specs.map((s) => (
        <KpiTile key={s.id} spec={s} />
      ))}
    </section>
  );
}

function loadingSpec(i: number): KpiSpec {
  return {
    id: `loading-${i}`,
    label: 'Loading…',
    icon: <SparkleIcon />,
    tone: 'neutral',
    value: '—',
    hint: 'Reading authorized records',
  };
}

function KpiTile({ spec }: { spec: KpiSpec }) {
  const isMissing = spec.value === undefined;
  const tonePalette = TONE_TOKENS[spec.tone];
  return (
    <div
      style={{
        ...styles.tile,
        borderTop: `3px solid ${tonePalette.accent}`,
      }}
      data-kpi-tile={spec.id}
      data-kpi-tone={spec.tone}
      title={spec.tooltip}
    >
      <div style={styles.head}>
        <span
          style={{
            ...styles.iconChip,
            background: tonePalette.bg,
            color: tonePalette.accent,
          }}
          aria-hidden="true"
        >
          {spec.icon}
        </span>
        <span style={styles.label}>{spec.label}</span>
      </div>
      <div
        style={{
          ...(isMissing ? styles.valueMissing : styles.value),
          color: isMissing ? palette.textSubtle : tonePalette.fg,
        }}
      >
        {spec.value ?? 'Not yet wired'}
      </div>
      {spec.hint && <div style={styles.hint}>{spec.hint}</div>}
    </div>
  );
}

function formatCurrencyCompact(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const TONE_TOKENS: Record<KpiTone, { accent: string; bg: string; fg: string }> = {
  info: { accent: palette.cobalt, bg: palette.cobaltBg, fg: palette.cobaltFg },
  clear: { accent: palette.clear, bg: palette.clearBg, fg: palette.clearFg },
  atRisk: { accent: palette.atRisk, bg: palette.atRiskBg, fg: palette.atRiskFg },
  blocked: { accent: palette.blocked, bg: palette.blockedBg, fg: palette.blockedFg },
  neutral: { accent: palette.borderStrong, bg: palette.surfaceAlt, fg: palette.text },
  violet: { accent: palette.violet, bg: palette.violetBg, fg: palette.violetFg },
  teal: { accent: palette.teal, bg: palette.tealBg, fg: palette.tealFg },
};

const styles: Record<string, CSSProperties> = {
  grid: {
    // Grid template handled by `.cc-kpi-grid` in src/index.css —
    // Phase 125G stable 5×2 / 4×3 / 2×5 breakpoints.
    padding: `${spacing.lg} ${spacing.xxl}`,
  },
  tile: {
    background: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.card,
    padding: `${spacing.md} ${spacing.lg}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    minHeight: 116,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconChip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  label: {
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    color: palette.textMuted,
    fontWeight: typography.weight.bold,
  },
  value: {
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: 1.05,
  },
  valueMissing: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.regular,
    fontStyle: 'italic',
  },
  hint: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    marginTop: 'auto',
  },
  failed: {
    gridColumn: '1 / -1',
    background: palette.atRiskBg,
    border: `1px solid ${palette.atRisk}`,
    borderRadius: radius.sm,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  failedTitle: {
    fontWeight: typography.weight.semibold,
    color: palette.atRiskFg,
    fontSize: typography.size.md,
  },
  failedDetail: {
    color: palette.text,
    fontSize: typography.size.sm,
  },
  failedHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};

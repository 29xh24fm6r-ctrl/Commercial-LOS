import type { CSSProperties } from 'react';
import { palette, radius, severityPalette, spacing, typography } from '../shared/theme';

/**
 * Phase 124E / 125A — Manager dashboard chart primitives.
 *
 * Inline SVG-based compact chart components for the dense
 * Bloomberg-style manager command center. No external chart
 * dependency; everything renders against shared theme tokens.
 *
 * Discipline:
 *   - Decorative SVG is paired with screen-reader-readable summary
 *     text. Every chart has an aria-label that captures the data
 *     totals so non-visual users get the same signal.
 *   - Honest empty state: when no data points are supplied (or all
 *     values are zero), the chart renders a calm "No data yet"
 *     line rather than a blank box.
 *   - No predictive language anywhere — these are plain count /
 *     amount visualizations.
 */

const CHART_HEIGHT = 140;
const BAR_GAP = 6;

// ---------------------------------------------------------------------------
// Shared frame
// ---------------------------------------------------------------------------

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  ariaLabel: string;
  dataTestid?: string;
  empty?: boolean;
  emptyLabel?: string;
  children?: React.ReactNode;
}

function ChartFrame({
  title,
  subtitle,
  ariaLabel,
  dataTestid,
  empty,
  emptyLabel = 'No data yet.',
  children,
}: ChartFrameProps) {
  return (
    <section
      style={frameStyles.frame}
      aria-label={ariaLabel}
      data-manager-chart={dataTestid}
    >
      <header style={frameStyles.head}>
        <h4 style={frameStyles.title}>{title}</h4>
        {subtitle ? <span style={frameStyles.subtitle}>{subtitle}</span> : null}
      </header>
      <div style={frameStyles.body}>
        {empty ? (
          <p style={frameStyles.empty} role="note">
            {emptyLabel}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// (1) Vertical bar chart — Pipeline by stage
// ---------------------------------------------------------------------------

export interface VerticalBarDatum {
  label: string;
  value: number;
  /** Optional secondary value rendered as a tonal accent. */
  secondaryValue?: number | undefined;
  tone?: 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral';
}

interface VerticalBarChartProps {
  title: string;
  subtitle?: string;
  data: ReadonlyArray<VerticalBarDatum>;
  valueFormatter?: (v: number) => string;
}

export function VerticalBarChart({
  title,
  subtitle,
  data,
  valueFormatter,
}: VerticalBarChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const empty = data.length === 0 || total === 0;
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const fmt = valueFormatter ?? ((v: number) => v.toString());
  const ariaSummary = `${title}: ${data
    .map((d) => `${d.label} ${fmt(d.value)}`)
    .join('; ')}`;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      ariaLabel={ariaSummary}
      dataTestid="vertical-bar-chart"
      empty={empty}
    >
      <ul style={chartStyles.vbarList} role="list">
        {data.map((d) => {
          const tone = d.tone ?? 'info';
          const fill =
            tone === 'neutral' ? palette.border : severityPalette[tone].bar;
          const heightPct = Math.round((d.value / max) * 100);
          return (
            <li
              key={d.label}
              style={chartStyles.vbarItem}
              data-manager-chart-bar={d.label}
            >
              <div style={chartStyles.vbarValueLabel}>{fmt(d.value)}</div>
              <div style={chartStyles.vbarTrack} aria-hidden="true">
                <div
                  style={{
                    ...chartStyles.vbarFill,
                    height: `${heightPct}%`,
                    background: fill,
                  }}
                />
              </div>
              <div style={chartStyles.vbarLabel} title={d.label}>
                {d.label}
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (2) Horizontal bar chart — Pipeline by banker / counts by category
// ---------------------------------------------------------------------------

export interface HorizontalBarDatum {
  label: string;
  /** Primary value rendered on the bar fill. */
  value: number;
  /** Optional secondary label rendered after the bar (e.g. "$2.5M"). */
  secondaryLabel?: string;
  tone?: 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral';
}

interface HorizontalBarChartProps {
  title: string;
  subtitle?: string;
  data: ReadonlyArray<HorizontalBarDatum>;
  valueFormatter?: (v: number) => string;
  maxRows?: number;
}

export function HorizontalBarChart({
  title,
  subtitle,
  data,
  valueFormatter,
  maxRows = 8,
}: HorizontalBarChartProps) {
  const visible = data.slice(0, maxRows);
  const total = visible.reduce((s, d) => s + d.value, 0);
  const empty = visible.length === 0 || total === 0;
  const max = visible.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const fmt = valueFormatter ?? ((v: number) => v.toString());
  const ariaSummary = `${title}: ${visible
    .map((d) => `${d.label} ${fmt(d.value)}`)
    .join('; ')}`;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      ariaLabel={ariaSummary}
      dataTestid="horizontal-bar-chart"
      empty={empty}
    >
      <ul style={chartStyles.hbarList} role="list">
        {visible.map((d) => {
          const tone = d.tone ?? 'info';
          const fill =
            tone === 'neutral' ? palette.border : severityPalette[tone].bar;
          const widthPct = Math.max(2, Math.round((d.value / max) * 100));
          return (
            <li
              key={d.label}
              style={chartStyles.hbarItem}
              data-manager-chart-bar={d.label}
            >
              <span style={chartStyles.hbarLabel} title={d.label}>
                {d.label}
              </span>
              <span style={chartStyles.hbarTrack} aria-hidden="true">
                <span
                  style={{
                    ...chartStyles.hbarFill,
                    width: `${widthPct}%`,
                    background: fill,
                  }}
                />
                <span style={chartStyles.hbarValue}>{fmt(d.value)}</span>
              </span>
              {d.secondaryLabel ? (
                <span style={chartStyles.hbarSecondary}>{d.secondaryLabel}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (3) Histogram — Aging buckets / fixed-bin counts
// ---------------------------------------------------------------------------

export interface HistogramDatum {
  label: string;
  value: number;
  tone?: 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral';
}

interface HistogramProps {
  title: string;
  subtitle?: string;
  data: ReadonlyArray<HistogramDatum>;
}

export function Histogram({ title, subtitle, data }: HistogramProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const empty = data.length === 0 || total === 0;
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  const ariaSummary = `${title}: ${data
    .map((d) => `${d.label} ${d.value}`)
    .join('; ')}`;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      ariaLabel={ariaSummary}
      dataTestid="histogram"
      empty={empty}
    >
      <ul style={chartStyles.histList} role="list">
        {data.map((d) => {
          const tone = d.tone ?? 'info';
          const fill =
            tone === 'neutral' ? palette.border : severityPalette[tone].bar;
          const heightPct = Math.max(4, Math.round((d.value / max) * 100));
          return (
            <li
              key={d.label}
              style={chartStyles.histItem}
              data-manager-chart-bin={d.label}
            >
              <div style={chartStyles.histValue}>{d.value}</div>
              <div style={chartStyles.histTrack} aria-hidden="true">
                <div
                  style={{
                    ...chartStyles.histFill,
                    height: `${heightPct}%`,
                    background: fill,
                  }}
                />
              </div>
              <div style={chartStyles.histLabel}>{d.label}</div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

// ---------------------------------------------------------------------------
// (4) Donut — Risk distribution (blocked / at-risk / clear / unknown)
// ---------------------------------------------------------------------------

export interface DonutSegment {
  label: string;
  value: number;
  tone: 'info' | 'clear' | 'atRisk' | 'blocked' | 'neutral';
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  segments: ReadonlyArray<DonutSegment>;
}

export function DonutChart({ title, subtitle, segments }: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const empty = total === 0;
  const ariaSummary = `${title}: ${segments
    .map((s) => `${s.label} ${s.value}`)
    .join('; ')}`;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      ariaLabel={ariaSummary}
      dataTestid="donut-chart"
      empty={empty}
    >
      <div style={chartStyles.donutBody}>
        <DonutSvg segments={segments} total={total} />
        <ul style={chartStyles.donutLegend} role="list">
          {segments.map((s) => {
            const color = severityPalette[s.tone].bar;
            const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
            return (
              <li
                key={s.label}
                style={chartStyles.donutLegendItem}
                data-manager-chart-segment={s.label}
              >
                <span
                  style={{
                    ...chartStyles.donutSwatch,
                    background: color,
                  }}
                  aria-hidden="true"
                />
                <span style={chartStyles.donutLegendLabel}>{s.label}</span>
                <span style={chartStyles.donutLegendValue}>
                  {s.value} ({pct}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartFrame>
  );
}

function DonutSvg({
  segments,
  total,
}: {
  segments: ReadonlyArray<DonutSegment>;
  total: number;
}) {
  const size = 96;
  const radiusPx = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radiusPx;
  let offset = 0;
  const parts: Array<{ key: string; dashArray: string; dashOffset: number; color: string }> = [];
  if (total > 0) {
    for (const s of segments) {
      if (s.value === 0) continue;
      const fraction = s.value / total;
      const length = fraction * circumference;
      parts.push({
        key: s.label,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -offset,
        color: severityPalette[s.tone].bar,
      });
      offset += length;
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={cx}
        cy={cy}
        r={radiusPx}
        fill="none"
        stroke={palette.divider}
        strokeWidth="10"
      />
      {parts.map((p) => (
        <circle
          key={p.key}
          cx={cx}
          cy={cy}
          r={radiusPx}
          fill="none"
          stroke={p.color}
          strokeWidth="10"
          strokeDasharray={p.dashArray}
          strokeDashoffset={p.dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily={typography.family}
        fontSize="13"
        fontWeight="700"
        fill={palette.text}
      >
        {total}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// (5) Forecast sparkline — month-bucket counts + amounts
// ---------------------------------------------------------------------------

export interface ForecastPoint {
  label: string;
  dealCount: number;
  totalAmount: number;
}

interface ForecastSparklineProps {
  title: string;
  subtitle?: string;
  points: ReadonlyArray<ForecastPoint>;
}

export function ForecastSparkline({
  title,
  subtitle,
  points,
}: ForecastSparklineProps) {
  const total = points.reduce((s, p) => s + p.dealCount, 0);
  const empty = points.length === 0 || total === 0;
  const max = points.reduce((m, p) => Math.max(m, p.dealCount), 0) || 1;
  const ariaSummary = `${title}: ${points
    .map((p) => `${p.label} ${p.dealCount} deals`)
    .join('; ')}`;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      ariaLabel={ariaSummary}
      dataTestid="forecast-sparkline"
      empty={empty}
    >
      <ul style={chartStyles.forecastList} role="list">
        {points.map((p) => {
          const heightPct = Math.max(4, Math.round((p.dealCount / max) * 100));
          return (
            <li
              key={p.label}
              style={chartStyles.forecastItem}
              data-manager-chart-month={p.label}
            >
              <div style={chartStyles.forecastValue}>{p.dealCount}</div>
              <div style={chartStyles.forecastTrack} aria-hidden="true">
                <div
                  style={{
                    ...chartStyles.forecastFill,
                    height: `${heightPct}%`,
                  }}
                />
              </div>
              <div style={chartStyles.forecastLabel}>{p.label}</div>
              <div style={chartStyles.forecastAmount}>
                {p.totalAmount > 0 ? formatCurrencyCompact(p.totalAmount) : '—'}
              </div>
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

function formatCurrencyCompact(amount: number): string {
  // Compact USD: $2.5M, $750K, $1.2B
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const frameStyles: Record<string, CSSProperties> = {
  frame: {
    background: palette.surface,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
    minWidth: 0,
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px dashed ${palette.divider}`,
    paddingBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.label,
  },
  subtitle: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  body: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  empty: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
    padding: `${spacing.lg} 0`,
  },
};

const chartStyles: Record<string, CSSProperties> = {
  // Vertical bars (stage chart)
  vbarList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    alignItems: 'flex-end',
    gap: BAR_GAP,
    height: CHART_HEIGHT,
    minWidth: 0,
  },
  vbarItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minWidth: 0,
    gap: 2,
  },
  vbarValueLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
  },
  vbarTrack: {
    flex: 1,
    width: '100%',
    background: palette.deckBg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    alignItems: 'flex-end',
    minHeight: 4,
  },
  vbarFill: {
    width: '100%',
    borderRadius: radius.sm,
    transition: 'height 200ms ease',
  },
  vbarLabel: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    maxWidth: '100%',
    textAlign: 'center' as const,
  },
  // Horizontal bars (banker leaderboard)
  hbarList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  hbarItem: {
    display: 'grid',
    gridTemplateColumns: '110px 1fr auto',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  hbarLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  hbarTrack: {
    position: 'relative' as const,
    height: 18,
    background: palette.deckBg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    minWidth: 0,
  },
  hbarFill: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: radius.sm,
    transition: 'width 200ms ease',
  },
  hbarValue: {
    position: 'absolute' as const,
    top: 0,
    right: 6,
    bottom: 0,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
    display: 'flex',
    alignItems: 'center',
  },
  hbarSecondary: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontFamily: typography.mono,
    fontWeight: typography.weight.semibold,
  },
  // Histogram (aging)
  histList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    gap: BAR_GAP,
    height: CHART_HEIGHT,
    alignItems: 'flex-end',
  },
  histItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  histValue: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
  },
  histTrack: {
    flex: 1,
    width: '100%',
    background: palette.deckBg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    alignItems: 'flex-end',
    minHeight: 4,
  },
  histFill: {
    width: '100%',
    borderRadius: radius.sm,
  },
  histLabel: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    textAlign: 'center' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    maxWidth: '100%',
  },
  // Donut
  donutBody: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: spacing.md,
  },
  donutLegend: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  donutLegendItem: {
    display: 'grid',
    gridTemplateColumns: '10px 1fr auto',
    alignItems: 'center',
    gap: spacing.xs,
  },
  donutSwatch: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  donutLegendLabel: {
    fontSize: typography.size.xs,
    color: palette.text,
    fontWeight: typography.weight.semibold,
  },
  donutLegendValue: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontFamily: typography.mono,
  },
  // Forecast sparkline
  forecastList: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    gap: BAR_GAP,
    height: CHART_HEIGHT,
    alignItems: 'flex-end',
  },
  forecastItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  forecastValue: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: palette.text,
    fontFamily: typography.mono,
  },
  forecastTrack: {
    flex: 1,
    width: '100%',
    background: palette.deckBg,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    alignItems: 'flex-end',
    minHeight: 4,
  },
  forecastFill: {
    width: '100%',
    borderRadius: radius.sm,
    background: palette.primary,
  },
  forecastLabel: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    textAlign: 'center' as const,
  },
  forecastAmount: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontFamily: typography.mono,
    textAlign: 'center' as const,
  },
};

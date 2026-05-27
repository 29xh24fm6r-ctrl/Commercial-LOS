import type { CSSProperties, ReactNode } from 'react';
import {
  palette,
  radius,
  severityPalette,
  shadow,
  spacing,
  typography,
  type SeverityKey,
} from './theme';
import { IconChip } from './cockpitIcons';

/**
 * Phase 125D — Cockpit visual primitives.
 *
 * Bloomberg-Terminal-meets-Apple-Enterprise vocabulary for the
 * deal workspace. Five primitives in one module so the cockpit
 * surface can be composed from named building blocks without a
 * file explosion:
 *
 *   1. MetricTile      — compact KPI tile: tiny label + bold
 *                        value + optional sub-value + optional
 *                        tonal accent stripe.
 *   2. CompletenessRing — inline-SVG circular progress ring for
 *                        deal-profile completeness. Honest:
 *                        rendered as a percentage of populated
 *                        deal-summary fields, never a "deal
 *                        score" / "approval odds" / "predicted
 *                        close" claim.
 *   3. WorkstreamBar   — horizontal mini progress bar showing
 *                        completed/total ratio (tasks, docs,
 *                        memo, communication). Tonal: clear
 *                        when complete, atRisk when behind,
 *                        neutral when sparse.
 *   4. CountBadge      — count pill for card-header trailing
 *                        slots and tab headers. Tonal so the
 *                        right rail communicates state at a
 *                        glance.
 *   5. SeverityMeter   — horizontal bar of severity tiles
 *                        (blocked / atRisk / clear) for the
 *                        AttentionConsole header.
 *
 * Every primitive uses ONLY theme tokens. No literal hex outside
 * the gradient strings (which compose existing tokens via rgba).
 * aria-hidden visuals never carry semantic content alone — every
 * decorative SVG is paired with text the screen reader can read.
 */

// ---------------------------------------------------------------------------
// (1) MetricTile
// ---------------------------------------------------------------------------

export interface MetricTileProps {
  /** Tiny uppercase label (e.g. "LOAN AMOUNT"). */
  label: string;
  /** Bold primary value. Pass `undefined` for honest "Not set". */
  value: string | undefined;
  /** Optional smaller sub-value beneath (e.g. "in 12 days"). */
  sub?: string | undefined;
  /**
   * Optional severity tone — drives the top accent stripe color.
   * 'info' = cobalt-leaning primary tile (default).
   * 'clear' = green (healthy / complete).
   * 'atRisk' = amber.
   * 'blocked' = red.
   * 'neutral' = no accent stripe (the calm tone).
   */
  tone?: SeverityKey;
  /** Optional accessible name (overrides the auto-built one). */
  'aria-label'?: string;
}

export function MetricTile({
  label,
  value,
  sub,
  tone = 'neutral',
  'aria-label': ariaLabel,
}: MetricTileProps) {
  const stripe = tone === 'neutral' ? palette.border : severityPalette[tone].bar;
  const isMissing = value === undefined;
  return (
    <div
      role="group"
      data-metric-tile={tone}
      aria-label={ariaLabel ?? `${label}: ${value ?? 'not set'}`}
      style={{
        ...tileStyle,
        borderTop: `2px solid ${stripe}`,
      }}
    >
      <div style={tileLabelStyle}>{label}</div>
      <div style={isMissing ? tileValueMissingStyle : tileValueStyle}>
        {value ?? 'Not set'}
      </div>
      {sub !== undefined && (
        <div style={tileSubStyle}>{sub}</div>
      )}
    </div>
  );
}

const tileStyle: CSSProperties = {
  background: palette.deckTile,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.sm,
  padding: `${spacing.xs} ${spacing.sm}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minHeight: 64,
  boxShadow: shadow.deck,
  minWidth: 0,
};

const tileLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tileValueStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.lg,
  fontWeight: typography.weight.bold,
  color: palette.text,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: typography.letterSpacing.heading,
  lineHeight: typography.lineHeight.tight,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const tileValueMissingStyle: CSSProperties = {
  ...tileValueStyle,
  color: palette.textSubtle,
  fontStyle: 'italic',
  fontSize: typography.size.md,
  fontWeight: typography.weight.regular,
};

const tileSubStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// ---------------------------------------------------------------------------
// (2) CompletenessRing
// ---------------------------------------------------------------------------

export interface CompletenessRingProps {
  /** 0-100 — clamped internally. */
  percent: number;
  /** Diameter in pixels. Default 72. */
  size?: number;
  /** Optional override for the readout below the percentage. */
  caption?: string;
  /** Optional accessible name (the ring is decorative; the caption is the SR text). */
  'aria-label'?: string;
}

export function CompletenessRing({
  percent,
  size = 72,
  caption,
  'aria-label': ariaLabel,
}: CompletenessRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const radiusPx = (size - 8) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  const offset = circumference * (1 - clamped / 100);
  const tone: SeverityKey =
    clamped >= 80 ? 'clear' : clamped >= 50 ? 'info' : clamped >= 25 ? 'atRisk' : 'blocked';
  const accent = severityPalette[tone].bar;
  return (
    <div
      role="group"
      data-completeness-ring={tone}
      aria-label={ariaLabel ?? `Profile completeness ${clamped} percent`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        role="presentation"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          fill="none"
          stroke={palette.divider}
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          fill="none"
          stroke={accent}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily={typography.family}
          fontSize="14"
          fontWeight="700"
          fill={palette.text}
        >
          {`${clamped}%`}
        </text>
      </svg>
      {caption !== undefined && (
        <div style={ringCaptionStyle}>{caption}</div>
      )}
    </div>
  );
}

const ringCaptionStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
  textAlign: 'center',
  lineHeight: typography.lineHeight.snug,
  maxWidth: 140,
};

// ---------------------------------------------------------------------------
// (3) WorkstreamBar
// ---------------------------------------------------------------------------

export interface WorkstreamBarProps {
  /** Short uppercase label (e.g. "TASKS"). */
  label: string;
  /** Numerator — typically completed/received. */
  done: number;
  /** Denominator — typically total. */
  total: number;
  /** Optional honest right-side detail (e.g. "2 overdue"). */
  detail?: string | undefined;
  /**
   * Tone override. If omitted, derived from the ratio: clear when
   * 100% done, atRisk when there's outstanding work, neutral when
   * there's nothing to track (total === 0).
   */
  tone?: SeverityKey;
}

export function WorkstreamBar({
  label,
  done,
  total,
  detail,
  tone,
}: WorkstreamBarProps) {
  const effectiveTotal = Math.max(0, Math.floor(total));
  const effectiveDone = Math.max(0, Math.min(effectiveTotal, Math.floor(done)));
  const ratio = effectiveTotal === 0 ? 0 : effectiveDone / effectiveTotal;
  const inferredTone: SeverityKey =
    effectiveTotal === 0
      ? 'neutral'
      : effectiveDone >= effectiveTotal
        ? 'clear'
        : effectiveDone === 0
          ? 'atRisk'
          : 'info';
  const finalTone: SeverityKey = tone ?? inferredTone;
  const fill = severityPalette[finalTone].bar;
  const empty = palette.divider;
  const ratioPct = Math.round(ratio * 100);
  return (
    <div
      data-workstream-bar={finalTone}
      style={barWrapStyle}
      aria-label={`${label}: ${effectiveDone} of ${effectiveTotal}${detail ? ` · ${detail}` : ''}`}
    >
      <div style={barLabelRowStyle}>
        <span style={barLabelStyle}>{label}</span>
        <span style={barCountStyle}>
          {effectiveTotal === 0
            ? '0'
            : `${effectiveDone} / ${effectiveTotal}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={effectiveTotal || 1}
        aria-valuenow={effectiveDone}
        style={{
          ...barTrackStyle,
          background: empty,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            ...barFillStyle,
            width: `${ratioPct}%`,
            background: fill,
          }}
        />
      </div>
      {detail !== undefined && (
        <div style={barDetailStyle}>{detail}</div>
      )}
    </div>
  );
}

const barWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};

const barLabelRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: spacing.xs,
};

const barLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textSubtle,
  fontWeight: typography.weight.semibold,
};

const barCountStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.text,
  fontVariantNumeric: 'tabular-nums',
};

const barTrackStyle: CSSProperties = {
  position: 'relative',
  height: 6,
  borderRadius: radius.pill,
  overflow: 'hidden',
};

const barFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: radius.pill,
  transition: 'width 200ms ease',
};

const barDetailStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textMuted,
};

// ---------------------------------------------------------------------------
// (4) CountBadge
// ---------------------------------------------------------------------------

export interface CountBadgeProps {
  count: number;
  tone?: SeverityKey;
  /** Optional accessible name override. */
  'aria-label'?: string;
}

export function CountBadge({ count, tone = 'neutral', 'aria-label': ariaLabel }: CountBadgeProps) {
  const p = severityPalette[tone];
  return (
    <span
      data-count-badge={tone}
      aria-label={ariaLabel ?? `Count: ${count}`}
      style={{
        ...countBadgeStyle,
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.bar}`,
      }}
    >
      {count}
    </span>
  );
}

const countBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 22,
  height: 22,
  padding: `0 ${spacing.xs}`,
  borderRadius: radius.pill,
  fontSize: typography.size.xs,
  fontWeight: typography.weight.bold,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
};

// ---------------------------------------------------------------------------
// (5) SeverityMeter
// ---------------------------------------------------------------------------

export interface SeverityMeterCount {
  severity: SeverityKey;
  count: number;
  label: string;
}

export interface SeverityMeterProps {
  /**
   * Ordered list of severity buckets to display as tiles. Counts
   * are rendered honestly — zero counts render as muted tiles
   * (so the meter consistently shows "0 blocked / 0 at-risk /
   * 0 clear" instead of vanishing on a healthy deal).
   */
  buckets: ReadonlyArray<SeverityMeterCount>;
}

export function SeverityMeter({ buckets }: SeverityMeterProps) {
  return (
    <div style={meterRowStyle} role="group" aria-label="Severity counts">
      {buckets.map((b) => {
        const p = severityPalette[b.severity];
        const isZero = b.count === 0;
        return (
          <div
            key={b.severity}
            data-severity-meter-tile={b.severity}
            style={{
              ...meterTileStyle,
              background: isZero ? palette.surfaceAlt : p.bg,
              color: isZero ? palette.textSubtle : p.fg,
              borderColor: isZero ? palette.divider : p.bar,
            }}
            aria-label={`${b.label}: ${b.count}`}
          >
            <span style={meterCountStyle}>{b.count}</span>
            <span style={meterLabelStyle}>{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const meterRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
  gap: spacing.xs,
  width: '100%',
};

const meterTileStyle: CSSProperties = {
  border: '1px solid',
  borderRadius: radius.sm,
  padding: `${spacing.xs} ${spacing.sm}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
  minWidth: 0,
};

const meterCountStyle: CSSProperties = {
  fontSize: typography.size.xl,
  fontWeight: typography.weight.bold,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
};

const meterLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};

// ---------------------------------------------------------------------------
// (6) GlassPanel — a small flexible wrapper used by cockpit
//     headers (AttentionConsole / ActionConsole / StageMap).
// ---------------------------------------------------------------------------

export function GlassPanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div data-cockpit-glass-panel style={{ ...glassPanelStyle, ...style }}>
      {children}
    </div>
  );
}

const glassPanelStyle: CSSProperties = {
  background: palette.glassPanel,
  border: `1px solid ${palette.divider}`,
  borderRadius: radius.sm,
  padding: `${spacing.sm} ${spacing.md}`,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};

// ---------------------------------------------------------------------------
// (7) LargeMetricTile — Phase 125E centerpiece KPI tile.
// ---------------------------------------------------------------------------

export interface LargeMetricTileProps {
  /** Tiny uppercase label (e.g. "LOAN AMOUNT"). */
  label: string;
  /** Bold primary value. Pass `undefined` for honest "Not set". */
  value: string | undefined;
  /** Optional second-line sub value. */
  sub?: string | undefined;
  /** Optional icon (pass a CockpitIcon glyph). */
  icon?: ReactNode;
  /**
   * Severity tone — drives the icon halo color + the left accent
   * bar. 'info' = cobalt (default), 'clear' = green (healthy),
   * 'atRisk' = amber, 'blocked' = red, 'neutral' = no accent.
   * Phase 125E also accepts 'violet' / 'teal' to color the long-
   * tail cockpit accents (target-close violet, etc.).
   */
  tone?: SeverityKey | 'violet' | 'teal';
  /** Optional accessible name override. */
  'aria-label'?: string;
}

export function LargeMetricTile({
  label,
  value,
  sub,
  icon,
  tone = 'info',
  'aria-label': ariaLabel,
}: LargeMetricTileProps) {
  const accent = TONE_ACCENT[tone];
  const isMissing = value === undefined;
  return (
    <div
      role="group"
      data-large-metric-tile={tone}
      aria-label={ariaLabel ?? `${label}: ${value ?? 'not set'}`}
      style={{
        ...largeTileStyle,
        borderTop: `4px solid ${accent}`,
      }}
    >
      <div style={largeTileHeadStyle}>
        {icon && (
          <IconChip
            tone={tone === 'violet' || tone === 'teal' ? tone : (tone as SeverityKey)}
            size={36}
          >
            {icon}
          </IconChip>
        )}
        <span style={largeTileLabelStyle}>{label}</span>
      </div>
      <div style={isMissing ? largeTileValueMissingStyle : largeTileValueStyle}>
        {value ?? 'Not set'}
      </div>
      {sub !== undefined && (
        <div style={largeTileSubStyle}>{sub}</div>
      )}
    </div>
  );
}

const TONE_ACCENT: Record<string, string> = {
  blocked: palette.blocked,
  atRisk: palette.atRisk,
  clear: palette.clear,
  neutral: palette.borderStrong,
  info: palette.cobalt,
  violet: palette.violet,
  teal: palette.teal,
};

const largeTileStyle: CSSProperties = {
  background: palette.deckTile,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.md,
  padding: `${spacing.md} ${spacing.md} ${spacing.md}`,
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
  minHeight: 140,
  boxShadow: shadow.elevated,
  minWidth: 0,
};

const largeTileHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  minWidth: 0,
};

const largeTileLabelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  color: palette.textMuted,
  fontWeight: typography.weight.bold,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const largeTileValueStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.display,
  fontWeight: typography.weight.bold,
  color: palette.text,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: typography.letterSpacing.hero,
  lineHeight: 1.05,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const largeTileValueMissingStyle: CSSProperties = {
  ...largeTileValueStyle,
  color: palette.textSubtle,
  fontStyle: 'italic',
  fontSize: typography.size.xxl,
  fontWeight: typography.weight.regular,
};

const largeTileSubStyle: CSSProperties = {
  fontSize: typography.size.sm,
  color: palette.textMuted,
  lineHeight: typography.lineHeight.snug,
  marginTop: 'auto',
};

// ---------------------------------------------------------------------------
// (8) WidgetHeader — Phase 125E right-rail operational widget header.
//
// Bold icon + title + optional count badge + optional mini progress bar.
// Replaces CardHeader for the right-rail cards so each one reads as a
// distinct operational widget instead of a paragraph-style card.
// ---------------------------------------------------------------------------

export interface WidgetHeaderProps {
  /** Title text. */
  title: string;
  /**
   * Optional one-line subtitle. Phase 125E intentionally keeps
   * widget subtitles short — the widget signals state with the
   * count + bar; the subtitle is supportive text only.
   */
  subtitle?: string;
  /** Icon (a CockpitIcon glyph). */
  icon?: ReactNode;
  /**
   * Icon tone — drives the halo color. 'info' = cobalt (default),
   * 'clear' = green, 'atRisk' = amber, 'blocked' = red, 'neutral'
   * = gray, and the new 'violet' / 'teal' accents for advanced
   * surfaces.
   */
  iconTone?: SeverityKey | 'violet' | 'teal';
  /** Count badge displayed on the right. Pass undefined to omit. */
  count?: number;
  /**
   * Count badge tone. Defaults to neutral. Pass 'atRisk' for an
   * amber pill (overdue tasks / outstanding docs), 'clear' for
   * green (zero outstanding), etc.
   */
  countTone?: SeverityKey;
  /**
   * Optional progress bar shown beneath the title row. Provide
   * `progress.done / progress.total`; the bar paints `done/total`
   * filled in the supplied tone (or info-cobalt by default).
   * Pass `total === 0` to render a muted "empty" rail.
   */
  progress?: {
    done: number;
    total: number;
    tone?: SeverityKey;
    /**
     * Optional accessible label for the progress bar. Defaults to
     * "<title> progress".
     */
    'aria-label'?: string;
  };
  /** Right-aligned slot for action buttons / extra badges. */
  trailing?: ReactNode;
}

export function WidgetHeader({
  title,
  subtitle,
  icon,
  iconTone = 'info',
  count,
  countTone = 'neutral',
  progress,
  trailing,
}: WidgetHeaderProps) {
  return (
    <header data-widget-header style={widgetHeaderStyle}>
      <div style={widgetHeaderRowStyle}>
        {icon && (
          <IconChip
            tone={iconTone === 'violet' || iconTone === 'teal' ? iconTone : (iconTone as SeverityKey)}
            size={36}
          >
            {icon}
          </IconChip>
        )}
        <div style={widgetTitleBlockStyle}>
          <h3 style={widgetTitleStyle}>{title}</h3>
          {subtitle && <p style={widgetSubtitleStyle}>{subtitle}</p>}
        </div>
        <div style={widgetTrailingStyle}>
          {count !== undefined && (
            <CountBadge
              count={count}
              tone={countTone}
              aria-label={`${title}: ${count}`}
            />
          )}
          {trailing}
        </div>
      </div>
      {progress && (
        <WidgetProgressBar
          done={progress.done}
          total={progress.total}
          tone={progress.tone}
          ariaLabel={progress['aria-label'] ?? `${title} progress`}
        />
      )}
    </header>
  );
}

function WidgetProgressBar({
  done,
  total,
  tone,
  ariaLabel,
}: {
  done: number;
  total: number;
  tone?: SeverityKey;
  ariaLabel: string;
}) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeDone = Math.max(0, Math.min(safeTotal, Math.floor(done)));
  const ratio = safeTotal === 0 ? 0 : safeDone / safeTotal;
  const inferred: SeverityKey =
    safeTotal === 0 ? 'neutral' : safeDone >= safeTotal ? 'clear' : safeDone === 0 ? 'atRisk' : 'info';
  const finalTone: SeverityKey = tone ?? inferred;
  const fill = severityPalette[finalTone].bar;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeTotal || 1}
      aria-valuenow={safeDone}
      aria-label={ariaLabel}
      style={widgetBarTrackStyle}
    >
      <div
        aria-hidden="true"
        style={{
          ...widgetBarFillStyle,
          width: `${Math.round(ratio * 100)}%`,
          background: fill,
        }}
      />
    </div>
  );
}

const widgetHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.xs,
};

const widgetHeaderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.sm,
  minWidth: 0,
};

const widgetTitleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
};

const widgetTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.lg,
  fontWeight: typography.weight.bold,
  color: palette.text,
  letterSpacing: typography.letterSpacing.heading,
  lineHeight: typography.lineHeight.tight,
};

const widgetSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: typography.size.sm,
  color: palette.textMuted,
  lineHeight: typography.lineHeight.snug,
};

const widgetTrailingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: spacing.xs,
  flexShrink: 0,
};

const widgetBarTrackStyle: CSSProperties = {
  position: 'relative',
  height: 6,
  borderRadius: radius.pill,
  overflow: 'hidden',
  background: palette.divider,
};

const widgetBarFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: radius.pill,
  transition: 'width 200ms ease',
};

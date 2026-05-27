import { useDealData } from './DealDataProvider';
import { radius, shadow, spacing, typography } from '../shared/theme';

/**
 * Phase 125B — Deal Workspace Command Center hero.
 *
 * Premium navy hero band that anchors the deal workspace as a
 * commercial-lending command center, not a Dataverse record page.
 * Layout:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  ● Commercial Lending Deal                                │
 *   │  TEST — Deal Phase 121                                    │
 *   │  Stage chip · Status chip                                 │
 *   │  Derived from authorized deal records.                    │
 *   ├──────────────────────────────────────────────────────────┤
 *   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
 *   │  │ AMOUNT │ │ CLIENT │ │ T-CLOSE│ │ BANKER │ glass cells │
 *   │  └────────┘ └────────┘ └────────┘ └────────┘              │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Honest absence rules unchanged from Phase 125:
 *   - amount missing → italic "Not set" inside the metric cell
 *   - target close missing → italic "Not set"
 *   - client / banker missing → italic "Not set"
 *
 * Hook surface unchanged from Phase 125 (single `useDealData()`).
 * No new hooks, no conditional hooks, no early returns. Phase 110
 * communication lock honored — no email-lane import in this file.
 */
export function DealHeader() {
  const { deal } = useDealData();
  const targetCloseLabel = formatTargetCloseRelative(deal.targetCloseDate);

  return (
    <header style={styles.hero} aria-label="Deal header">
      <div style={styles.heroOverlay} aria-hidden="true" />
      <div style={styles.heroContent}>
        <div style={styles.eyebrowRow}>
          <span style={styles.eyebrowDot} aria-hidden="true" />
          <span style={styles.eyebrow}>Commercial Lending Deal</span>
        </div>

        <h1 style={styles.name}>{deal.name}</h1>

        <div style={styles.chipRow}>
          <span
            style={deal.stage ? styles.chip : styles.chipMissing}
            aria-label={`Stage: ${deal.stage ?? 'not set'}`}
          >
            {deal.stage ? `Stage · ${deal.stage}` : 'Stage · Not set'}
          </span>
          <span
            style={deal.status ? styles.chip : styles.chipMissing}
            aria-label={`Status: ${deal.status ?? 'not set'}`}
          >
            {deal.status ? `Status · ${deal.status}` : 'Status · Not set'}
          </span>
        </div>

        <p style={styles.governance}>
          Derived from authorized deal records. Conservative copy: no
          performance ranking, no predictive claim, no compensation
          impact.
        </p>

        <dl style={styles.metricStrip} aria-label="Deal metrics">
          <MetricCell
            label="Loan amount"
            value={
              deal.amount != null && Number.isFinite(deal.amount)
                ? formatCurrency(deal.amount)
                : undefined
            }
            isHero
          />
          <MetricCell label="Client" value={deal.clientName} />
          <MetricCell label="Target close" value={targetCloseLabel} />
          <MetricCell label="Assigned banker" value={deal.bankerName} />
        </dl>
      </div>
    </header>
  );
}

function MetricCell({
  label,
  value,
  isHero,
}: {
  label: string;
  value: string | undefined;
  isHero?: boolean;
}) {
  return (
    <div style={styles.metricCell}>
      <dt style={styles.metricLabel}>{label}</dt>
      <dd style={value ? (isHero ? styles.metricValueHero : styles.metricValue) : styles.metricValueMissing}>
        {value ?? 'Not set'}
      </dd>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatTargetCloseRelative(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const absolute = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${absolute} (${Math.abs(days)}d past)`;
  if (days === 0) return `${absolute} (today)`;
  if (days === 1) return `${absolute} (tomorrow)`;
  if (days < 30) return `${absolute} (in ${days}d)`;
  return absolute;
}

const NAVY_HERO_BG =
  'linear-gradient(135deg, #0f172a 0%, #14213d 55%, #1f3461 100%)';
const NAVY_HERO_OVERLAY =
  'radial-gradient(circle at 85% -10%, rgba(96, 165, 250, 0.18), transparent 55%)';
const GLASS_CELL_BG = 'rgba(255, 255, 255, 0.06)';
const GLASS_CELL_BORDER = 'rgba(255, 255, 255, 0.14)';
const HERO_TEXT = '#f1f5fa';
const HERO_TEXT_MUTED = 'rgba(241, 245, 250, 0.72)';
const HERO_TEXT_SUBTLE = 'rgba(241, 245, 250, 0.52)';
const HERO_ACCENT = '#60a5fa';

const styles: Record<string, React.CSSProperties> = {
  hero: {
    position: 'relative' as const,
    background: NAVY_HERO_BG,
    borderRadius: radius.md,
    // Phase 125C — layered depth: cobalt inset glow (Phase 125C
    // theme `shadow.glow` token) + the deeper Phase 123 `shadow.hero`
    // outer shadow. The combination gives the navy band more
    // dimensional presence without becoming a popover.
    boxShadow: `${shadow.glow}, ${shadow.hero}`,
    overflow: 'hidden' as const,
    marginBottom: spacing.lg,
    color: HERO_TEXT,
  },
  heroOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: NAVY_HERO_OVERLAY,
    pointerEvents: 'none' as const,
  },
  heroContent: {
    position: 'relative' as const,
    padding: `${spacing.xl} ${spacing.xxl}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.sm,
  },
  eyebrowRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
  },
  eyebrowDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    background: HERO_ACCENT,
  },
  eyebrow: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: HERO_ACCENT,
    fontWeight: typography.weight.semibold,
  },
  name: {
    margin: 0,
    fontSize: typography.size.hero,
    fontWeight: typography.weight.bold,
    color: HERO_TEXT,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    paddingTop: 4,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: GLASS_CELL_BG,
    color: HERO_TEXT,
    border: `1px solid ${GLASS_CELL_BORDER}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
  },
  chipMissing: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: 'transparent',
    color: HERO_TEXT_SUBTLE,
    border: `1px dashed ${GLASS_CELL_BORDER}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontStyle: 'italic' as const,
    letterSpacing: typography.letterSpacing.label,
  },
  governance: {
    margin: 0,
    fontSize: typography.size.sm,
    color: HERO_TEXT_MUTED,
    lineHeight: typography.lineHeight.snug,
    maxWidth: 640,
  },
  metricStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.sm,
    margin: 0,
    paddingTop: spacing.sm,
  },
  metricCell: {
    background: GLASS_CELL_BG,
    border: `1px solid ${GLASS_CELL_BORDER}`,
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    minHeight: 76,
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: HERO_TEXT_SUBTLE,
    fontWeight: typography.weight.semibold,
    margin: 0,
  },
  metricValue: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: HERO_TEXT,
    fontVariantNumeric: 'tabular-nums' as const,
    letterSpacing: typography.letterSpacing.heading,
    lineHeight: typography.lineHeight.tight,
  },
  metricValueHero: {
    margin: 0,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: HERO_TEXT,
    fontVariantNumeric: 'tabular-nums' as const,
    letterSpacing: typography.letterSpacing.hero,
    lineHeight: typography.lineHeight.tight,
  },
  metricValueMissing: {
    margin: 0,
    fontSize: typography.size.md,
    fontWeight: typography.weight.regular,
    color: HERO_TEXT_SUBTLE,
    fontStyle: 'italic' as const,
  },
};

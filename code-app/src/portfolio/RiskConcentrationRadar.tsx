import { Link } from 'react-router-dom';
import {
  VerticalBarChart,
  HorizontalBarChart,
  type VerticalBarDatum,
  type HorizontalBarDatum,
} from '../manager/ManagerChartPrimitives';
import {
  PORTFOLIO_RISK_DIMENSION_LABELS,
  type PortfolioBand,
  type PortfolioRiskSnapshot,
  type PortfolioRiskFinding,
  type PortfolioFindingSeverity,
} from './portfolioRiskEngine';
import {
  palette,
  radius,
  severityPalette,
  shadow,
  spacing,
  typography,
} from '../shared/theme';

/**
 * Phase 132A — Risk & Concentration Radar.
 *
 * Read-only portfolio-risk cockpit section. Pure presentation over the
 * already-derived `PortfolioRiskSnapshot`. No buttons, no forms, no
 * write affordances — drill-downs are navigation anchors (<Link>).
 *
 * Bands are INTERNAL OPERATIONAL INDICATORS, not regulatory
 * classifications (see the footnote copy rendered below).
 */
export function RiskConcentrationRadar({
  risk,
}: {
  risk: PortfolioRiskSnapshot;
}) {
  const { exposure, concentration, operational, maturityLadder, findings } =
    risk;

  const largestSharePct =
    exposure.largestExposure !== undefined && exposure.totalExposure > 0
      ? Math.round((exposure.largestExposure / exposure.totalExposure) * 100)
      : 0;
  const closingPressureCount = findings.filter(
    (f) => f.kind === 'closing-soon-unresolved',
  ).length;

  const cards: RadarCardData[] = [
    {
      key: 'largest-exposure',
      label: 'Largest exposure',
      value:
        exposure.largestExposure === undefined
          ? 'No amount'
          : formatCurrencyCompact(exposure.largestExposure),
      detail: exposure.largestDealName
        ? `${exposure.largestDealName} · ${largestSharePct}% of book`
        : 'Not set',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.concentration,
    },
    {
      key: 'single-name',
      label: 'Single-name concentration',
      value: `${concentration.singleNamePct}%`,
      band: concentration.singleNameBand,
      detail: concentration.singleNameClient ?? 'Not set',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.concentration,
    },
    {
      key: 'top5',
      label: 'Top-5 concentration',
      value: `${concentration.top5Pct}%`,
      band: concentration.top5Band,
      detail: 'Combined top-5 borrower share',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.concentrationWatch,
    },
    {
      key: 'product',
      label: 'Product concentration',
      value: `${concentration.topProductPct}%`,
      band: concentration.topProductBand,
      detail: concentration.topProductLabel ?? 'Not set',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.concentration,
    },
    {
      key: 'banker',
      label: 'Banker concentration',
      value: `${concentration.topBankerPct}%`,
      band: concentration.topBankerBand,
      detail: concentration.topBankerLabel ?? 'Unassigned',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.concentration,
    },
    {
      key: 'operational',
      label: 'Operational bottlenecks',
      value: `${operational.documentBottleneckDealCount} docs · ${operational.taskBottleneckDealCount} tasks`,
      band: operational.operationalBand,
      detail: `${operational.blockedDealCount} blocked · ${operational.atRiskDealCount} at risk`,
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.operational,
    },
    {
      key: 'data-quality',
      label: 'Data quality',
      value: `${operational.missingDataCount} deal(s)`,
      band: operational.dataQualityBand,
      detail: `${operational.staleDealCount} stale`,
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.dataQuality,
    },
    {
      key: 'closing-pressure',
      label: 'Closing pressure',
      value: `${closingPressureCount} at risk`,
      band: operational.closingPressureBand,
      detail: 'Closing ≤30d with unresolved items',
      dimension: PORTFOLIO_RISK_DIMENSION_LABELS.closing,
    },
  ];

  const topBorrowerBars: HorizontalBarDatum[] = concentration.byClient.map(
    (c) => ({
      label: c.label,
      value: c.totalExposure,
      secondaryLabel:
        c.dealCount === 1
          ? `${c.dealCount} deal · ${c.sharePct}%`
          : `${c.dealCount} deals · ${c.sharePct}%`,
      tone: c.isUnknown ? 'neutral' : 'info',
    }),
  );

  const maturityBars: VerticalBarDatum[] = maturityLadder.map((b) => ({
    label: b.label,
    value: b.dealCount,
    tone:
      b.label === 'Overdue close' && b.dealCount > 0
        ? 'blocked'
        : b.label === 'No close date'
          ? 'neutral'
          : 'info',
  }));

  return (
    <section
      style={styles.deck}
      aria-label="Risk and Concentration Radar"
      data-portfolio-cockpit-section="risk-radar"
    >
      <header style={styles.header}>
        <h3 style={styles.title}>Risk &amp; Concentration Radar</h3>
        <span style={styles.meta}>Operational indicators</span>
      </header>

      <div style={styles.cardGrid}>
        {cards.map((c) => (
          <RadarCard key={c.key} data={c} />
        ))}
      </div>

      <div style={styles.chartRow}>
        <HorizontalBarChart
          title="Top borrower exposures"
          subtitle="$ + share"
          data={topBorrowerBars}
          valueFormatter={formatCurrencyCompact}
        />
        <VerticalBarChart
          title="Closing / maturity ladder"
          subtitle="Deals by days to target close"
          data={maturityBars}
        />
      </div>

      {findings.length > 0 && (
        <RiskFindings findings={findings} />
      )}

      <p style={styles.footnote}>
        Policy bands are operational indicators, not regulatory
        classifications.
      </p>
      <p style={styles.footnoteSubtle}>
        Legal lending limit, covenant, yield, CECL/ALLL, criticized/classified
        asset, and participation analysis require additional source fields.
      </p>
    </section>
  );
}

interface RadarCardData {
  key: string;
  label: string;
  value: string;
  band?: PortfolioBand;
  detail: string;
  dimension: string;
}

function RadarCard({ data }: { data: RadarCardData }) {
  const tone = data.band ? bandTone(data.band) : 'info';
  return (
    <div
      style={{ ...styles.card, borderTopColor: severityPalette[tone].bar }}
      aria-label={`${data.label}: ${data.value}`}
      data-portfolio-radar-card={data.key}
    >
      <div style={styles.cardHead}>
        <span style={styles.cardLabel}>{data.label}</span>
        {data.band && (
          <span
            style={{
              ...styles.bandChip,
              background: severityPalette[tone].bg,
              color: severityPalette[tone].fg,
            }}
            data-portfolio-band={data.band}
          >
            {bandLabel(data.band)}
          </span>
        )}
      </div>
      <span style={styles.cardValue}>{data.value}</span>
      <span style={styles.cardDetail}>{data.detail}</span>
      <span style={styles.cardDimension}>{data.dimension}</span>
    </div>
  );
}

function RiskFindings({
  findings,
}: {
  findings: ReadonlyArray<PortfolioRiskFinding>;
}) {
  return (
    <section
      style={styles.findings}
      aria-label="Portfolio risk findings"
      data-portfolio-cockpit-section="risk-findings"
    >
      <header style={styles.sectionHeader}>
        <h4 style={styles.sectionTitle}>Risk findings</h4>
        <span style={styles.meta}>
          {findings.length} ranked finding{findings.length === 1 ? '' : 's'}
        </span>
      </header>
      <ul style={styles.findingList}>
        {findings.slice(0, 12).map((f) => {
          const tone = severityTone(f.severity);
          return (
            <li
              key={f.id}
              style={{
                ...styles.findingRow,
                borderLeftColor: severityPalette[tone].bar,
              }}
              data-portfolio-finding={f.kind}
              data-portfolio-finding-severity={f.severity}
            >
              <div style={styles.findingHead}>
                {f.dealId ? (
                  <Link
                    to={`/deals/${f.dealId}`}
                    style={styles.findingLink}
                    aria-label={`Open ${f.supportingNames[0] ?? 'deal'} in the deal workspace`}
                    data-portfolio-finding-deal={f.dealId}
                  >
                    {f.label}
                  </Link>
                ) : (
                  <span style={styles.findingLabel}>{f.label}</span>
                )}
                <span
                  style={{
                    ...styles.severityChip,
                    background: severityPalette[tone].bg,
                    color: severityPalette[tone].fg,
                  }}
                >
                  {f.severity}
                </span>
              </div>
              <div style={styles.findingMeta}>
                <span>{f.sourceMetric}</span>
                <span style={styles.findingSep} aria-hidden="true">
                  ·
                </span>
                <span style={styles.findingAction}>{f.nextAction}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bandTone(
  band: PortfolioBand,
): 'blocked' | 'atRisk' | 'info' | 'clear' {
  switch (band) {
    case 'high':
      return 'blocked';
    case 'elevated':
      return 'atRisk';
    case 'watch':
      return 'info';
    case 'low':
    default:
      return 'clear';
  }
}

function bandLabel(band: PortfolioBand): string {
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function severityTone(
  s: PortfolioFindingSeverity,
): 'blocked' | 'atRisk' | 'info' | 'neutral' {
  switch (s) {
    case 'high':
      return 'blocked';
    case 'elevated':
      return 'atRisk';
    case 'watch':
      return 'info';
    case 'info':
    default:
      return 'neutral';
  }
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
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.md,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px solid ${palette.divider}`,
    paddingBottom: spacing.sm,
  },
  title: {
    margin: 0,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  meta: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: spacing.sm,
  },
  card: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderTop: '3px solid',
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    minWidth: 0,
  },
  cardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardLabel: {
    fontSize: typography.size.xs,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    color: palette.textSubtle,
    fontWeight: typography.weight.bold,
  },
  bandChip: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  cardValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: palette.text,
    lineHeight: typography.lineHeight.tight,
  },
  cardDetail: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  cardDimension: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic' as const,
  },
  chartRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  findings: {
    background: palette.deckBg,
    border: `1px solid ${palette.panelBorder}`,
    borderRadius: radius.md,
    padding: `${spacing.sm} ${spacing.md}`,
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
  findingList: {
    listStyle: 'none' as const,
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: spacing.xs,
  },
  findingRow: {
    padding: `${spacing.xs} ${spacing.sm}`,
    borderLeft: '3px solid',
    borderRadius: radius.sm,
    background: palette.surface,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  findingHead: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  findingLink: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.primary,
    textDecoration: 'none' as const,
  },
  findingLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  severityChip: {
    padding: `1px ${spacing.sm}`,
    borderRadius: radius.pill,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  findingMeta: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: spacing.xs,
    alignItems: 'baseline',
    fontSize: typography.size.xs,
    color: palette.textMuted,
  },
  findingSep: {
    color: palette.textSubtle,
  },
  findingAction: {
    color: palette.textMuted,
  },
  footnote: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic' as const,
  },
  footnoteSubtle: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    lineHeight: typography.lineHeight.snug,
  },
};

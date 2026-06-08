import type { CSSProperties } from 'react';
import { Card } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewKpis } from '../shared/annualReview/deriveAnnualReviewCommandCenterModel';

interface Props {
  kpis: AnnualReviewKpis;
}

/** Phase 141A — annual review KPI ribbon. Honest counts only. */
export function AnnualReviewKpiRibbon({ kpis }: Props) {
  const tiles: { label: string; value: number; tone?: 'warn' | 'bad' }[] = [
    { label: 'In scope', value: kpis.totalLoansInScope },
    { label: 'Financials received', value: kpis.financialsReceived },
    { label: 'Missing', value: kpis.financialsMissing, tone: kpis.financialsMissing > 0 ? 'warn' : undefined },
    { label: 'Past due', value: kpis.pastDuePackages, tone: kpis.pastDuePackages > 0 ? 'bad' : undefined },
    { label: 'Received, not reviewed', value: kpis.receivedNotReviewed },
    { label: 'Ready to complete', value: kpis.reviewsReadyToComplete },
    { label: 'Blocked', value: kpis.reviewsBlocked, tone: kpis.reviewsBlocked > 0 ? 'warn' : undefined },
    { label: 'High-risk / watchlist', value: kpis.highRiskWatchlist, tone: kpis.highRiskWatchlist > 0 ? 'warn' : undefined },
    { label: 'Upcoming due', value: kpis.upcomingDueCount },
    { label: 'Escalations', value: kpis.escalationCount, tone: kpis.escalationCount > 0 ? 'bad' : undefined },
  ];
  return (
    <Card>
      <div style={gridStyle} aria-label="Annual review KPIs">
        {tiles.map((t) => (
          <div key={t.label} style={tileStyle}>
            <span style={valueStyle(t.tone)}>{t.value}</span>
            <span style={labelStyle}>{t.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

const gridStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: spacing.lg };
const tileStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 110 };
function valueStyle(tone?: 'warn' | 'bad'): CSSProperties {
  return {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: tone === 'bad' ? palette.blockedFg : tone === 'warn' ? palette.atRiskFg : palette.text,
  };
}
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};

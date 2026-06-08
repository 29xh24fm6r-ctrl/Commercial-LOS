import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioManagerReviewPackage } from '../shared/portfolioBoarding/fdicExaminerPackage';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140P — portfolio manager review package. Surfaces monitoring blockers
 * (servicing / next review / covenants / risk). Fail-closed readiness.
 */
export function PortfolioManagerReviewPackagePreview({ package: pkg }: Props) {
  const review = derivePortfolioManagerReviewPackage(pkg);
  return (
    <Card>
      <CardHeader
        title="Portfolio manager review package"
        subtitle={review.borrowerName ?? review.loanName ?? 'Boarded loan'}
      />
      <div style={readinessRowStyle}>
        <span style={review.portfolioMonitoringReady ? okStyle : notStyle}>
          {review.portfolioMonitoringReady ? 'Monitoring ready' : 'Monitoring not ready'}
        </span>
        <span style={metaStyle}>Risk rating: {review.riskRating ?? 'Not set'}</span>
      </div>
      <Block title="Monitoring blockers" items={review.blockers} />
      <Block title="Missing" items={review.missingDisclosure} />
      <Block title="Stale" items={review.staleDisclosure} />
      <Block title="Exceptions" items={review.exceptionDisclosure} />
      <CardFooter>
        <span>Monitoring readiness is fail-closed; missing or stale items block readiness.</span>
      </CardFooter>
    </Card>
  );
}

function Block({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div style={blockStyle}>
      <span style={blockTitleStyle}>{title}</span>
      {items.length === 0 ? (
        <span style={noneStyle}>None.</span>
      ) : (
        <ul style={ulStyle}>
          {items.map((it, i) => (
            <li key={i} style={itemStyle}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const readinessRowStyle: CSSProperties = { display: 'flex', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' };
const okStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.clearFg, fontWeight: typography.weight.semibold };
const notStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg, fontWeight: typography.weight.semibold };
const metaStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle };
const blockStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const blockTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

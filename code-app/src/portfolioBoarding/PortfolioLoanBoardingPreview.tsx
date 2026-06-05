import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingSnapshot } from '../shared/portfolioBoarding/portfolioLoanBoardingSnapshot';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import { PortfolioLoanBoardingReadOnlySections } from './PortfolioLoanBoardingReadOnlySections';
import { PortfolioLoanBoardingReadinessPanel } from './PortfolioLoanBoardingReadinessPanel';
import { PortfolioLoanBoardingDocumentInventory } from './PortfolioLoanBoardingDocumentInventory';
import { PortfolioLoanBoardingEvidencePanel } from './PortfolioLoanBoardingEvidencePanel';

interface PortfolioLoanBoardingPreviewProps {
  package: PortfolioLoanBoardingPackage;
}

export function PortfolioLoanBoardingPreview({ package: pkg }: PortfolioLoanBoardingPreviewProps) {
  const snapshot = derivePortfolioLoanBoardingSnapshot({ package: pkg });

  return (
    <div style={containerStyle}>
      <Card>
        <CardHeader
          title={snapshot.loanName ?? 'Loan name not set'}
          subtitle={snapshot.borrowerName ?? 'Borrower not set'}
          trailing={
            <span style={sourceBadgeStyle}>
              {pkg.source === 'manual_boarding' ? 'Manual boarding' : pkg.source === 'originated_closed_deal' ? 'Originated' : 'Source not set'}
            </span>
          }
        />
        <div style={metricsRowStyle}>
          <MetricCell label="Loan #" value={snapshot.loanNumber} />
          <MetricCell label="Balance" value={snapshot.currentBalance !== undefined ? `$${snapshot.currentBalance.toLocaleString()}` : undefined} />
          <MetricCell label="Maturity" value={snapshot.maturityDate} />
          <MetricCell label="Risk Rating" value={snapshot.riskRating} />
          <MetricCell label="Next Review" value={snapshot.nextReviewDate} />
        </div>
        <div style={metricsRowStyle}>
          <MetricCell label="Field completeness" value={snapshot.fieldCompletenessPct !== undefined ? `${snapshot.fieldCompletenessPct}%` : undefined} />
          <MetricCell label="Doc completeness" value={snapshot.documentCompletenessPct !== undefined ? `${snapshot.documentCompletenessPct}%` : undefined} />
        </div>
        <CardFooter>
          <span>Read-only preview. No edits from this view.</span>
        </CardFooter>
      </Card>

      <PortfolioLoanBoardingReadinessPanel snapshot={snapshot} />
      <PortfolioLoanBoardingReadOnlySections package={pkg} />
      <PortfolioLoanBoardingDocumentInventory package={pkg} />
      <PortfolioLoanBoardingEvidencePanel package={pkg} />
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={metricCellStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span style={metricValueStyle}>{value ?? 'Not set'}</span>
    </div>
  );
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };

const metricsRowStyle: CSSProperties = {
  display: 'flex', gap: spacing.lg, flexWrap: 'wrap',
};

const metricCellStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120,
};

const metricLabelStyle: CSSProperties = {
  fontSize: typography.size.xs, color: palette.textSubtle,
  textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};

const metricValueStyle: CSSProperties = {
  fontSize: typography.size.md, color: palette.text,
  fontWeight: typography.weight.semibold,
};

const sourceBadgeStyle: CSSProperties = {
  fontSize: typography.size.xs, color: palette.primaryFg,
  background: palette.primaryBg, padding: `2px ${spacing.sm}`,
  borderRadius: '4px', textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};

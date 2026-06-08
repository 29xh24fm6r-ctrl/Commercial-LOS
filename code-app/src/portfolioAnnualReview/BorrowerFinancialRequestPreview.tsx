import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import { deriveBorrowerFinancialRequestPackage } from '../shared/annualReview/deriveBorrowerFinancialRequestPackage';

interface Props {
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

/**
 * Phase 141A — borrower financial request PREVIEW (draft only). Sends nothing,
 * fabricates no contact, and discloses a missing-contact blocker.
 */
export function BorrowerFinancialRequestPreview({ loan, cycle, asOfDate }: Props) {
  const pkg = deriveBorrowerFinancialRequestPackage({ loan, cycle, asOfDate });
  return (
    <Card>
      <CardHeader
        title="Borrower financial request (preview)"
        subtitle={pkg.borrowerName ?? 'Borrower'}
      />
      <dl style={metaStyle}>
        <Row label="Relationship" value={pkg.relationshipName} />
        <Row label="Loan #" value={pkg.loanNumber} />
        <Row label="Owner" value={pkg.contactOwner} />
        <Row label="Borrower contact" value={pkg.contactConfigured ? pkg.borrowerContactName : 'Not configured'} />
      </dl>

      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Required documents</span>
        {pkg.requiredDocuments.length === 0 ? (
          <span style={noneStyle}>None applicable.</span>
        ) : (
          <ul style={ulStyle}>
            {pkg.requiredDocuments.map((d) => (
              <li key={d.documentType} style={itemStyle}>
                {d.label} — due {d.dueDate ?? 'Not set'} ({d.status})
              </li>
            ))}
          </ul>
        )}
      </div>

      {pkg.blockers.length > 0 && (
        <div style={sectionStyle}>
          <span style={blockerTitleStyle}>Blockers</span>
          <ul style={ulStyle}>
            {pkg.blockers.map((b, i) => (
              <li key={i} style={blockerItemStyle}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={instructionsStyle}>{pkg.uploadInstructionsPlaceholder}</p>
      <CardFooter>
        <span>{pkg.notes}</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value ?? 'Not set'}</dd>
    </div>
  );
}

const metaStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginTop: spacing.sm };
const sectionTitleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const blockerTitleStyle: CSSProperties = { ...sectionTitleStyle, color: palette.blockedFg };
const ulStyle: CSSProperties = { margin: 0, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const blockerItemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.blockedFg };
const instructionsStyle: CSSProperties = { margin: `${spacing.sm} 0 0`, fontSize: typography.size.sm, color: palette.atRiskFg, fontStyle: 'italic' };
const noneStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

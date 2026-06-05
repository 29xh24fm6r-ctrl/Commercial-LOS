import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

export function PortfolioLoanBoardingReadOnlySections({ package: pkg }: Props) {
  return (
    <div style={containerStyle}>
      <SectionCard title="Loan Identity">
        <Field label="Loan Number" value={pkg.identity.loanNumber} />
        <Field label="Borrower" value={pkg.identity.borrowerLegalName} />
        <Field label="Status" value={pkg.identity.loanStatus} />
        <Field label="Booking Date" value={pkg.identity.bookingDate} />
        <Field label="Closing Date" value={pkg.identity.closingDate} />
        <Field label="Maturity" value={pkg.identity.maturityDate} />
        <Field label="Portfolio Manager" value={pkg.identity.portfolioManager} />
      </SectionCard>

      <SectionCard title="Borrower Profile">
        <Field label="Entity Type" value={pkg.borrower.legalEntityType} />
        <Field label="NAICS / Industry" value={pkg.borrower.naicsIndustry} />
        <Field label="Address" value={pkg.borrower.address} />
        <Field label="State of Formation" value={pkg.borrower.stateOfFormation} />
      </SectionCard>

      <SectionCard title="Loan Terms">
        <Field label="Original Commitment" value={pkg.terms.originalCommitmentAmount !== undefined ? `$${pkg.terms.originalCommitmentAmount.toLocaleString()}` : undefined} />
        <Field label="Outstanding Principal" value={pkg.terms.currentOutstandingPrincipal !== undefined ? `$${pkg.terms.currentOutstandingPrincipal.toLocaleString()}` : undefined} />
        <Field label="Rate Type" value={pkg.terms.interestRateType} />
        <Field label="Payment Frequency" value={pkg.terms.paymentFrequency} />
      </SectionCard>

      <SectionCard title="Credit Approval">
        <Field label="Authority" value={pkg.creditApproval.approvalAuthority} />
        <Field label="Date" value={pkg.creditApproval.approvalDate} />
        <Field label="Purpose" value={pkg.creditApproval.approvedPurpose} />
        <Field label="Structure" value={pkg.creditApproval.approvedStructure} />
      </SectionCard>

      <SectionCard title={`Collateral (${pkg.collateral.items.length} items)`}>
        {pkg.collateral.items.length === 0 && <EmptyState text="No collateral records." />}
        {pkg.collateral.items.map((item, i) => (
          <div key={i} style={itemRowStyle}>
            <span style={itemLabelStyle}>{item.collateralType ?? 'Type not set'}</span>
            <span style={itemValueStyle}>{item.description ?? 'No description'}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title={`Guarantors (${pkg.guarantors.guarantors.length})`}>
        {pkg.guarantors.guarantors.length === 0 && <EmptyState text="No guarantor records." />}
        {pkg.guarantors.guarantors.map((g, i) => (
          <div key={i} style={itemRowStyle}>
            <span style={itemLabelStyle}>{g.guarantorName ?? 'Name not set'}</span>
            <span style={itemValueStyle}>{g.guaranteeScope ?? ''} {g.guaranteeAmount !== undefined ? `$${g.guaranteeAmount.toLocaleString()}` : ''}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title={`Covenants (${pkg.covenants.covenants.length})`}>
        {pkg.covenants.covenants.length === 0 && <EmptyState text="No covenant records." />}
        {pkg.covenants.covenants.map((c, i) => (
          <div key={i} style={itemRowStyle}>
            <span style={itemLabelStyle}>{c.covenantName ?? 'Name not set'}</span>
            <span style={itemValueStyle}>{c.currentStatus ?? 'Status not set'}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Servicing">
        <Field label="Risk Rating" value={pkg.servicing.currentRiskRating} />
        <Field label="Next Review" value={pkg.servicing.nextReviewDate} />
        <Field label="Annual Review" value={pkg.servicing.annualReviewStatus} />
        <Field label="Accrual Status" value={pkg.servicing.accrualStatus} />
        <Field label="Past Due Days" value={pkg.servicing.pastDueDays?.toString()} />
      </SectionCard>

      <SectionCard title={`Exceptions (${pkg.exceptions.length})`}>
        {pkg.exceptions.length === 0 && <EmptyState text="No exceptions." />}
        {pkg.exceptions.map((e, i) => (
          <div key={i} style={itemRowStyle}>
            <span style={itemLabelStyle}>{e.severity ?? 'Severity not set'}: {e.exceptionType ?? 'Type not set'}</span>
            <span style={itemValueStyle}>{e.status ?? 'Status not set'}</span>
          </div>
        ))}
      </SectionCard>

      <SectionCard title={`Review History (${pkg.reviewHistory.length})`}>
        {pkg.reviewHistory.length === 0 && <EmptyState text="No reviews on record." />}
        {pkg.reviewHistory.map((r, i) => (
          <div key={i} style={itemRowStyle}>
            <span style={itemLabelStyle}>{r.reviewType ?? 'Type not set'} — {r.reviewDate ?? 'Date not set'}</span>
            <span style={itemValueStyle}>{r.outcome ?? 'Outcome not set'}</span>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div style={sectionBodyStyle}>{children}</div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={fieldRowStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <span style={value ? fieldValueStyle : fieldMissingStyle}>{value ?? 'Not set'}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={emptyStyle}>{text}</p>;
}

const containerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg };
const sectionBodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const fieldRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: spacing.md };
const fieldLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted, fontWeight: typography.weight.semibold };
const fieldValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const fieldMissingStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const itemRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: spacing.md, padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const itemLabelStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const itemValueStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textMuted };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

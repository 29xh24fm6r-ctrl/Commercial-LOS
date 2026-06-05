import type { CSSProperties } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

export function PortfolioLoanBoardingDocumentInventory({ package: pkg }: Props) {
  const docs = pkg.documents.documents;
  const missing = docs.filter((d) => d.missing === true || d.missingFlag === true);
  const stale = docs.filter((d) => d.stale === true || d.staleFlag === true);

  return (
    <Card>
      <CardHeader
        title={`Document Inventory (${docs.length})`}
        subtitle={`${missing.length} missing · ${stale.length} stale`}
      />
      {docs.length === 0 && (
        <p style={emptyStyle}>No documents on record.</p>
      )}
      {docs.map((doc, i) => (
        <div key={i} style={docRowStyle}>
          <div style={docInfoStyle}>
            <span style={docTypeStyle}>{doc.documentType ?? 'Type not set'}</span>
            <span style={docNameStyle}>{doc.documentName ?? ''}</span>
          </div>
          <div style={docStatusStyle}>
            {(doc.missing || doc.missingFlag) && <span style={badgeMissingStyle}>Missing</span>}
            {(doc.stale || doc.staleFlag) && <span style={badgeStaleStyle}>Stale</span>}
            {(doc.exception || doc.exceptionFlag) && <span style={badgeExceptionStyle}>Exception</span>}
            {doc.status && <span style={statusStyle}>{doc.status}</span>}
          </div>
        </div>
      ))}
      <CardFooter>
        <span>Read-only inventory. No uploads from this view.</span>
      </CardFooter>
    </Card>
  );
}

const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };
const docRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, padding: `${spacing.xs} 0`, borderBottom: `1px solid ${palette.divider}` };
const docInfoStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };
const docTypeStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text, fontWeight: typography.weight.semibold };
const docNameStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };
const docStatusStyle: CSSProperties = { display: 'flex', gap: spacing.xs, flexShrink: 0, alignItems: 'center' };
const badgeMissingStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, background: palette.blockedBg, padding: `1px ${spacing.xs}`, borderRadius: '3px', fontWeight: typography.weight.semibold };
const badgeStaleStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.atRiskFg, background: palette.atRiskBg, padding: `1px ${spacing.xs}`, borderRadius: '3px', fontWeight: typography.weight.semibold };
const badgeExceptionStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.blockedFg, background: palette.blockedBg, padding: `1px ${spacing.xs}`, borderRadius: '3px', fontWeight: typography.weight.semibold };
const statusStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textMuted };

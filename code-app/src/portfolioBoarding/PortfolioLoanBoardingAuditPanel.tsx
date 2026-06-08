import type { CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140N — audit / change history view. Reads the package's audit record
 * honestly: a missing actor renders as "Unknown", never fabricated. Sensitive
 * values are expected to be redacted upstream (see portfolioLoanBoardingAuditTrail).
 */
export function PortfolioLoanBoardingAuditPanel({ package: pkg }: Props) {
  const audit = pkg.audit ?? {};
  const history = audit.changeHistory ?? [];
  return (
    <Card>
      <CardHeader title="Audit trail" subtitle="Change history · actor accountability" />
      <dl style={dlStyle}>
        <Row label="Created by" value={audit.createdBy} />
        <Row label="Updated by" value={audit.updatedBy} />
        <Row label="Boarding reviewer" value={audit.boardingReviewer} />
        <Row label="Approved by" value={audit.boardingApprovedBy} />
        <Row label="Boarding status" value={audit.boardingStatus} />
      </dl>
      {history.length === 0 ? (
        <p style={noneStyle}>No change history recorded.</p>
      ) : (
        <ul style={ulStyle}>
          {history.map((h, i) => (
            <li key={i} style={itemStyle}>{h}</li>
          ))}
        </ul>
      )}
      <CardFooter>
        <span>Actors are never fabricated; sensitive values are redacted in summaries.</span>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{label}</dt>
      <dd style={ddStyle}>{value ?? 'Unknown'}</dd>
    </div>
  );
}

const dlStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, margin: 0 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const dtStyle: CSSProperties = { minWidth: 160, fontSize: typography.size.xs, color: palette.textSubtle, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const ddStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };
const ulStyle: CSSProperties = { margin: `${spacing.sm} 0 0`, paddingLeft: spacing.lg, display: 'flex', flexDirection: 'column', gap: 2 };
const itemStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.text };
const noneStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

import type { CSSProperties } from 'react';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewCommandRow } from '../shared/annualReview/deriveAnnualReviewCommandCenterModel';

interface Props {
  row: AnnualReviewCommandRow;
}

/** Phase 141A — one annual-review loan row. Honest "Not set" for absent values. */
export function AnnualReviewLoanRow({ row }: Props) {
  return (
    <div role="row" style={rowStyle}>
      <span style={cellStyle}>{row.borrowerName ?? 'Not set'}</span>
      <span style={cellStyle}>{row.loanNumber ?? 'Not set'}</span>
      <span style={cellStyle}>{row.relationshipName ?? 'Not set'}</span>
      <span style={cellStyle}>{row.owner ?? 'Not set'}</span>
      <span style={cellStyle}>{row.reviewDueDate ?? 'Not set'}</span>
      <span style={cellStyle}>{row.requiredDocsCount}</span>
      <span style={cellStyle}>{row.receivedDocsCount}</span>
      <span style={missingCellStyle(row.missingDocsCount)}>{row.missingDocsCount}</span>
      <span style={missingCellStyle(row.pastDueDocsCount)}>{row.pastDueDocsCount}</span>
      <span style={cellStyle}>{row.reviewStatus}</span>
      <span style={soundnessStyle(row.soundnessStatus)}>{row.soundnessStatus}</span>
      <span style={cellStyle}>{row.riskRating ?? 'Not set'}</span>
      <span style={escalationStyle(row.escalationLevel)}>{row.escalationLevel}</span>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  padding: `${spacing.xs} 0`,
  borderTop: `1px solid ${palette.border}`,
};
const cellStyle: CSSProperties = { flex: '1 0 80px', fontSize: typography.size.sm, color: palette.text };
function missingCellStyle(n: number): CSSProperties {
  return { flex: '1 0 80px', fontSize: typography.size.sm, color: n > 0 ? palette.blockedFg : palette.textSubtle };
}
function soundnessStyle(status: string): CSSProperties {
  const color =
    status === 'sound' ? palette.clearFg : status === 'deteriorating' ? palette.blockedFg : palette.atRiskFg;
  return { flex: '1 0 110px', fontSize: typography.size.sm, color, fontWeight: typography.weight.semibold };
}
function escalationStyle(level: string): CSSProperties {
  return { flex: '1 0 90px', fontSize: typography.size.sm, color: level === 'none' ? palette.textSubtle : palette.blockedFg };
}

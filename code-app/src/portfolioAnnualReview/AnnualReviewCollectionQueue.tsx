import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewCommandRow } from '../shared/annualReview/deriveAnnualReviewCommandCenterModel';
import { AnnualReviewLoanRow } from './AnnualReviewLoanRow';

interface Props {
  rows: readonly AnnualReviewCommandRow[];
}

const COLUMNS = [
  'Borrower', 'Loan #', 'Relationship', 'Owner', 'Due', 'Req', 'Rcv', 'Missing',
  'Past due', 'Status', 'Soundness', 'Risk', 'Escalation',
] as const;

/** Phase 141A — annual review collection queue. Honest empty state. */
export function AnnualReviewCollectionQueue({ rows }: Props) {
  return (
    <Card>
      <CardHeader title="Annual review collection queue" subtitle={`${rows.length} loan(s) in scope`} />
      {rows.length === 0 ? (
        <p style={emptyStyle}>No loans in annual review scope.</p>
      ) : (
        <div role="table" aria-label="Annual review queue" style={tableStyle}>
          <div role="row" style={headerRowStyle}>
            {COLUMNS.map((c) => (
              <span role="columnheader" key={c} style={headerCellStyle}>{c}</span>
            ))}
          </div>
          {rows.map((row, i) => (
            <AnnualReviewLoanRow key={row.loanId ?? row.loanNumber ?? i} row={row} />
          ))}
        </div>
      )}
    </Card>
  );
}

const tableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'auto' };
const headerRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, paddingBottom: spacing.xs };
const headerCellStyle: CSSProperties = {
  flex: '1 0 80px',
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

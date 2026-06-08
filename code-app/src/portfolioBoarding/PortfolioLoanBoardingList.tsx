import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { BoardingListRow } from './portfolioBoardingListRows';

interface Props {
  rows: readonly BoardingListRow[];
  onSelect?: (row: BoardingListRow) => void;
}

/**
 * Phase 140M — boarded-loan list. Honest empty state; never invents records.
 */
export function PortfolioLoanBoardingList({ rows, onSelect }: Props) {
  return (
    <Card>
      <CardHeader title="Boarded loans" subtitle={`${rows.length} record(s)`} />
      {rows.length === 0 ? (
        <p style={emptyStyle}>No boarded loans found.</p>
      ) : (
        <div role="table" aria-label="Boarded loans" style={tableStyle}>
          <div role="row" style={headerRowStyle}>
            {COLUMNS.map((c) => (
              <span role="columnheader" key={c} style={headerCellStyle}>
                {c}
              </span>
            ))}
          </div>
          {rows.map((row, i) => (
            <div
              role="row"
              key={row.packageId ?? row.loanNumber ?? i}
              style={rowStyle}
              onClick={onSelect ? () => onSelect(row) : undefined}
            >
              <span style={cellStyle}>{row.loanName ?? 'Not set'}</span>
              <span style={cellStyle}>{row.borrowerName ?? 'Not set'}</span>
              <span style={cellStyle}>{row.loanNumber ?? 'Not set'}</span>
              <span style={cellStyle}>{formatMoney(row.currentBalance)}</span>
              <span style={cellStyle}>{row.maturityDate ?? 'Not set'}</span>
              <span style={cellStyle}>{row.riskRating ?? 'Not set'}</span>
              <span style={cellStyle}>{row.boardingStatus ?? 'Not set'}</span>
              <span style={cellStyle}>{readyMark(row.fdicReady)}</span>
              <span style={cellStyle}>{readyMark(row.boardReady)}</span>
              <span style={cellStyle}>{readyMark(row.portfolioMonitoringReady)}</span>
              <span style={cellStyle}>{row.exceptionCount}</span>
              <span style={cellStyle}>{row.staleDocumentCount}</span>
              <span style={cellStyle}>{row.source ?? 'Not set'}</span>
              <span style={cellStyle}>{row.updatedAt ?? 'Not set'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const COLUMNS = [
  'Loan name',
  'Borrower',
  'Loan #',
  'Balance',
  'Maturity',
  'Risk',
  'Boarding',
  'FDIC',
  'Board',
  'Portfolio',
  'Exceptions',
  'Stale docs',
  'Source',
  'Updated',
] as const;

function readyMark(ready: boolean): string {
  return ready ? 'Ready' : 'Not ready';
}

function formatMoney(amount: number | undefined): string {
  if (amount === undefined) return 'Not set';
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const tableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'auto' };
const headerRowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, paddingBottom: spacing.xs };
const rowStyle: CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  padding: `${spacing.xs} 0`,
  borderTop: `1px solid ${palette.border}`,
};
const headerCellStyle: CSSProperties = {
  flex: '1 0 90px',
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};
const cellStyle: CSSProperties = { flex: '1 0 90px', fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

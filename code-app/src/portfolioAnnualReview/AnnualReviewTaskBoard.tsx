import { useMemo, type CSSProperties } from 'react';
import { Card, CardHeader, CardFooter } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import { deriveAnnualReviewTasks } from '../shared/annualReview/annualReviewTaskEngine';

interface Props {
  loans?: readonly AnnualReviewLoanSnapshot[];
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

/**
 * Phase 141A — annual review task board. Pure derivation from the task engine.
 * No task writes (no persistence adapter in 141A); no task is faked complete.
 */
export function AnnualReviewTaskBoard({ loans = [], cycle, asOfDate }: Props) {
  const tasks = useMemo(
    () => deriveAnnualReviewTasks({ loans, cycle, asOfDate }),
    [loans, cycle, asOfDate],
  );

  return (
    <Card>
      <CardHeader title="Annual review tasks" subtitle={`${tasks.length} task(s)`} />
      {tasks.length === 0 ? (
        <p style={emptyStyle}>No annual review tasks.</p>
      ) : (
        <div role="table" aria-label="Annual review tasks" style={tableStyle}>
          {tasks.map((t) => (
            <div role="row" key={t.taskId} style={rowStyle}>
              <span style={severityStyle(t.severity)}>{t.severity}</span>
              <span style={typeStyle}>{t.taskType}</span>
              <span style={borrowerStyle}>{t.borrowerName ?? 'Loan'}</span>
              <span style={ownerStyle}>{t.owner ?? 'Unassigned'}</span>
              <span style={escalationStyle}>{t.escalationLevel}</span>
              <span style={statusStyle}>{t.status}</span>
            </div>
          ))}
        </div>
      )}
      <CardFooter>
        <span>Read-only derivation — tasks are not persisted in this phase.</span>
      </CardFooter>
    </Card>
  );
}

const tableStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, overflowX: 'auto' };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
function severityStyle(severity: string): CSSProperties {
  return {
    minWidth: 70,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
    color: severity === 'high' ? palette.blockedFg : severity === 'medium' ? palette.atRiskFg : palette.textSubtle,
  };
}
const typeStyle: CSSProperties = { flex: '1 0 160px', fontSize: typography.size.sm, color: palette.text };
const borrowerStyle: CSSProperties = { flex: '1 0 140px', fontSize: typography.size.sm, color: palette.text };
const ownerStyle: CSSProperties = { minWidth: 120, fontSize: typography.size.sm, color: palette.textSubtle };
const escalationStyle: CSSProperties = { minWidth: 110, fontSize: typography.size.sm, color: palette.textSubtle };
const statusStyle: CSSProperties = { minWidth: 80, fontSize: typography.size.sm, color: palette.textSubtle };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

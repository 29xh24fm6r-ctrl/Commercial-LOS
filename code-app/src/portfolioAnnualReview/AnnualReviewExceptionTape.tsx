import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { AnnualReviewEscalation } from '../shared/annualReview/annualReviewTypes';

interface Props {
  escalations: readonly AnnualReviewEscalation[];
  limit?: number;
}

/** Phase 141A — annual review escalation tape. Top escalations, honest empty. */
export function AnnualReviewExceptionTape({ escalations, limit = 10 }: Props) {
  const shown = escalations.slice(0, limit);
  return (
    <Card>
      <CardHeader title="Escalations" subtitle={`${escalations.length} open`} />
      {escalations.length === 0 ? (
        <p style={emptyStyle}>No escalations.</p>
      ) : (
        <div style={listStyle}>
          {shown.map((e, i) => (
            <div key={i} style={rowStyle}>
              <span style={levelStyle(e.severity)}>{e.level}</span>
              <span style={borrowerStyle}>{e.borrowerName ?? 'Loan'}</span>
              <span style={reasonStyle}>{e.reason}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
function levelStyle(severity: string): CSSProperties {
  return {
    minWidth: 110,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
    fontWeight: typography.weight.semibold,
    color: severity === 'high' ? palette.blockedFg : palette.atRiskFg,
  };
}
const borrowerStyle: CSSProperties = { minWidth: 140, fontSize: typography.size.sm, color: palette.text };
const reasonStyle: CSSProperties = { flex: '1 0 200px', fontSize: typography.size.sm, color: palette.text };
const emptyStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

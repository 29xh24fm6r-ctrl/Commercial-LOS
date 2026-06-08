import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';

interface Props {
  package: PortfolioLoanBoardingPackage;
}

/**
 * Phase 140N — examiner notes view. Read-only over the package's examiner
 * notes. No fake examiner request data is invented.
 */
export function PortfolioLoanBoardingExaminerNotes({ package: pkg }: Props) {
  const notes = pkg.examinerNotes ?? [];
  return (
    <Card>
      <CardHeader title="Examiner notes" subtitle={`${notes.length} note(s)`} />
      {notes.length === 0 ? (
        <p style={noneStyle}>No examiner notes recorded.</p>
      ) : (
        <div style={listStyle}>
          {notes.map((n) => (
            <div key={n.noteId} style={rowStyle}>
              <span style={statusStyle}>{n.responseStatus ?? 'pending'}</span>
              <span style={noteStyle}>{n.note ?? 'Not set'}</span>
              <span style={ownerStyle}>{n.owner ?? 'Owner not set'}</span>
              <span style={metaStyle}>{(n.relatedEvidenceIds ?? []).length} evidence link(s)</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle: CSSProperties = { display: 'flex', gap: spacing.sm, alignItems: 'center', borderTop: `1px solid ${palette.border}`, padding: `${spacing.xs} 0` };
const statusStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle, minWidth: 80, textTransform: 'uppercase', letterSpacing: typography.letterSpacing.label, fontWeight: typography.weight.semibold };
const noteStyle: CSSProperties = { flex: '1 0 200px', fontSize: typography.size.sm, color: palette.text };
const ownerStyle: CSSProperties = { fontSize: typography.size.sm, color: palette.textSubtle, minWidth: 120 };
const metaStyle: CSSProperties = { fontSize: typography.size.xs, color: palette.textSubtle };
const noneStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle, fontStyle: 'italic' };

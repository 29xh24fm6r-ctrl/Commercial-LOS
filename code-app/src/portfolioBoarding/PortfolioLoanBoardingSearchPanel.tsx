import type { CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography, radius } from '../shared/theme';
import type { BoardingListFilter, ReadinessFilter } from './portfolioBoardingListRows';

interface Props {
  filter: BoardingListFilter;
  onChange: (next: BoardingListFilter) => void;
}

/**
 * Phase 140M — search/filter controls for the boarding list. Controlled and
 * pure: it only emits filter changes; the parent applies them via the pure
 * `filterBoardingListRows`.
 */
export function PortfolioLoanBoardingSearchPanel({ filter, onChange }: Props) {
  return (
    <Card>
      <CardHeader title="Search boarded loans" subtitle="Filter authorized records" />
      <div style={gridStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Borrower name</span>
          <input
            style={inputStyle}
            value={filter.borrowerQuery ?? ''}
            onChange={(e) => onChange({ ...filter, borrowerQuery: e.target.value })}
            aria-label="Borrower name filter"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Loan number</span>
          <input
            style={inputStyle}
            value={filter.loanNumberQuery ?? ''}
            onChange={(e) => onChange({ ...filter, loanNumberQuery: e.target.value })}
            aria-label="Loan number filter"
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Readiness</span>
          <select
            style={inputStyle}
            value={filter.readiness ?? 'any'}
            onChange={(e) =>
              onChange({ ...filter, readiness: e.target.value as ReadinessFilter })
            }
            aria-label="Readiness filter"
          >
            <option value="any">Any</option>
            <option value="fdic">FDIC ready</option>
            <option value="board">Board ready</option>
            <option value="portfolio">Portfolio monitoring ready</option>
          </select>
        </label>
        <label style={checkboxFieldStyle}>
          <input
            type="checkbox"
            checked={filter.exceptionsOnly ?? false}
            onChange={(e) => onChange({ ...filter, exceptionsOnly: e.target.checked })}
            aria-label="Exceptions only filter"
          />
          <span style={labelStyle}>Exceptions only</span>
        </label>
        <label style={checkboxFieldStyle}>
          <input
            type="checkbox"
            checked={filter.staleDocumentsOnly ?? false}
            onChange={(e) => onChange({ ...filter, staleDocumentsOnly: e.target.checked })}
            aria-label="Stale documents only filter"
          />
          <span style={labelStyle}>Stale documents only</span>
        </label>
      </div>
    </Card>
  );
}

const gridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: spacing.md,
  alignItems: 'flex-end',
};
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 };
const checkboxFieldStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.xs };
const labelStyle: CSSProperties = {
  fontSize: typography.size.xs,
  color: palette.textSubtle,
  textTransform: 'uppercase',
  letterSpacing: typography.letterSpacing.label,
  fontWeight: typography.weight.semibold,
};
const inputStyle: CSSProperties = {
  fontSize: typography.size.sm,
  padding: `4px ${spacing.sm}`,
  borderRadius: radius.sm,
  border: `1px solid ${palette.border}`,
  color: palette.text,
  background: palette.surface,
};

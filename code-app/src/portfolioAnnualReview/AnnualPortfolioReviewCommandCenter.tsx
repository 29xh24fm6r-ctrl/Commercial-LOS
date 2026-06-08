import { useMemo, useState, type CSSProperties } from 'react';
import { Card, CardHeader } from '../shared/Card';
import { palette, spacing, typography, radius } from '../shared/theme';
import type { AnnualReviewLoanSnapshot, AnnualReviewCycle } from '../shared/annualReview/annualReviewTypes';
import {
  deriveAnnualReviewCommandCenterModel,
  type AnnualReviewCommandRow,
} from '../shared/annualReview/deriveAnnualReviewCommandCenterModel';
import { AnnualReviewKpiRibbon } from './AnnualReviewKpiRibbon';
import { AnnualReviewCollectionQueue } from './AnnualReviewCollectionQueue';
import { AnnualReviewExceptionTape } from './AnnualReviewExceptionTape';

interface Props {
  /** Authorized, already-loaded loans. Defaults to none. */
  loans?: readonly AnnualReviewLoanSnapshot[];
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

interface RowFilter {
  ownerQuery: string;
  riskRating: string;
  status: string;
  watchlistOnly: boolean;
  escalationsOnly: boolean;
}

/**
 * Phase 141A — annual portfolio review command center. Pure derivation from
 * authorized loans; no data loading, no write affordance, honest empty states.
 */
export function AnnualPortfolioReviewCommandCenter({ loans = [], cycle, asOfDate }: Props) {
  const [filter, setFilter] = useState<RowFilter>({
    ownerQuery: '',
    riskRating: '',
    status: 'any',
    watchlistOnly: false,
    escalationsOnly: false,
  });

  const model = useMemo(
    () => deriveAnnualReviewCommandCenterModel({ loans, cycle, asOfDate }),
    [loans, cycle, asOfDate],
  );

  const visibleRows = useMemo(() => filterRows(model.rows, filter), [model.rows, filter]);

  return (
    <section style={pageStyle} aria-label="Annual Portfolio Review">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Annual Portfolio Review</h1>
        <p style={subtitleStyle}>
          Collect annual borrower financials, track review readiness, and surface every
          missing, past-due, stale, or escalated item — review year {cycle.reviewYear}.
        </p>
      </header>

      <AnnualReviewKpiRibbon kpis={model.kpis} />

      <Card>
        <CardHeader title="Filter" subtitle="Owner · risk · status · watchlist · escalation" />
        <div style={filterGridStyle}>
          <Field label="Owner">
            <input
              style={inputStyle}
              aria-label="Owner filter"
              value={filter.ownerQuery}
              onChange={(e) => setFilter({ ...filter, ownerQuery: e.target.value })}
            />
          </Field>
          <Field label="Risk rating">
            <input
              style={inputStyle}
              aria-label="Risk rating filter"
              value={filter.riskRating}
              onChange={(e) => setFilter({ ...filter, riskRating: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              style={inputStyle}
              aria-label="Status filter"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="any">Any</option>
              <option value="not_started">Not started</option>
              <option value="financials_requested">Financials requested</option>
              <option value="in_review">In review</option>
              <option value="ready_to_complete">Ready to complete</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>
          <label style={checkboxStyle}>
            <input
              type="checkbox"
              aria-label="Watchlist only filter"
              checked={filter.watchlistOnly}
              onChange={(e) => setFilter({ ...filter, watchlistOnly: e.target.checked })}
            />
            <span style={labelStyle}>Watchlist only</span>
          </label>
          <label style={checkboxStyle}>
            <input
              type="checkbox"
              aria-label="Escalations only filter"
              checked={filter.escalationsOnly}
              onChange={(e) => setFilter({ ...filter, escalationsOnly: e.target.checked })}
            />
            <span style={labelStyle}>Escalations only</span>
          </label>
        </div>
      </Card>

      <AnnualReviewExceptionTape escalations={model.escalations} />
      <AnnualReviewCollectionQueue rows={visibleRows} />
    </section>
  );
}

function filterRows(rows: readonly AnnualReviewCommandRow[], filter: RowFilter): readonly AnnualReviewCommandRow[] {
  const owner = filter.ownerQuery.trim().toLowerCase();
  const risk = filter.riskRating.trim().toLowerCase();
  return rows.filter((row) => {
    if (owner && !(row.owner ?? '').toLowerCase().includes(owner)) return false;
    if (risk && (row.riskRating ?? '').toLowerCase() !== risk) return false;
    if (filter.status !== 'any' && row.reviewStatus !== filter.status) return false;
    if (filter.watchlistOnly && !row.watchlist) return false;
    if (filter.escalationsOnly && row.escalationLevel === 'none') return false;
    return true;
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg, padding: spacing.lg };
const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const subtitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
const filterGridStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-end' };
const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 };
const checkboxStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: spacing.xs };
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

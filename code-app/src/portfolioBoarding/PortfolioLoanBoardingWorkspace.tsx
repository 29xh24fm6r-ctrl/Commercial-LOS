import { useMemo, useState, type CSSProperties } from 'react';
import { spacing, typography, palette } from '../shared/theme';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import type { PortfolioBoardingLivePersistenceAdapter } from './portfolioLoanBoardingLivePersistence';
import type { BoardingAccessResult } from './portfolioBoardingAccess';
import {
  deriveBoardingListRows,
  filterBoardingListRows,
  type BoardingListFilter,
  type BoardingListRow,
} from './portfolioBoardingListRows';
import { PortfolioLoanBoardingStatusBanner } from './PortfolioLoanBoardingStatusBanner';
import { PortfolioLoanBoardingSearchPanel } from './PortfolioLoanBoardingSearchPanel';
import { PortfolioLoanBoardingList } from './PortfolioLoanBoardingList';
import { PortfolioLoanBoardingDetail } from './PortfolioLoanBoardingDetail';
import { PortfolioLoanBoardingCreateFlow } from './PortfolioLoanBoardingCreateFlow';

interface Props {
  access: BoardingAccessResult;
  adapter: PortfolioBoardingLivePersistenceAdapter;
  /** Authorized, already-loaded packages. Defaults to none. */
  packages?: readonly PortfolioLoanBoardingPackage[];
}

/**
 * Phase 140M — top-level operator workspace for manual closed-loan boarding.
 * Permission-before-render: it shows nothing actionable unless `access` grants
 * it. No fake records; honest empty / read-only / not-configured states.
 */
export function PortfolioLoanBoardingWorkspace({ access, adapter, packages = [] }: Props) {
  const [filter, setFilter] = useState<BoardingListFilter>({});
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<PortfolioLoanBoardingPackage | undefined>(undefined);

  const rows = useMemo(() => deriveBoardingListRows(packages), [packages]);
  const visibleRows = useMemo(() => filterBoardingListRows(rows, filter), [rows, filter]);

  return (
    <section style={pageStyle} aria-label="Portfolio Loan Boarding">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Portfolio Loan Boarding</h1>
        <p style={subtitleStyle}>
          Manually board closed / legacy loans into the LOS as governed portfolio
          system-of-record records.
        </p>
      </header>

      <PortfolioLoanBoardingStatusBanner mode={access.mode} message={access.bannerMessage} />

      {!access.canViewSurface ? null : (
        <>
          {access.canCreate && (
            <div style={actionRowStyle}>
              <button
                type="button"
                onClick={() => setCreating((v) => !v)}
                style={createButtonStyle}
              >
                {creating ? 'Close create form' : 'Create boarded loan'}
              </button>
            </div>
          )}

          {creating && access.canCreate && (
            <PortfolioLoanBoardingCreateFlow adapter={adapter} />
          )}

          <PortfolioLoanBoardingSearchPanel filter={filter} onChange={setFilter} />

          <PortfolioLoanBoardingList
            rows={visibleRows}
            onSelect={(row: BoardingListRow) => {
              const idx = rows.indexOf(row);
              setSelected(idx >= 0 ? packages[idx] : undefined);
            }}
          />

          {selected && <PortfolioLoanBoardingDetail package={selected} />}
        </>
      )}
    </section>
  );
}

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.lg, padding: spacing.lg };
const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const titleStyle: CSSProperties = { margin: 0, fontSize: typography.size.xl, fontWeight: typography.weight.semibold, color: palette.text };
const subtitleStyle: CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.textSubtle };
const actionRowStyle: CSSProperties = { display: 'flex', gap: spacing.md };
const createButtonStyle: CSSProperties = {
  fontSize: typography.size.sm,
  fontWeight: typography.weight.semibold,
  color: palette.clearFg,
  background: palette.clearBg,
  border: `1px solid ${palette.border}`,
  borderRadius: 6,
  padding: `${spacing.xs} ${spacing.md}`,
  cursor: 'pointer',
};

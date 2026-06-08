/**
 * Phase 140O — Boarded-loan command-center row helpers (re-export seam).
 *
 * The row projection + snapshot-merge helpers already live in
 * `portfolioBoardingCommandCenterAdapter` (Phase 140B-H). This module re-exports
 * them as the stable command-center integration seam and adds the flag-gated
 * merge wrappers so a command center never includes boarded loans unless the
 * command-center feature flag is on AND authorized rows were supplied.
 *
 * Discipline: pure. No IO. Empty/flag-off → no rows merged (no fake rows).
 */

import {
  type BoardedLoanCommandRow,
  mergeBoardedLoansIntoPortfolioSnapshotInput,
  mergeBoardedLoansIntoManagerSnapshotInput,
  mergeBoardedLoansIntoExecutiveSnapshotInput,
} from './portfolioBoardingCommandCenterAdapter';

export type { BoardedLoanCommandRow } from './portfolioBoardingCommandCenterAdapter';
export {
  derivePortfolioBoardedLoanCommandRows,
  mergeBoardedLoansIntoPortfolioSnapshotInput,
  mergeBoardedLoansIntoManagerSnapshotInput,
  mergeBoardedLoansIntoExecutiveSnapshotInput,
} from './portfolioBoardingCommandCenterAdapter';

interface FlagGate {
  readonly PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: boolean;
}

function gatedRows(
  flags: FlagGate,
  rows: readonly BoardedLoanCommandRow[],
): readonly BoardedLoanCommandRow[] {
  return flags.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED === true ? rows : [];
}

export function mergePortfolioBoardedLoansGated<
  T extends { boardedLoans?: readonly BoardedLoanCommandRow[] },
>(flags: FlagGate, existing: T, rows: readonly BoardedLoanCommandRow[]): T {
  return mergeBoardedLoansIntoPortfolioSnapshotInput(existing, gatedRows(flags, rows));
}

export function mergeManagerBoardedLoansGated<
  T extends { boardedLoans?: readonly BoardedLoanCommandRow[] },
>(flags: FlagGate, existing: T, rows: readonly BoardedLoanCommandRow[]): T {
  return mergeBoardedLoansIntoManagerSnapshotInput(existing, gatedRows(flags, rows));
}

export function mergeExecutiveBoardedLoansGated<
  T extends { boardedLoans?: readonly BoardedLoanCommandRow[] },
>(flags: FlagGate, existing: T, rows: readonly BoardedLoanCommandRow[]): T {
  return mergeBoardedLoansIntoExecutiveSnapshotInput(existing, gatedRows(flags, rows));
}

/**
 * Phase 140O — Load boarded-loan command-center rows for a workspace.
 *
 * A PURE, flag-gated selector that turns authorized, already-loaded boarded
 * loan packages into command-center rows. It performs NO data loading and NO
 * scope widening: the caller supplies only packages the user is already
 * authorized to see, and this selector simply gates them behind the
 * command-center feature flag.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no Dataverse. Deterministic.
 *   - Disabled by default: when the command-center flag is off, or no packages
 *     are supplied, it returns an EMPTY array (no extra rows, no fake rows).
 *   - Never widens scope: it only projects what the caller already authorized.
 */

import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import {
  derivePortfolioBoardedLoanCommandRows,
  type BoardedLoanCommandRow,
} from './portfolioBoardingCommandCenterAdapter';

export type CommandCenterScope = 'portfolio' | 'manager' | 'executive';

export interface LoadBoardedLoanRowsInput {
  /** Only the command-center flag is consulted. */
  flags: { readonly PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED: boolean };
  /** Authorized, already-loaded packages. The caller owns authorization. */
  authorizedPackages?: readonly PortfolioLoanBoardingPackage[];
  /** Informational: which command center is requesting (no scope widening). */
  scope?: CommandCenterScope;
}

/**
 * Returns the boarded-loan command rows the caller is authorized to see, or an
 * empty array when the feature flag is off or nothing was supplied.
 */
export function loadPortfolioBoardedLoanCommandRows(
  input: LoadBoardedLoanRowsInput,
): readonly BoardedLoanCommandRow[] {
  if (input.flags.PORTFOLIO_BOARDING_COMMAND_CENTER_ENABLED !== true) return [];
  const packages = input.authorizedPackages ?? [];
  if (packages.length === 0) return [];
  return derivePortfolioBoardedLoanCommandRows(packages);
}

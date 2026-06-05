/**
 * Phase 140B-H — Portfolio loan boarding write adapter.
 * Disabled by default. No live writes.
 */

export interface WriteResult {
  ok: boolean;
  reason?: string;
  operation?: string;
  recordId?: string;
}

export interface PortfolioLoanBoardingWriteAdapter {
  readonly enabled: boolean;
  save(data: unknown): WriteResult;
}

export interface DisabledPortfolioLoanBoardingWriteAdapter extends PortfolioLoanBoardingWriteAdapter {
  readonly enabled: false;
}

export function createDisabledPortfolioLoanBoardingWriteAdapter(): DisabledPortfolioLoanBoardingWriteAdapter {
  return {
    enabled: false,
    save() {
      return {
        ok: false,
        reason: 'portfolio_boarding_write_adapter_not_configured',
      };
    },
  };
}

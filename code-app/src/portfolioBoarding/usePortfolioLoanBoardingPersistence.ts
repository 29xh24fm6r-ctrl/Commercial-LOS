/**
 * Phase 140M — Portfolio Loan Boarding persistence hook.
 *
 * A thin React hook over the injected Phase 140L persistence adapter. It holds
 * the save/create/search request state and calls ONLY the adapter — never
 * `fetch`, never a Dataverse service. When the adapter is disabled, every
 * action fails closed honestly.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO of its own. All persistence goes through the injected adapter.
 *   - Feature-flag/adapter gated: a disabled adapter yields disabled actions
 *     and an honest failure state.
 *   - Never invents values; it passes the caller's package straight through.
 */

import { useCallback, useState } from 'react';
import type { PortfolioLoanBoardingPackage } from '../shared/portfolioBoarding/portfolioLoanBoardingTypes';
import type {
  PortfolioBoardingLivePersistenceAdapter,
  BoardingLiveResult,
} from './portfolioLoanBoardingLivePersistence';

export type PersistenceRequestState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; result: BoardingLiveResult }
  | { kind: 'failure'; errorCode: string | undefined; message: string | undefined };

export interface UsePortfolioLoanBoardingPersistence {
  enabled: boolean;
  state: PersistenceRequestState;
  create(pkg: PortfolioLoanBoardingPackage): Promise<BoardingLiveResult>;
  update(recordId: string, pkg: PortfolioLoanBoardingPackage): Promise<BoardingLiveResult>;
  search(query?: string): Promise<BoardingLiveResult>;
  reset(): void;
}

const DISABLED_RESULT: BoardingLiveResult = {
  ok: false,
  operation: 'disabled',
  errorCode: 'adapter_not_configured',
  message: 'Portfolio boarding live persistence is not enabled.',
};

export function usePortfolioLoanBoardingPersistence(
  adapter: PortfolioBoardingLivePersistenceAdapter,
): UsePortfolioLoanBoardingPersistence {
  const [state, setState] = useState<PersistenceRequestState>({ kind: 'idle' });

  const run = useCallback(
    async (op: () => Promise<BoardingLiveResult>): Promise<BoardingLiveResult> => {
      if (!adapter.enabled) {
        setState({
          kind: 'failure',
          errorCode: DISABLED_RESULT.errorCode,
          message: DISABLED_RESULT.message,
        });
        return DISABLED_RESULT;
      }
      setState({ kind: 'pending' });
      const result = await op();
      if (result.ok) setState({ kind: 'success', result });
      else
        setState({
          kind: 'failure',
          errorCode: result.errorCode,
          message: result.message,
        });
      return result;
    },
    [adapter],
  );

  const create = useCallback(
    (pkg: PortfolioLoanBoardingPackage) => run(() => adapter.createBoardedLoan(pkg)),
    [adapter, run],
  );
  const update = useCallback(
    (recordId: string, pkg: PortfolioLoanBoardingPackage) =>
      run(() => adapter.updateBoardedLoan(recordId, pkg)),
    [adapter, run],
  );
  const search = useCallback(
    (query?: string) => run(() => adapter.searchBoardedLoans(query)),
    [adapter, run],
  );
  const reset = useCallback(() => setState({ kind: 'idle' }), []);

  return { enabled: adapter.enabled, state, create, update, search, reset };
}

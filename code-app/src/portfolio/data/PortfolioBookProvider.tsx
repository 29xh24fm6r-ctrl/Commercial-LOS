import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AsyncResult } from '../../manager/ManagerDataProvider';
import {
  loadBoardedLoans,
  type BoardedLoanRow,
} from '../../portfolioBoarding/boardedLoansList';

export interface PortfolioBookData {
  readonly loans: AsyncResult<readonly BoardedLoanRow[]>;
}

export type PortfolioBookLoader = () => Promise<readonly BoardedLoanRow[]>;

const PortfolioBookContext = createContext<PortfolioBookData | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- Provider hook follows the existing data-provider pattern.
export function usePortfolioBook(): PortfolioBookData {
  const ctx = useContext(PortfolioBookContext);
  if (!ctx) {
    throw new Error('usePortfolioBook must be used inside <PortfolioBookProvider>.');
  }
  return ctx;
}

export function PortfolioBookProvider({
  children,
  loadLoans = loadBoardedLoans,
}: {
  readonly children: ReactNode;
  readonly loadLoans?: PortfolioBookLoader;
}) {
  const [loans, setLoans] = useState<AsyncResult<readonly BoardedLoanRow[]>>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    loadLoans()
      .then((data) => {
        if (!cancelled) setLoans({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setLoans({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [loadLoans]);

  return (
    <PortfolioBookContext.Provider value={{ loans }}>
      {children}
    </PortfolioBookContext.Provider>
  );
}

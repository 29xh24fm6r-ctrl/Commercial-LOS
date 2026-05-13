import { createContext, useContext, useEffect, useState } from 'react';
import type { DealDetail } from './dealQueries';
import { loadDealTasks, type DealTasksResult } from './dealTaskQueries';
import { loadDealDocuments, type DealDocumentsResult } from './dealDocumentQueries';
import { loadDealCreditMemo, type CreditMemoData } from './creditMemoQueries';
import { loadDealActivity, type TimelineEvent } from './activityQueries';

/**
 * AsyncResult is the per-resource shape for child queries that load
 * after the parent (deal) is already authorized. Each child can
 * succeed or fail independently; the parent decision (deal access)
 * is not in play here.
 */
export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

export interface DealData {
  /** The authorized deal record. Banker access was confirmed by
   *  loadDealForBanker before DealDataProvider mounted. */
  deal: DealDetail;
  tasks: AsyncResult<DealTasksResult>;
  documents: AsyncResult<DealDocumentsResult>;
  creditMemo: AsyncResult<CreditMemoData>;
  activity: AsyncResult<TimelineEvent[]>;
}

const DealDataContext = createContext<DealData | null>(null);

export function useDealData(): DealData {
  const ctx = useContext(DealDataContext);
  if (!ctx) {
    throw new Error('useDealData must be used inside <DealDataProvider>.');
  }
  return ctx;
}

interface DealDataProviderProps {
  /** Authorized deal — caller must have already passed loadDealForBanker.
   *  DealDataProvider does not re-check access. */
  deal: DealDetail;
  children: React.ReactNode;
}

/**
 * Deal-scoped data provider. Fires child queries (tasks, documents) in
 * parallel on mount. Both queries inherit authorization from the parent:
 * the deal id used as the scope filter has already been confirmed
 * accessible to the current banker by BankerDealWorkspace.
 *
 * Child consumers (DealBlockers, DealTasks, DealDocuments, ...) read
 * through useDealData(). One query per deal load — no duplicate fetches.
 */
export function DealDataProvider({ deal, children }: DealDataProviderProps) {
  const [tasks, setTasks] = useState<AsyncResult<DealTasksResult>>({ kind: 'loading' });
  const [documents, setDocuments] = useState<AsyncResult<DealDocumentsResult>>({
    kind: 'loading',
  });
  const [creditMemo, setCreditMemo] = useState<AsyncResult<CreditMemoData>>({
    kind: 'loading',
  });
  const [activity, setActivity] = useState<AsyncResult<TimelineEvent[]>>({
    kind: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    setTasks({ kind: 'loading' });
    setDocuments({ kind: 'loading' });
    setCreditMemo({ kind: 'loading' });
    setActivity({ kind: 'loading' });

    loadDealTasks(deal.id)
      .then((data) => {
        if (!cancelled) setTasks({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setTasks({ kind: 'failed', message });
      });

    loadDealDocuments(deal.id)
      .then((data) => {
        if (!cancelled) setDocuments({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setDocuments({ kind: 'failed', message });
      });

    loadDealCreditMemo(deal.id)
      .then((data) => {
        if (!cancelled) setCreditMemo({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setCreditMemo({ kind: 'failed', message });
      });

    loadDealActivity(deal.id)
      .then((data) => {
        if (!cancelled) setActivity({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setActivity({ kind: 'failed', message });
      });

    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  return (
    <DealDataContext.Provider value={{ deal, tasks, documents, creditMemo, activity }}>
      {children}
    </DealDataContext.Provider>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DealDetail } from './dealQueries';
import { loadDealTasks, type DealTasksResult } from './dealTaskQueries';
import { loadDealDocuments, type DealDocumentsResult } from './dealDocumentQueries';
import { loadDealCreditMemo, type CreditMemoData } from './creditMemoQueries';
import { loadDealActivity, type TimelineEvent } from './activityQueries';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

/** Keys callers pass to refresh() to reload one resource (or a curated
 *  bundle) without a global storm.
 *
 *    'after-task-complete'  Phase-21 write: reload tasks + activity.
 *                            DealBlockers reads tasks via context so
 *                            it recomputes automatically.
 */
export type DealDataKey =
  | 'tasks'
  | 'documents'
  | 'creditMemo'
  | 'activity'
  | 'after-task-complete';

export interface DealData {
  /** The authorized deal record. Banker access was confirmed by
   *  loadDealForBanker before DealDataProvider mounted. */
  deal: DealDetail;
  tasks: AsyncResult<DealTasksResult>;
  documents: AsyncResult<DealDocumentsResult>;
  creditMemo: AsyncResult<CreditMemoData>;
  activity: AsyncResult<TimelineEvent[]>;
  refresh: (key: DealDataKey) => void;
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

  // Used by the unmount cleanup AND by refresh() so a refresh fired
  // after unmount cannot late-write into stale state. Lives on a ref
  // so it's stable across renders.
  const cancelledRef = useRef(false);

  function bind<T>(setter: (r: AsyncResult<T>) => void, promise: Promise<T>): void {
    promise
      .then((data) => {
        if (!cancelledRef.current) setter({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelledRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        setter({ kind: 'failed', message });
      });
  }

  function reloadTasks(): void {
    setTasks({ kind: 'loading' });
    bind(setTasks, loadDealTasks(deal.id));
  }
  function reloadDocuments(): void {
    setDocuments({ kind: 'loading' });
    bind(setDocuments, loadDealDocuments(deal.id));
  }
  function reloadCreditMemo(): void {
    setCreditMemo({ kind: 'loading' });
    bind(setCreditMemo, loadDealCreditMemo(deal.id));
  }
  function reloadActivity(): void {
    setActivity({ kind: 'loading' });
    bind(setActivity, loadDealActivity(deal.id));
  }

  useEffect(() => {
    cancelledRef.current = false;
    reloadTasks();
    reloadDocuments();
    reloadCreditMemo();
    reloadActivity();
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  const refresh = useCallback((key: DealDataKey) => {
    switch (key) {
      case 'tasks':
        reloadTasks();
        break;
      case 'documents':
        reloadDocuments();
        break;
      case 'creditMemo':
        reloadCreditMemo();
        break;
      case 'activity':
        reloadActivity();
        break;
      case 'after-task-complete':
        // Targeted reload after Phase-21 task completion. Tasks must
        // refresh so the row drops out of the open list; activity
        // must refresh so the TaskCompleted timeline event appears.
        // DealBlockers picks up the new task state automatically since
        // it reads tasks via context.
        reloadTasks();
        reloadActivity();
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DealDataContext.Provider
      value={{ deal, tasks, documents, creditMemo, activity, refresh }}
    >
      {children}
    </DealDataContext.Provider>
  );
}

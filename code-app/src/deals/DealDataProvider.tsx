import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { DealDetail } from './dealQueries';
import { loadDealTasks, type DealTasksResult } from './dealTaskQueries';
import { loadDealDocuments, type DealDocumentsResult } from './dealDocumentQueries';
import { loadDealCreditMemo, type CreditMemoData } from './creditMemoQueries';
import { loadDealActivity, type TimelineEvent } from './activityQueries';
import {
  timed,
  recordRefresh,
  recordProviderLoaded,
} from '../shared/observability/perfRegistry';

const PERF_GROUP = 'DealDataProvider';

export type AsyncResult<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'failed'; message: string };

/** Keys callers pass to refresh() to reload one resource (or a curated
 *  bundle) without a global storm.
 *
 *    'after-task-complete'     Phase-21 write: reload tasks + activity.
 *                              DealBlockers reads tasks via context so
 *                              it recomputes automatically.
 *    'after-document-request'  Phase-22 write: reload documents +
 *                              activity. Blockers recompute via the
 *                              refreshed documents.
 *    'after-document-receive'  Phase-51 write: reload documents +
 *                              activity. Row flips Outstanding →
 *                              Received once the refreshed documents
 *                              land.
 *    'after-document-review'   Phase-55 write: reload documents +
 *                              activity. Row flips Received →
 *                              Reviewed once the refreshed documents
 *                              land; Phase 54 pending-review signal
 *                              clears via the same reload.
 */
export type DealDataKey =
  | 'tasks'
  | 'documents'
  | 'creditMemo'
  | 'activity'
  | 'after-task-complete'
  | 'after-document-request'
  | 'after-document-request-email'
  | 'after-document-request-handoff'
  | 'after-document-receive'
  | 'after-document-review'
  | 'after-credit-memo-draft-saved';

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

/** Exported so tests can mount cards against a hand-built context
 *  without firing the real load* queries. Not for app code use —
 *  app code should consume useDealData(). */
export const DealDataContext = createContext<DealData | null>(null);

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

  // Each reload returns the timed in-flight promise so the initial
  // useEffect can both bind state AND wait on the aggregate
  // completion to record a single provider-loaded event. Returning
  // the promise costs nothing — bind() already consumes it.
  function reloadTasks(): Promise<unknown> {
    setTasks({ kind: 'loading' });
    const p = timed(PERF_GROUP, 'loadDealTasks', () => loadDealTasks(deal.id));
    bind(setTasks, p);
    return p;
  }
  function reloadDocuments(): Promise<unknown> {
    setDocuments({ kind: 'loading' });
    const p = timed(PERF_GROUP, 'loadDealDocuments', () =>
      loadDealDocuments(deal.id),
    );
    bind(setDocuments, p);
    return p;
  }
  function reloadCreditMemo(): Promise<unknown> {
    setCreditMemo({ kind: 'loading' });
    const p = timed(PERF_GROUP, 'loadDealCreditMemo', () =>
      loadDealCreditMemo(deal.id),
    );
    bind(setCreditMemo, p);
    return p;
  }
  function reloadActivity(): Promise<unknown> {
    setActivity({ kind: 'loading' });
    const p = timed(PERF_GROUP, 'loadDealActivity', () =>
      loadDealActivity(deal.id),
    );
    bind(setActivity, p);
    return p;
  }

  useEffect(() => {
    cancelledRef.current = false;
    const startedAt =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    // Kick off all four initial parallel loads via the reloadX
    // helpers. They bind state via bind() AND return the timed
    // promise; we collect them so we can record an aggregate
    // provider-loaded event when everything settles. Promise.allSettled
    // is fire-and-forget — bind() owns state routing and never throws
    // into this scope.
    void Promise.allSettled([
      reloadTasks(),
      reloadDocuments(),
      reloadCreditMemo(),
      reloadActivity(),
    ]).then(() => {
      const endedAt =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      recordProviderLoaded(PERF_GROUP, endedAt - startedAt);
    });
    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id]);

  const refresh = useCallback((key: DealDataKey) => {
    recordRefresh(PERF_GROUP, key);
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
      case 'after-document-request':
        // Targeted reload after Phase-22 document request. Documents
        // must refresh so the new request date appears; activity must
        // refresh so the DocumentRequested timeline event appears.
        // DealBlockers recomputes via the refreshed documents.
        reloadDocuments();
        reloadActivity();
        break;
      case 'after-document-request-email':
        // Targeted reload after the Phase-61 Outlook send. The
        // checklist row is unchanged (the request itself already
        // stamped cr664_requestdate via the Phase-22 write); only
        // the activity timeline picks up the new EmailLogged event.
        reloadActivity();
        break;
      case 'after-document-request-handoff':
        // Targeted reload after the Phase-63 Outlook handoff. Same
        // shape as the Phase-61 reload: the checklist row is
        // unchanged (the request itself already stamped
        // cr664_requestdate via the Phase-22 write); only the
        // activity timeline picks up the new NoteLogged event with
        // the documentrequest:outlook-handoff-prepared subtype.
        reloadActivity();
        break;
      case 'after-document-receive':
        // Targeted reload after Phase-51 mark-received. Documents must
        // refresh so the new receivedDate appears (deriveStatus flips
        // the row Outstanding → Received); activity must refresh so
        // the DocumentUploaded timeline event appears.
        reloadDocuments();
        reloadActivity();
        break;
      case 'after-document-review':
        // Targeted reload after Phase-55 mark-reviewed. Documents
        // must refresh so the new reviewer field appears
        // (deriveStatus flips the row Received → Reviewed; the
        // Phase 54 pending-review signal also clears via the
        // refreshed reviewer presence); activity must refresh so
        // the NoteLogged timeline event with the
        // documentchecklist:reviewed subtype appears.
        reloadDocuments();
        reloadActivity();
        break;
      case 'after-credit-memo-draft-saved':
        // Targeted reload after Phase-25 credit memo draft save.
        // creditMemo must refresh so the new draft and its section
        // rows appear; activity must refresh so the NoteLogged
        // timeline event appears.
        reloadCreditMemo();
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

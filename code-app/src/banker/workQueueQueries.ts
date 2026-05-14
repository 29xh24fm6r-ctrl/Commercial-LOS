import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { loadBankerPipeline, type PipelineDeal } from './dealQueries';
import { timed } from '../shared/observability/perfRegistry';

/**
 * Phase 32: banker-scoped data fetch for the My Work Queue.
 *
 * Two-step pattern (per the brief):
 *   1. fetch banker-authorized deal ids via loadBankerPipeline()
 *   2. fetch child records (tasks, outstanding documents, credit
 *      memos) scoped to those deal ids using an OR-chain on
 *      _cr664_deal_value.
 *
 * No "all rows" fallback — if the banker has zero active deals we
 * return empty arrays and do NOT issue child queries. The two-step
 * pattern keeps the queue banker-scoped at the server even if
 * navigation-property filters happen to be unreliable.
 */

const PERF_GROUP = 'BankerWorkQueue';

export interface WorkQueueTaskRow {
  id: string;
  dealId: string;
  title: string;
  dueDate: string | undefined;
  modifiedOn: string | undefined;
  completed: boolean;
}

export interface WorkQueueDocumentRow {
  id: string;
  dealId: string;
  name: string;
  dueDate: string | undefined;
  /** Phase 53: surfaced for the Command Center mark-received modal so
   *  the row displays "Last requested" accurately. Loaded but unused
   *  by Phase 32's derivation. */
  requestDate: string | undefined;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded: boolean;
  modifiedOn: string | undefined;
}

export type WorkQueueMemoStatusKey = 'draft' | 'final' | 'stale';

export interface WorkQueueMemoRow {
  id: string;
  dealId: string;
  name: string;
  statusKey: WorkQueueMemoStatusKey | undefined;
  generatedAt: string;
  modifiedOn: string | undefined;
}

export interface BankerWorkQueueData {
  deals: PipelineDeal[];
  /** Open tasks (cr664_completed != true) across the banker's deals. */
  tasks: WorkQueueTaskRow[];
  /** Outstanding documents (no reviewer + no received date + not
   *  uploaded) across the banker's deals. */
  outstandingDocuments: WorkQueueDocumentRow[];
  /** Phase 54: documents marked received (receivedDate set OR
   *  uploadStatus true) that still lack a reviewer. The work queue
   *  surfaces only those past the PENDING_REVIEW_AT_RISK_DAYS
   *  threshold, but the raw list is exposed so consumers (e.g.
   *  DealDocuments via this query OR its own loader) can render
   *  the count or a per-row tag independently. */
  pendingReviewDocuments: WorkQueueDocumentRow[];
  /** Credit memos across the banker's deals — every status. */
  memos: WorkQueueMemoRow[];
}

const MEMO_STATUS_MAP: Record<number, WorkQueueMemoStatusKey> = {
  788190000: 'draft',
  788190001: 'final',
  788190002: 'stale',
};

function lookupMemoStatus(v: unknown): WorkQueueMemoStatusKey | undefined {
  if (typeof v === 'number') return MEMO_STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return MEMO_STATUS_MAP[Number(v)];
  return undefined;
}

function dealIdFilter(dealIds: readonly string[]): string {
  // OData OR-chain on the dealId. The caller has already confirmed
  // the banker is authorized for each id — these are the banker's
  // own deals, not a route-param-trusted list.
  return dealIds.map((id) => `_cr664_deal_value eq ${id}`).join(' or ');
}

async function loadOpenTasksForDeals(
  dealIds: readonly string[],
): Promise<WorkQueueTaskRow[]> {
  if (dealIds.length === 0) return [];
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_dealtask1sService.getAll({
    filter,
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load banker tasks');
  }
  return (result.data ?? [])
    .filter((t) => t.cr664_completed !== true)
    .map((t) => ({
      id: t.cr664_dealtask1id,
      dealId: t._cr664_deal_value ?? '',
      title: t.cr664_taskname,
      dueDate: t.cr664_duedate,
      modifiedOn: t.modifiedon,
      completed: t.cr664_completed === true,
    }))
    .filter((t) => t.dealId !== '');
}

/**
 * Phase 54: refactor of the Phase-32 outstanding-only loader. Now
 * fetches every not-yet-reviewed document across the banker's deals
 * in a single query, then splits client-side into the two buckets
 * the work queue cares about:
 *
 *   - outstanding   : no reviewer, no receivedDate, not uploaded
 *   - pendingReview : no reviewer, but receivedDate is set OR
 *                     uploadStatus is true (matches Phase-22 +
 *                     Phase-51 deriveStatus 'received' semantics)
 *
 * Both buckets use the same WorkQueueDocumentRow shape; consumers
 * key off receivedDate / reviewer to decide what to render.
 */
async function loadDocumentsAwaitingActionForDeals(
  dealIds: readonly string[],
): Promise<{
  outstanding: WorkQueueDocumentRow[];
  pendingReview: WorkQueueDocumentRow[];
}> {
  if (dealIds.length === 0) {
    return { outstanding: [], pendingReview: [] };
  }
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_documentchecklistsService.getAll({
    filter,
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load banker documents');
  }
  const rows = (result.data ?? [])
    .map((d) => ({
      id: d.cr664_documentchecklistid,
      dealId: d._cr664_deal_value ?? '',
      name: d.cr664_documentname,
      dueDate: d.cr664_duedate,
      requestDate: d.cr664_requestdate,
      receivedDate: d.cr664_receiveddate,
      reviewer: d.cr664_reviewer,
      uploaded: d.cr664_uploadstatus === true,
      modifiedOn: d.modifiedon,
    }))
    .filter(
      (d) =>
        d.dealId !== '' &&
        !(d.reviewer && d.reviewer.trim().length > 0),
    );
  const outstanding: WorkQueueDocumentRow[] = [];
  const pendingReview: WorkQueueDocumentRow[] = [];
  for (const d of rows) {
    if (d.receivedDate || d.uploaded) {
      pendingReview.push(d);
    } else {
      outstanding.push(d);
    }
  }
  return { outstanding, pendingReview };
}

async function loadMemosForDeals(
  dealIds: readonly string[],
): Promise<WorkQueueMemoRow[]> {
  if (dealIds.length === 0) return [];
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_creditmemo1sService.getAll({
    filter,
    orderBy: ['cr664_generatedat desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load banker memos');
  }
  return (result.data ?? [])
    .map((m) => ({
      id: m.cr664_creditmemo1id,
      dealId: m._cr664_deal_value ?? '',
      name: m.cr664_memoname,
      statusKey: lookupMemoStatus(m.cr664_status),
      generatedAt: m.cr664_generatedat,
      modifiedOn: m.modifiedon,
    }))
    .filter((m) => m.dealId !== '');
}

export async function loadBankerWorkQueueData(
  bankerId: string,
): Promise<BankerWorkQueueData> {
  // Step 1: authorized deal ids.
  const deals = await timed(PERF_GROUP, 'loadBankerPipeline', () =>
    loadBankerPipeline(bankerId),
  );
  if (deals.length === 0) {
    return {
      deals,
      tasks: [],
      outstandingDocuments: [],
      pendingReviewDocuments: [],
      memos: [],
    };
  }

  // Step 2: child queries scoped to those deal ids, in parallel.
  const dealIds = deals.map((d) => d.id);
  const [tasks, documents, memos] = await Promise.all([
    timed(PERF_GROUP, 'loadOpenTasksForDeals', () =>
      loadOpenTasksForDeals(dealIds),
    ),
    timed(PERF_GROUP, 'loadDocumentsAwaitingActionForDeals', () =>
      loadDocumentsAwaitingActionForDeals(dealIds),
    ),
    timed(PERF_GROUP, 'loadMemosForDeals', () => loadMemosForDeals(dealIds)),
  ]);

  return {
    deals,
    tasks,
    outstandingDocuments: documents.outstanding,
    pendingReviewDocuments: documents.pendingReview,
    memos,
  };
}

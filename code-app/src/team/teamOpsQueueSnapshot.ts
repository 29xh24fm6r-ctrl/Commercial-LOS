import type {
  TeamDealRow,
  TeamTaskRow,
  TeamDocumentRow,
} from './teamQueries';
import type { DealDetail } from '../deals/dealQueries';
import type { DealTask, DealTasksResult } from '../deals/dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from '../deals/dealDocumentQueries';
import { deriveDealCockpitMetrics } from '../deals/dealCockpitMetrics';
import {
  deriveBlockers,
  type BlockersResult,
} from '../deals/blockerRules';
import {
  deriveDealIntelligenceViewModel,
  type DealIntelligenceViewModel,
} from '../shared/dealIntelligenceViewModel';

/**
 * Phase 127A — Team Ops Queue snapshot deriver.
 *
 * Pure projection over the already-authorized team-scoped records
 * (TeamDataProvider's deals + tasks + documents) into the dense
 * execution-queue shape the Team Ops Queue cockpit renders.
 *
 * Discipline:
 *   - Pure. No IO. No React state. Injectable `now` for
 *     deterministic date-sensitive classifications.
 *   - Reuses the shared Phase-123A `deriveDealIntelligenceViewModel`
 *     projection — same VM, same blocker rules, same honest absence
 *     semantics the manager + portfolio cockpits consume. Single
 *     source of truth for per-deal classification.
 *   - Loader-gap signals are filtered (same pattern as Phase 124A
 *     `filterOutLoaderGapSignals` on the manager side): the
 *     team-pipeline query does NOT fetch productType, so
 *     deriveBlockers's `missing-required` signal would always fire
 *     and pollute the queue. Strip it before passing to the VM.
 *   - Honest absence everywhere. 'Unassigned' / 'Unknown' / 'No
 *     amount' / 'Not set' surface only when the source value is
 *     truly absent.
 *
 * Permission-before-render: the caller (TeamOpsQueue) mounts
 * inside TeamProvider + TeamDataProvider. Both authorize the
 * team-scoped data. The deriver never widens permission; it
 * re-projects the already-authorized records into an execution
 * lens.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkItemKind =
  | 'overdue-task'
  | 'due-soon-task'
  | 'outstanding-document'
  | 'pending-review-document'
  | 'missing-data'
  | 'stale-deal'
  | 'blocked-deal'
  | 'at-risk-deal'
  | 'closing-soon';

export type WorkItemSeverity = 'blocked' | 'atRisk' | 'info' | 'clear';

export interface TeamOpsCommandRibbon {
  /** Count of authorized active deals on the team. */
  activeDealCount: number;
  /** Count of open (non-completed) tasks across the team. */
  openTaskCount: number;
  /** Open tasks whose dueDate is in the past. */
  overdueTaskCount: number;
  /** Open tasks whose dueDate falls in [now, now + DUE_SOON_DAYS]. */
  dueSoonTaskCount: number;
  /** Document checklist rows with status === 'outstanding'. */
  outstandingDocumentCount: number;
  /** Document checklist rows with status === 'received' (pending review). */
  docsPendingReviewCount: number;
  /** Distinct count of deals whose blocker status is 'blocked'. */
  blockedDealCount: number;
  /** Distinct count of deals whose blocker status is 'at-risk'. */
  atRiskDealCount: number;
  /** Distinct count of deals not modified for STALE_DEAL_DAYS+. */
  staleDealCount: number;
  /** Distinct count of deals with targetCloseDate within next 30 days. */
  closingNext30DayCount: number;
}

export interface WorkItem {
  kind: WorkItemKind;
  severity: WorkItemSeverity;
  /** Title rendered on the queue row. */
  title: string;
  /** Stable id (task id, document id, or deal id). */
  itemId: string;
  /** Deal the item belongs to. */
  dealId: string;
  /** Deal name (or '—' when unknown — but undefined should not occur
   *  on team-scoped records the loaders return). */
  dealName: string;
  /** Banker / owner name when available. */
  ownerName: string | undefined;
  /** Banker id when available (for grouping). */
  ownerId: string | undefined;
  /** Client display when available. */
  clientName: string | undefined;
  /** ISO due-date (tasks / docs) or relevant timestamp (deal). */
  dueDate: string | undefined;
  /** Whole-day count: positive = days until due, negative = days
   *  past due. Undefined when no due date or unparsable. */
  daysUntilDue: number | undefined;
  /** Days-since-modified for stale-deal items; undefined otherwise. */
  daysStale: number | undefined;
  /** Short reason copy derived from the underlying signal. */
  reason: string;
}

export interface TeamOpsQueueLanes {
  overdueTasks: WorkItem[];
  dueSoonTasks: WorkItem[];
  outstandingDocuments: WorkItem[];
  pendingReviewDocs: WorkItem[];
  missingData: WorkItem[];
  staleDeals: WorkItem[];
  blockedAtRisk: WorkItem[];
  closingSoon: WorkItem[];
}

export interface TeamBankerWorkloadRow {
  bankerId: string;
  bankerName: string;
  activeDealCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  outstandingDocumentCount: number;
  blockerAtRiskCount: number;
  closingNext30Count: number;
}

export interface TeamOpsQueueSnapshot {
  commandRibbon: TeamOpsCommandRibbon;
  lanes: TeamOpsQueueLanes;
  bankerWorkload: TeamBankerWorkloadRow[];
  /** Execution board — every work item flattened and sorted by
   *  severity (blocked > atRisk > info > clear) then urgency
   *  (overdue days desc; tied items by deal name asc). */
  executionBoard: WorkItem[];
  /** Per-deal projected VM rows — exposed for chart adapters
   *  (work-items-by-type / overdue-by-banker / risk distribution /
   *  closing forecast). */
  vmRows: ReadonlyArray<TeamOpsVMRow>;
  /** True when the team has zero authorized active deals. */
  isEmpty: boolean;
}

export interface TeamOpsVMRow {
  teamDeal: TeamDealRow;
  vm: DealIntelligenceViewModel;
  openTaskCount: number;
  overdueTaskCount: number;
  dueSoonTaskCount: number;
  outstandingDocumentCount: number;
  pendingReviewCount: number;
  /** True when modifiedOn is unset OR ≥ STALE_DEAL_DAYS days ago. */
  isStale: boolean;
  /** True when targetCloseDate falls in [now, now + 30d]. */
  isClosingNext30: boolean;
  /** Manager-style honest missing-fields catalog labels. */
  missingFieldLabels: ReadonlyArray<string>;
}

export interface TeamOpsQueueSnapshotInput {
  deals: ReadonlyArray<TeamDealRow>;
  tasks: ReadonlyArray<TeamTaskRow>;
  documents: ReadonlyArray<TeamDocumentRow>;
  /** Injectable now for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days within which an open task counts as "due soon". */
export const DUE_SOON_DAYS = 7;

/** Days since last modify above which a deal is considered stale. */
export const STALE_DEAL_DAYS = 14;

/** Days from now to count a deal in the "closing-soon" lane. */
export const CLOSING_SOON_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TEAM_REQUIRED_DEAL_FIELDS: ReadonlyArray<{
  key: keyof TeamDealRow;
  label: string;
}> = [
  { key: 'clientName', label: 'Client' },
  { key: 'amount', label: 'Loan amount' },
  { key: 'targetCloseDate', label: 'Target close' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'assignedBankerName', label: 'Banker' },
];

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

export function deriveTeamOpsQueueSnapshot(
  input: TeamOpsQueueSnapshotInput,
): TeamOpsQueueSnapshot {
  const now = input.now ?? new Date();

  const tasksByDeal = groupTasksByDeal(input.tasks);
  const documentsByDeal = groupDocsByDeal(input.documents);

  const vmRows: TeamOpsVMRow[] = input.deals.map((td) =>
    projectTeamDealToVM(
      td,
      tasksByDeal.get(td.id) ?? [],
      documentsByDeal.get(td.id) ?? [],
      now,
    ),
  );

  const commandRibbon = buildCommandRibbon(vmRows);
  const lanes = buildLanes(vmRows, input.tasks, input.documents, now);
  const bankerWorkload = buildBankerWorkload(vmRows);
  const executionBoard = buildExecutionBoard(lanes);

  return {
    commandRibbon,
    lanes,
    bankerWorkload,
    executionBoard,
    vmRows,
    isEmpty: input.deals.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Per-deal VM projection
// ---------------------------------------------------------------------------

function projectTeamDealToVM(
  td: TeamDealRow,
  tasks: TeamTaskRow[],
  docs: TeamDocumentRow[],
  now: Date,
): TeamOpsVMRow {
  const deal = teamDealToDealDetail(td);
  const tasksResult = teamTasksToDealTasksResult(tasks);
  const documentsResult = teamDocsToDealDocumentsResult(docs);

  const metrics = deriveDealCockpitMetrics(
    {
      deal,
      tasks: tasksResult,
      documents: documentsResult,
      creditMemo: undefined,
      activity: undefined,
    },
    now,
  );
  const rawBlockers = deriveBlockers(deal, tasksResult, documentsResult, now);
  const blockers = filterOutLoaderGapSignals(rawBlockers);
  const rawVm = deriveDealIntelligenceViewModel({ deal, metrics, blockers });
  const vm = muteLoaderGapNextBestAction(rawVm);

  // Open / overdue / due-soon task counts.
  const openTasks = tasksResult.open;
  let overdueTaskCount = 0;
  let dueSoonTaskCount = 0;
  const dueSoonThreshold = now.getTime() + DUE_SOON_DAYS * MS_PER_DAY;
  for (const t of openTasks) {
    if (!t.dueDate) continue;
    const due = new Date(t.dueDate).getTime();
    if (Number.isNaN(due)) continue;
    if (due < now.getTime()) overdueTaskCount += 1;
    else if (due <= dueSoonThreshold) dueSoonTaskCount += 1;
  }

  const outstandingDocumentCount = documentsResult.outstanding.length;
  const pendingReviewCount = documentsResult.received.length;

  // Staleness: modifiedOn ≥ STALE_DEAL_DAYS days ago.
  let isStale = false;
  if (td.modifiedOn) {
    const m = new Date(td.modifiedOn).getTime();
    if (!Number.isNaN(m)) {
      const daysSince = Math.floor((now.getTime() - m) / MS_PER_DAY);
      isStale = daysSince >= STALE_DEAL_DAYS;
    }
  }

  // Closing-next-30: targetCloseDate in [now, now + 30d].
  let isClosingNext30 = false;
  if (td.targetCloseDate) {
    const t = new Date(td.targetCloseDate).getTime();
    if (!Number.isNaN(t)) {
      const delta = t - now.getTime();
      if (delta >= 0 && delta <= CLOSING_SOON_DAYS * MS_PER_DAY) {
        isClosingNext30 = true;
      }
    }
  }

  return {
    teamDeal: td,
    vm,
    openTaskCount: openTasks.length,
    overdueTaskCount,
    dueSoonTaskCount,
    outstandingDocumentCount,
    pendingReviewCount,
    isStale,
    isClosingNext30,
    missingFieldLabels: teamMissingFieldLabels(td),
  };
}

function teamDealToDealDetail(td: TeamDealRow): DealDetail {
  return {
    id: td.id,
    name: td.name,
    clientName: td.clientName,
    stage: td.stage,
    status: td.status,
    amount: td.amount,
    bankerName: td.assignedBankerName,
    targetCloseDate: td.targetCloseDate,
    productType: undefined,
    loanStructure: undefined,
    customerType: undefined,
    industry: undefined,
    guarantorStructure: undefined,
    pricingType: undefined,
    spreadIndex: undefined,
    spreadMargin: undefined,
    collateralSummary: td.collateralSummary,
    createdOn: undefined,
    stageEntryDate: td.stageEntryDate,
    isClosed: false,
  };
}

function teamTasksToDealTasksResult(
  tasks: ReadonlyArray<TeamTaskRow>,
): DealTasksResult {
  const open: DealTask[] = [];
  const completed: DealTask[] = [];
  for (const t of tasks) {
    const mapped: DealTask = {
      id: t.id,
      title: t.title,
      completed: t.completed,
      dueDate: t.dueDate,
      assigneeName: t.assigneeName,
      modifiedOn: t.modifiedOn,
    };
    if (t.completed) completed.push(mapped);
    else open.push(mapped);
  }
  return { open, completed };
}

function teamDocsToDealDocumentsResult(
  docs: ReadonlyArray<TeamDocumentRow>,
): DealDocumentsResult {
  const outstanding: DealDocument[] = [];
  const received: DealDocument[] = [];
  const reviewed: DealDocument[] = [];
  for (const d of docs) {
    const mapped: DealDocument = {
      id: d.id,
      name: d.name,
      dueDate: d.dueDate,
      requestDate: d.requestDate,
      receivedDate: d.receivedDate,
      reviewer: d.reviewer,
      uploaded: d.uploaded,
      modifiedOn: d.modifiedOn,
      status: d.status,
    };
    if (d.status === 'outstanding') outstanding.push(mapped);
    else if (d.status === 'received') received.push(mapped);
    else reviewed.push(mapped);
  }
  return { outstanding, received, reviewed };
}

function filterOutLoaderGapSignals(blockers: BlockersResult): BlockersResult {
  // The team-pipeline query does NOT fetch productType, so
  // deriveBlockers's `missing-required` signal would always fire
  // and pollute the queue. Strip it before passing to the VM —
  // the team's manager-style missing-field catalog (below) is
  // the honest signal for that concept.
  const signals = blockers.signals.filter((s) => s.id !== 'missing-required');
  const status = signals.some((s) => s.severity === 'blocked')
    ? 'blocked'
    : signals.length > 0
      ? 'at-risk'
      : 'clear';
  return { status, signals, closedDealNote: blockers.closedDealNote };
}

function muteLoaderGapNextBestAction(
  vm: DealIntelligenceViewModel,
): DealIntelligenceViewModel {
  if (vm.nextBestAction?.id === 'populate-missing-fields') {
    return { ...vm, nextBestAction: undefined };
  }
  return vm;
}

function teamMissingFieldLabels(td: TeamDealRow): ReadonlyArray<string> {
  const missing: string[] = [];
  for (const f of TEAM_REQUIRED_DEAL_FIELDS) {
    const v = td[f.key];
    if (v === undefined || v === null) {
      missing.push(f.label);
      continue;
    }
    if (typeof v === 'string' && v.trim().length === 0) {
      missing.push(f.label);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildCommandRibbon(
  vmRows: ReadonlyArray<TeamOpsVMRow>,
): TeamOpsCommandRibbon {
  let openTaskCount = 0;
  let overdueTaskCount = 0;
  let dueSoonTaskCount = 0;
  let outstandingDocumentCount = 0;
  let docsPendingReviewCount = 0;
  let blockedDealCount = 0;
  let atRiskDealCount = 0;
  let staleDealCount = 0;
  let closingNext30DayCount = 0;
  for (const r of vmRows) {
    openTaskCount += r.openTaskCount;
    overdueTaskCount += r.overdueTaskCount;
    dueSoonTaskCount += r.dueSoonTaskCount;
    outstandingDocumentCount += r.outstandingDocumentCount;
    docsPendingReviewCount += r.pendingReviewCount;
    if (r.vm.blockerStatus === 'blocked') blockedDealCount += 1;
    else if (r.vm.blockerStatus === 'at-risk') atRiskDealCount += 1;
    if (r.isStale) staleDealCount += 1;
    if (r.isClosingNext30) closingNext30DayCount += 1;
  }
  return {
    activeDealCount: vmRows.length,
    openTaskCount,
    overdueTaskCount,
    dueSoonTaskCount,
    outstandingDocumentCount,
    docsPendingReviewCount,
    blockedDealCount,
    atRiskDealCount,
    staleDealCount,
    closingNext30DayCount,
  };
}

function buildLanes(
  vmRows: ReadonlyArray<TeamOpsVMRow>,
  tasks: ReadonlyArray<TeamTaskRow>,
  documents: ReadonlyArray<TeamDocumentRow>,
  now: Date,
): TeamOpsQueueLanes {
  // Build a deal-id → row index for O(1) lookups while iterating
  // tasks / documents.
  const rowByDealId = new Map<string, TeamOpsVMRow>();
  for (const r of vmRows) rowByDealId.set(r.teamDeal.id, r);

  const overdueTasks: WorkItem[] = [];
  const dueSoonTasks: WorkItem[] = [];
  for (const t of tasks) {
    if (t.completed) continue;
    if (!t.dealId) continue;
    const r = rowByDealId.get(t.dealId);
    if (!r) continue;
    if (!t.dueDate) continue;
    const due = new Date(t.dueDate).getTime();
    if (Number.isNaN(due)) continue;
    const daysUntilDue = Math.round((due - now.getTime()) / MS_PER_DAY);
    if (due < now.getTime()) {
      overdueTasks.push({
        kind: 'overdue-task',
        severity: 'atRisk',
        title: t.title,
        itemId: t.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: t.dueDate,
        daysUntilDue,
        daysStale: undefined,
        reason: `Task due ${Math.abs(daysUntilDue)} day(s) ago.`,
      });
    } else if (due <= now.getTime() + DUE_SOON_DAYS * MS_PER_DAY) {
      dueSoonTasks.push({
        kind: 'due-soon-task',
        severity: 'info',
        title: t.title,
        itemId: t.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: t.dueDate,
        daysUntilDue,
        daysStale: undefined,
        reason:
          daysUntilDue === 0
            ? 'Task due today.'
            : `Task due in ${daysUntilDue} day(s).`,
      });
    }
  }
  // Sort: overdue (most overdue first), due-soon (soonest first).
  overdueTasks.sort((a, b) =>
    (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0),
  );
  dueSoonTasks.sort((a, b) =>
    (a.daysUntilDue ?? Infinity) - (b.daysUntilDue ?? Infinity),
  );

  const outstandingDocuments: WorkItem[] = [];
  const pendingReviewDocs: WorkItem[] = [];
  for (const d of documents) {
    if (!d.dealId) continue;
    const r = rowByDealId.get(d.dealId);
    if (!r) continue;
    if (d.status === 'outstanding') {
      const daysUntilDue = d.dueDate
        ? Math.round(
            (new Date(d.dueDate).getTime() - now.getTime()) / MS_PER_DAY,
          )
        : undefined;
      outstandingDocuments.push({
        kind: 'outstanding-document',
        severity: 'atRisk',
        title: d.name,
        itemId: d.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: d.dueDate,
        daysUntilDue,
        daysStale: undefined,
        reason: 'Document not yet received.',
      });
    } else if (d.status === 'received') {
      pendingReviewDocs.push({
        kind: 'pending-review-document',
        severity: 'info',
        title: d.name,
        itemId: d.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: d.dueDate,
        daysUntilDue: d.dueDate
          ? Math.round(
              (new Date(d.dueDate).getTime() - now.getTime()) / MS_PER_DAY,
            )
          : undefined,
        daysStale: undefined,
        reason: 'Document received — awaiting review.',
      });
    }
  }
  outstandingDocuments.sort((a, b) =>
    (a.daysUntilDue ?? Infinity) - (b.daysUntilDue ?? Infinity),
  );
  pendingReviewDocs.sort((a, b) => a.dealName.localeCompare(b.dealName));

  const missingData: WorkItem[] = [];
  const staleDeals: WorkItem[] = [];
  const blockedAtRisk: WorkItem[] = [];
  const closingSoon: WorkItem[] = [];

  for (const r of vmRows) {
    if (r.missingFieldLabels.length > 0) {
      missingData.push({
        kind: 'missing-data',
        severity: 'atRisk',
        title: r.teamDeal.name,
        itemId: r.teamDeal.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: undefined,
        daysUntilDue: undefined,
        daysStale: undefined,
        reason: missingDataReason(r.missingFieldLabels),
      });
    }
    if (r.isStale) {
      const days = r.teamDeal.modifiedOn
        ? Math.floor(
            (now.getTime() - new Date(r.teamDeal.modifiedOn).getTime()) /
              MS_PER_DAY,
          )
        : undefined;
      staleDeals.push({
        kind: 'stale-deal',
        severity: 'atRisk',
        title: r.teamDeal.name,
        itemId: r.teamDeal.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: r.teamDeal.modifiedOn,
        daysUntilDue: undefined,
        daysStale: days,
        reason:
          days === undefined
            ? 'No record activity logged.'
            : `No record activity in ${days} day(s).`,
      });
    }
    if (r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk') {
      const topSignal =
        r.vm.blockerSignals.find((s) => s.severity === r.vm.blockerStatus) ??
        r.vm.blockerSignals[0];
      blockedAtRisk.push({
        kind: r.vm.blockerStatus === 'blocked' ? 'blocked-deal' : 'at-risk-deal',
        severity: r.vm.blockerStatus === 'blocked' ? 'blocked' : 'atRisk',
        title: r.teamDeal.name,
        itemId: r.teamDeal.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: r.teamDeal.targetCloseDate,
        daysUntilDue: r.teamDeal.targetCloseDate
          ? Math.round(
              (new Date(r.teamDeal.targetCloseDate).getTime() - now.getTime()) /
                MS_PER_DAY,
            )
          : undefined,
        daysStale: undefined,
        reason:
          topSignal?.label ??
          `Deal classified ${r.vm.blockerStatus}.`,
      });
    }
    if (r.isClosingNext30) {
      const daysUntilDue = r.teamDeal.targetCloseDate
        ? Math.round(
            (new Date(r.teamDeal.targetCloseDate).getTime() - now.getTime()) /
              MS_PER_DAY,
          )
        : undefined;
      closingSoon.push({
        kind: 'closing-soon',
        severity: 'info',
        title: r.teamDeal.name,
        itemId: r.teamDeal.id,
        dealId: r.teamDeal.id,
        dealName: r.teamDeal.name,
        ownerName: r.teamDeal.assignedBankerName,
        ownerId: r.teamDeal.assignedBankerId,
        clientName: r.teamDeal.clientName,
        dueDate: r.teamDeal.targetCloseDate,
        daysUntilDue,
        daysStale: undefined,
        reason:
          daysUntilDue === undefined
            ? 'Closing within 30 days.'
            : daysUntilDue === 0
              ? 'Closing today.'
              : `Closing in ${daysUntilDue} day(s).`,
      });
    }
  }
  missingData.sort((a, b) => a.dealName.localeCompare(b.dealName));
  staleDeals.sort((a, b) => (b.daysStale ?? 0) - (a.daysStale ?? 0));
  blockedAtRisk.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'blocked' ? -1 : 1;
    return a.dealName.localeCompare(b.dealName);
  });
  closingSoon.sort((a, b) =>
    (a.daysUntilDue ?? Infinity) - (b.daysUntilDue ?? Infinity),
  );

  return {
    overdueTasks,
    dueSoonTasks,
    outstandingDocuments,
    pendingReviewDocs,
    missingData,
    staleDeals,
    blockedAtRisk,
    closingSoon,
  };
}

function buildBankerWorkload(
  vmRows: ReadonlyArray<TeamOpsVMRow>,
): TeamBankerWorkloadRow[] {
  type Acc = TeamBankerWorkloadRow;
  const acc = new Map<string, Acc>();
  const UNASSIGNED = '__unassigned__';
  for (const r of vmRows) {
    const id = r.teamDeal.assignedBankerId ?? UNASSIGNED;
    const name =
      r.teamDeal.assignedBankerName ??
      (id === UNASSIGNED ? 'Unassigned' : id);
    let row = acc.get(id);
    if (!row) {
      row = {
        bankerId: id,
        bankerName: name,
        activeDealCount: 0,
        openTaskCount: 0,
        overdueTaskCount: 0,
        outstandingDocumentCount: 0,
        blockerAtRiskCount: 0,
        closingNext30Count: 0,
      };
      acc.set(id, row);
    }
    row.activeDealCount += 1;
    row.openTaskCount += r.openTaskCount;
    row.overdueTaskCount += r.overdueTaskCount;
    row.outstandingDocumentCount += r.outstandingDocumentCount;
    if (r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk') {
      row.blockerAtRiskCount += 1;
    }
    if (r.isClosingNext30) row.closingNext30Count += 1;
  }
  return Array.from(acc.values()).sort((a, b) => {
    if (b.overdueTaskCount !== a.overdueTaskCount) {
      return b.overdueTaskCount - a.overdueTaskCount;
    }
    if (b.blockerAtRiskCount !== a.blockerAtRiskCount) {
      return b.blockerAtRiskCount - a.blockerAtRiskCount;
    }
    return a.bankerName.localeCompare(b.bankerName);
  });
}

function buildExecutionBoard(lanes: TeamOpsQueueLanes): WorkItem[] {
  // Flatten every lane and sort by severity (blocked > atRisk > info)
  // then urgency (overdue first, then due-soon, then stale, then
  // closing). Tied items by dealName asc.
  const items: WorkItem[] = [
    ...lanes.blockedAtRisk,
    ...lanes.overdueTasks,
    ...lanes.outstandingDocuments,
    ...lanes.missingData,
    ...lanes.staleDeals,
    ...lanes.pendingReviewDocs,
    ...lanes.dueSoonTasks,
    ...lanes.closingSoon,
  ];
  const severityRank: Record<WorkItemSeverity, number> = {
    blocked: 0,
    atRisk: 1,
    info: 2,
    clear: 3,
  };
  items.sort((a, b) => {
    const sa = severityRank[a.severity];
    const sb = severityRank[b.severity];
    if (sa !== sb) return sa - sb;
    // Within the same severity, surface more-urgent items first.
    const ua = urgencyValue(a);
    const ub = urgencyValue(b);
    if (ua !== ub) return ua - ub;
    return a.dealName.localeCompare(b.dealName);
  });
  return items;
}

function urgencyValue(item: WorkItem): number {
  // Lower value = more urgent.
  if (item.daysUntilDue !== undefined) return item.daysUntilDue;
  if (item.daysStale !== undefined) return -item.daysStale;
  return Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupTasksByDeal(
  tasks: ReadonlyArray<TeamTaskRow>,
): Map<string, TeamTaskRow[]> {
  const byId = new Map<string, TeamTaskRow[]>();
  for (const t of tasks) {
    if (!t.dealId) continue;
    const bucket = byId.get(t.dealId);
    if (bucket) bucket.push(t);
    else byId.set(t.dealId, [t]);
  }
  return byId;
}

function groupDocsByDeal(
  docs: ReadonlyArray<TeamDocumentRow>,
): Map<string, TeamDocumentRow[]> {
  const byId = new Map<string, TeamDocumentRow[]>();
  for (const d of docs) {
    if (!d.dealId) continue;
    const bucket = byId.get(d.dealId);
    if (bucket) bucket.push(d);
    else byId.set(d.dealId, [d]);
  }
  return byId;
}

function missingDataReason(labels: ReadonlyArray<string>): string {
  if (labels.length === 0) return 'Required deal fields are missing.';
  const preview = labels.slice(0, 3).join(', ');
  const suffix = labels.length > 3 ? `, +${labels.length - 3} more` : '';
  return `${labels.length} required field(s) not captured: ${preview}${suffix}.`;
}

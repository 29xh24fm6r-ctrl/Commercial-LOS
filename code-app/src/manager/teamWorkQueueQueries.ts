import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { timed } from '../shared/observability/perfRegistry';

/**
 * Phase 33: manager-team-scoped child fetch for the Team Work Queue.
 *
 * The ManagerDataProvider already exposes the team pipeline (deals
 * scoped by _cr664_team_value eq teamId) — this module reads the
 * already-authorized deal ids from that array and issues child
 * queries (tasks / documents / memos) via an OR-chain on
 * _cr664_deal_value. Same shape as the banker queue's child fetch
 * but never imports the banker module: schemas / utilities are
 * sibling-isolated.
 *
 * Empty-team short-circuit: zero deal ids => return empty arrays
 * immediately. No "all rows" fallback.
 */

const PERF_GROUP = 'ManagerTeamWorkQueue';

export interface TeamWorkQueueTaskRow {
  id: string;
  dealId: string;
  title: string;
  dueDate: string | undefined;
  modifiedOn: string | undefined;
  completed: boolean;
}

export interface TeamWorkQueueDocumentRow {
  id: string;
  dealId: string;
  name: string;
  dueDate: string | undefined;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded: boolean;
  modifiedOn: string | undefined;
}

export type TeamWorkQueueMemoStatusKey = 'draft' | 'final' | 'stale';

export interface TeamWorkQueueMemoRow {
  id: string;
  dealId: string;
  name: string;
  statusKey: TeamWorkQueueMemoStatusKey | undefined;
  generatedAt: string;
  modifiedOn: string | undefined;
}

export interface TeamWorkQueueChildren {
  tasks: TeamWorkQueueTaskRow[];
  outstandingDocuments: TeamWorkQueueDocumentRow[];
  memos: TeamWorkQueueMemoRow[];
}

const MEMO_STATUS_MAP: Record<number, TeamWorkQueueMemoStatusKey> = {
  788190000: 'draft',
  788190001: 'final',
  788190002: 'stale',
};

function lookupMemoStatus(
  v: unknown,
): TeamWorkQueueMemoStatusKey | undefined {
  if (typeof v === 'number') return MEMO_STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return MEMO_STATUS_MAP[Number(v)];
  return undefined;
}

function dealIdFilter(dealIds: readonly string[]): string {
  return dealIds.map((id) => `_cr664_deal_value eq ${id}`).join(' or ');
}

async function loadOpenTasksForTeamDeals(
  dealIds: readonly string[],
): Promise<TeamWorkQueueTaskRow[]> {
  if (dealIds.length === 0) return [];
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_dealtask1sService.getAll({
    filter,
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team tasks');
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

async function loadOutstandingDocumentsForTeamDeals(
  dealIds: readonly string[],
): Promise<TeamWorkQueueDocumentRow[]> {
  if (dealIds.length === 0) return [];
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_documentchecklistsService.getAll({
    filter,
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team documents');
  }
  return (result.data ?? [])
    .map((d) => ({
      id: d.cr664_documentchecklistid,
      dealId: d._cr664_deal_value ?? '',
      name: d.cr664_documentname,
      dueDate: d.cr664_duedate,
      receivedDate: d.cr664_receiveddate,
      reviewer: d.cr664_reviewer,
      uploaded: d.cr664_uploadstatus === true,
      modifiedOn: d.modifiedon,
    }))
    .filter(
      (d) =>
        d.dealId !== '' &&
        !(d.reviewer && d.reviewer.trim().length > 0) &&
        !d.receivedDate &&
        !d.uploaded,
    );
}

async function loadMemosForTeamDeals(
  dealIds: readonly string[],
): Promise<TeamWorkQueueMemoRow[]> {
  if (dealIds.length === 0) return [];
  const filter = `(${dealIdFilter(dealIds)}) and statecode eq 0`;
  const result = await Cr664_creditmemo1sService.getAll({
    filter,
    orderBy: ['cr664_generatedat desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team memos');
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

/**
 * Load tasks / outstanding documents / memos scoped to the
 * already-authorized team deal ids. Caller MUST have read those ids
 * from ManagerDataProvider's teamPipeline — passing arbitrary ids
 * defeats team scoping.
 */
export async function loadTeamWorkQueueChildren(
  dealIds: readonly string[],
): Promise<TeamWorkQueueChildren> {
  if (dealIds.length === 0) {
    return { tasks: [], outstandingDocuments: [], memos: [] };
  }
  const [tasks, outstandingDocuments, memos] = await Promise.all([
    timed(PERF_GROUP, 'loadOpenTasksForTeamDeals', () =>
      loadOpenTasksForTeamDeals(dealIds),
    ),
    timed(PERF_GROUP, 'loadOutstandingDocumentsForTeamDeals', () =>
      loadOutstandingDocumentsForTeamDeals(dealIds),
    ),
    timed(PERF_GROUP, 'loadMemosForTeamDeals', () =>
      loadMemosForTeamDeals(dealIds),
    ),
  ]);
  return { tasks, outstandingDocuments, memos };
}

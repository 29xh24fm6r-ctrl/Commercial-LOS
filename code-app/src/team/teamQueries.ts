import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';

/**
 * Team Workspace queries. Live operational data — Team Workspace is
 * operational, not executive, so no snapshot discipline applies here.
 *
 * Schema reality (same as Manager Workspace findings):
 *   - cr664_Banker.cr664_Team is a lookup to cr664_Team
 *   - cr664_LoanDeal.cr664_Team is a lookup to cr664_Team
 *   - cr664_DealTask1.cr664_Deal and cr664_DocumentChecklist.cr664_Deal
 *     are lookups to LoanDeal (no direct team FK on tasks/docs)
 *
 * Decision: scope EVERY query by team. Pipeline filters
 * _cr664_team_value directly; tasks and documents use the
 * navigation-property filter on the parent deal's team lookup
 * (cr664_Deal/_cr664_team_value eq <teamId>). If Dataverse rejects
 * the navigation filter at runtime, fall back to two-step (load deal
 * ids, then OR chain) — comment in each function flags that.
 *
 * Role isolation: this module duplicates ~one OData filter pattern
 * from the Manager module by intent. The two role surfaces have
 * different operating concerns (manager: oversight; team: shared
 * visibility) and keeping their data layers separate prevents
 * coupling drift.
 */

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Team identity (banker by UPN -> team)
// ---------------------------------------------------------------------------

export interface TeamIdentity {
  bankerId: string;
  fullName: string;
  email: string;
  teamId: string;
  teamName: string;
}

export type TeamIdentityResult =
  | { kind: 'ready'; identity: TeamIdentity }
  | { kind: 'not-banker' }
  | { kind: 'no-team' }
  | { kind: 'failed'; message: string };

export async function loadTeamIdentity(upn: string): Promise<TeamIdentityResult> {
  const result = await Cr664_bankersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });
  if (!result.success) {
    return { kind: 'failed', message: result.error?.message ?? 'Failed to load banker record' };
  }
  const banker = result.data?.[0];
  if (!banker) return { kind: 'not-banker' };
  const teamId = banker._cr664_team_value;
  if (!teamId) return { kind: 'no-team' };
  return {
    kind: 'ready',
    identity: {
      bankerId: banker.cr664_bankerid,
      fullName: banker.cr664_fullname,
      email: banker.cr664_email ?? upn,
      teamId,
      teamName: banker.cr664_teamname ?? '(unnamed team)',
    },
  };
}

// ---------------------------------------------------------------------------
// Team pipeline (active, non-terminal deals scoped to team)
// ---------------------------------------------------------------------------

export interface TeamDealRow {
  id: string;
  name: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  targetCloseDate: string | undefined;
  stageEntryDate: string | undefined;
  modifiedOn: string | undefined;
  assignedBankerId: string | undefined;
  assignedBankerName: string | undefined;
}

export async function loadTeamDeals(teamId: string): Promise<TeamDealRow[]> {
  const result = await Cr664_loandealsService.getAll({
    filter: [
      `_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
      `(cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)`,
    ].join(' and '),
    orderBy: ['cr664_targetclosedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team pipeline');
  }
  return (result.data ?? []).map(
    (d): TeamDealRow => ({
      id: d.cr664_loandealid,
      name: d.cr664_dealname,
      clientName: d.cr664_clientname,
      stage: d.cr664_stagereferencename,
      status: d.cr664_statusreferencename,
      amount: d.cr664_amount,
      targetCloseDate: d.cr664_targetclosedate,
      stageEntryDate: d.cr664_stageentrydate,
      modifiedOn: d.modifiedon,
      assignedBankerId: d._cr664_assignedbanker_value,
      assignedBankerName: d.cr664_assignedbankername,
    }),
  );
}

// ---------------------------------------------------------------------------
// Team tasks (via navigation filter on parent deal's team)
// ---------------------------------------------------------------------------

export interface TeamTaskRow {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | undefined;
  assigneeName: string | undefined;
  modifiedOn: string | undefined;
  dealId: string | undefined;
  dealName: string | undefined;
}

/**
 * Tasks where the parent deal's team matches. Uses the OData
 * navigation-property filter: cr664_Deal/_cr664_team_value eq <teamId>.
 * If Dataverse rejects that at runtime, the fallback is a two-step
 * load (team-deal ids -> OR chain on _cr664_deal_value), but we try
 * the cleaner approach first.
 */
export async function loadTeamTasks(teamId: string): Promise<TeamTaskRow[]> {
  const result = await Cr664_dealtask1sService.getAll({
    filter: [
      `cr664_Deal/_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team tasks');
  }
  return (result.data ?? []).map(
    (t): TeamTaskRow => ({
      id: t.cr664_dealtask1id,
      title: t.cr664_taskname,
      completed: t.cr664_completed === true,
      dueDate: t.cr664_duedate,
      assigneeName: t.cr664_assignedtoname,
      modifiedOn: t.modifiedon,
      dealId: t._cr664_deal_value,
      dealName: t.cr664_dealname,
    }),
  );
}

// ---------------------------------------------------------------------------
// Team documents (via navigation filter on parent deal's team)
// ---------------------------------------------------------------------------

export type TeamDocumentStatus = 'outstanding' | 'received' | 'reviewed';

export interface TeamDocumentRow {
  id: string;
  name: string;
  dueDate: string | undefined;
  requestDate: string | undefined;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded: boolean;
  modifiedOn: string | undefined;
  status: TeamDocumentStatus;
  dealId: string | undefined;
  dealName: string | undefined;
}

function deriveDocStatus(opts: {
  reviewer: string | undefined;
  receivedDate: string | undefined;
  uploaded: boolean;
}): TeamDocumentStatus {
  if (opts.reviewer && opts.reviewer.trim().length > 0) return 'reviewed';
  if (opts.receivedDate || opts.uploaded) return 'received';
  return 'outstanding';
}

export async function loadTeamDocuments(teamId: string): Promise<TeamDocumentRow[]> {
  const result = await Cr664_documentchecklistsService.getAll({
    filter: [
      `cr664_Deal/_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team documents');
  }
  return (result.data ?? []).map((d): TeamDocumentRow => {
    const uploaded = d.cr664_uploadstatus === true;
    const status = deriveDocStatus({
      reviewer: d.cr664_reviewer,
      receivedDate: d.cr664_receiveddate,
      uploaded,
    });
    return {
      id: d.cr664_documentchecklistid,
      name: d.cr664_documentname,
      dueDate: d.cr664_duedate,
      requestDate: d.cr664_requestdate,
      receivedDate: d.cr664_receiveddate,
      reviewer: d.cr664_reviewer,
      uploaded,
      modifiedOn: d.modifiedon,
      status,
      dealId: d._cr664_deal_value,
      dealName: d.cr664_dealname,
    };
  });
}

// ---------------------------------------------------------------------------
// Team credit memos (via navigation filter on parent deal's team)
// ---------------------------------------------------------------------------

export type TeamMemoStatusKey = 'draft' | 'final' | 'stale';

export interface TeamMemoRow {
  id: string;
  name: string;
  statusKey: TeamMemoStatusKey | undefined;
  generatedAt: string;
  modifiedOn: string | undefined;
  dealId: string | undefined;
  dealName: string | undefined;
}

const MEMO_STATUS_MAP: Record<number, TeamMemoStatusKey> = {
  788190000: 'draft',
  788190001: 'final',
  788190002: 'stale',
};

function lookupMemoStatusTeam(v: unknown): TeamMemoStatusKey | undefined {
  if (typeof v === 'number') return MEMO_STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return MEMO_STATUS_MAP[Number(v)];
  return undefined;
}

/**
 * Credit memos whose parent deal's team matches the given team.
 * Same navigation-property filter pattern that loadTeamTasks /
 * loadTeamDocuments use. No banker / deal-id scoping needed — the
 * team FK on the parent deal is enough.
 */
export async function loadTeamMemos(teamId: string): Promise<TeamMemoRow[]> {
  const result = await Cr664_creditmemo1sService.getAll({
    filter: [
      `cr664_Deal/_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_generatedat desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team memos');
  }
  return (result.data ?? []).map(
    (m): TeamMemoRow => ({
      id: m.cr664_creditmemo1id,
      name: m.cr664_memoname,
      statusKey: lookupMemoStatusTeam(m.cr664_status),
      generatedAt: m.cr664_generatedat,
      modifiedOn: m.modifiedon,
      dealId: m._cr664_deal_value,
      dealName: m.cr664_dealname,
    }),
  );
}

// ---------------------------------------------------------------------------
// Shared derivation helpers (severity + aggregates)
// ---------------------------------------------------------------------------

export const STAGE_AGING_AT_RISK_DAYS = 30;
export const PAST_CLOSE_BLOCKED_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DealSeverity = 'blocked' | 'atRisk' | 'clear';

function parseDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function isPastDue(iso: string | undefined, now: Date = new Date()): boolean {
  const d = parseDate(iso);
  return !!d && d.getTime() < now.getTime();
}

export function daysInStage(deal: TeamDealRow, now: Date = new Date()): number | undefined {
  const d = parseDate(deal.stageEntryDate);
  if (!d) return undefined;
  return daysBetween(d, now);
}

export function dealSeverity(deal: TeamDealRow, now: Date = new Date()): DealSeverity {
  const target = parseDate(deal.targetCloseDate);
  if (target && target.getTime() < now.getTime()) {
    const overdueDays = daysBetween(target, now);
    if (overdueDays >= PAST_CLOSE_BLOCKED_DAYS) return 'blocked';
    return 'atRisk';
  }
  const days = daysInStage(deal, now);
  if (days != null && days > STAGE_AGING_AT_RISK_DAYS) return 'atRisk';
  return 'clear';
}

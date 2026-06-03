import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';

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

/**
 * Phase 128B — read a Dataverse
 * `@OData.Community.Display.V1.FormattedValue` annotation off a raw
 * record. Mirrors the manager-side `getFormattedValue` (Phase 125B)
 * and the banker-cockpit helper of the same name. The auto-generated
 * SDK exposes typed `<attr>name` shadow fields that the live env does
 * NOT populate for choice / lookup columns; the formatted value
 * Dataverse returns lives on the annotation key, which is a legal
 * JavaScript object key and arrives verbatim from the Web API.
 *
 * Kept local to the team module per the Phase 48 isolation rule
 * (src/team/ does not import from src/manager/). The duplication is
 * one accessor pattern, justified by the role-isolation invariant.
 */
function getFormattedValue(
  record: Record<string, unknown>,
  attributeName: string,
): string | undefined {
  const annotationKey = `${attributeName}@OData.Community.Display.V1.FormattedValue`;
  const value = record[annotationKey];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Lookup formatted value annotations hang off the `_<lookup>_value`
 * key, not the bare lookup name. e.g. cr664_StageReference's display
 * arrives as `_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue`.
 */
function getLookupFormattedValue(
  record: Record<string, unknown>,
  lookupLogicalName: string,
): string | undefined {
  return getFormattedValue(record, `_${lookupLogicalName}_value`);
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
  /** Phase 95: collateral summary forwarded into the Phase 73
   *  consistency check on the team rollup surface. Not rendered on
   *  any list/screen — only the rollup derivation reads it. */
  collateralSummary: string | undefined;
  /** Phase 128B — Product / Loan Structure / Pricing display names,
   *  resolved via the same formatted-value-first hydration the
   *  manager `loadTeamPipeline` uses, bringing the team pipeline row
   *  to parity with the manager TeamDeal. Optional so existing
   *  TeamDealRow literals (test fixtures, other team surfaces) do not
   *  need to enumerate them. Honest `undefined` when the deal has not
   *  yet pointed at a reference row. */
  productType?: string | undefined;
  loanStructure?: string | undefined;
  pricingType?: string | undefined;
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
  // Phase 128B — every lookup / status display column is resolved
  // via the same formatted-value-first → shadow-field fallback
  // pattern the manager `loadTeamPipeline` (Phase 125B) uses. Without
  // this the SDK returns undefined for clientName / stage / status /
  // banker in the operator's live env even when Maker Portal shows
  // them populated — the Team Ops Queue "Unknown banker / Client not
  // set / Stage not set / Status not set / Missing data = 1" bug this
  // phase fixes. This brings the team pipeline rows (consumed by the
  // Team Ops Queue snapshot + every other team surface) to label
  // parity with the manager / portfolio cockpits.
  return (result.data ?? []).map((d): TeamDealRow => {
    const raw = d as unknown as Record<string, unknown>;
    return {
      id: d.cr664_loandealid,
      name: d.cr664_dealname,
      clientName:
        getLookupFormattedValue(raw, 'cr664_client') ?? d.cr664_clientname,
      stage:
        getLookupFormattedValue(raw, 'cr664_stagereference') ??
        d.cr664_stagereferencename,
      status:
        getLookupFormattedValue(raw, 'cr664_statusreference') ??
        d.cr664_statusreferencename ??
        getFormattedValue(raw, 'statuscode') ??
        d.statuscodename,
      amount: d.cr664_amount,
      targetCloseDate: d.cr664_targetclosedate,
      stageEntryDate: d.cr664_stageentrydate,
      modifiedOn: d.modifiedon,
      assignedBankerId: d._cr664_assignedbanker_value,
      assignedBankerName:
        getLookupFormattedValue(raw, 'cr664_assignedbanker') ??
        d.cr664_assignedbankername ??
        d.owneridname,
      collateralSummary: d.cr664_collateralsummary,
      productType:
        getLookupFormattedValue(raw, 'cr664_producttypereference') ??
        d.cr664_producttypereferencename,
      loanStructure:
        getLookupFormattedValue(raw, 'cr664_loanstructuretypereference') ??
        d.cr664_loanstructuretypereferencename,
      pricingType:
        getLookupFormattedValue(raw, 'cr664_pricingtypereference') ??
        d.cr664_pricingtypereferencename,
    };
  });
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
  /** Phase 95: trimmed memo preview used by the Phase 73 consistency
   *  check on the rollup + morning-catch-up surfaces. */
  textPreview: string | undefined;
}

/**
 * Phase 95: per-deal credit memo draft section row scoped by team.
 * Mirrors `CreditMemoSectionItem` (label + preview only) by
 * structural typing.
 */
export interface TeamMemoSectionRow {
  id: string;
  dealId: string | undefined;
  sectionKey: string;
  sectionLabel: string;
  textPreview: string | undefined;
}

const TEAM_MEMO_TEXT_PREVIEW_MAX_CHARS = 240;

function teamMemoTextPreview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= TEAM_MEMO_TEXT_PREVIEW_MAX_CHARS) return trimmed;
  return trimmed.slice(0, TEAM_MEMO_TEXT_PREVIEW_MAX_CHARS).trimEnd() + '…';
}

function humanizeSectionKeyTeam(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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
 *
 * Phase 95: the row now carries `textPreview` (cr664_memotext capped
 * at 240 chars) so the Phase 73 consistency check can run on the
 * team rollup surface. Sections are loaded separately by
 * `loadTeamMemoSections`.
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
      textPreview: teamMemoTextPreview(m.cr664_memotext),
    }),
  );
}

/**
 * Phase 95: credit memo draft section rows scoped by team. Same
 * navigation-property filter as `loadTeamMemos`. Only a 240-char
 * preview is shipped, not the full draft text.
 */
export async function loadTeamMemoSections(
  teamId: string,
): Promise<TeamMemoSectionRow[]> {
  const result = await Cr664_creditmemodraftsectionsService.getAll({
    filter: [
      `cr664_Deal/_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_sectionkey asc'],
  });
  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to load team memo sections',
    );
  }
  return (result.data ?? []).map(
    (s): TeamMemoSectionRow => ({
      id: s.cr664_creditmemodraftsectionid,
      dealId: s._cr664_deal_value,
      sectionKey: s.cr664_sectionkey,
      sectionLabel: humanizeSectionKeyTeam(s.cr664_sectionkey),
      textPreview: teamMemoTextPreview(s.cr664_drafttext),
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

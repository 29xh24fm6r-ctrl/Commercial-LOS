import { Cr664_bankersService } from '../generated/services/Cr664_bankersService';
import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { buildTeamVisibilityFilter, buildTeamVisibilityFilterViaNavigation } from '../shared/deals/dealVisibilityScopes';
import { isTestOrSmokeDeal, operationalDeals } from '../shared/deals/testDealClassification';
import { Cr664_dealtask1sService } from '../generated/services/Cr664_dealtask1sService';
import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';
import { classifyLegacyDocumentStatus, isGovernedExcusedDocument } from '../deals/documentStatusClassification';
import { requirementStatusFromCode } from '../deals/documentRequirementStatusCodes';
import type { DocumentRequirementFields } from '../deals/documentRequirementFields';

/**
 * Schema reality (verified before coding — see Entity XML inspection
 * notes in phase 14 commit message):
 *
 *  - cr664_Banker.cr664_ManagerName is nvarchar free text, NOT a lookup
 *    -> no clean banker->manager FK in the schema yet
 *  - cr664_Banker.cr664_Team is a lookup to cr664_Team
 *  - cr664_LoanDeal.cr664_Team is a lookup to cr664_Team
 *  - cr664_Team has no team-lead / manager FK
 *
 * Decision: scope manager data by Team. "The manager's team" is a clean
 * server-side scope using existing lookups on both Banker and LoanDeal.
 * Cross-team manager relationships are not modeled in the schema yet —
 * when they are, this scoping should be revisited.
 *
 * The current user's manager identity is resolved by finding their
 * cr664_Banker record by UPN, exactly the same way BankerProvider does.
 * If they have no banker record OR their banker has no team, we fall
 * back to a clear "not configured" state rather than over-broadening
 * to all deals (per the phase-14 guardrail).
 */

export interface ManagerIdentity {
  bankerId: string;
  fullName: string;
  email: string;
  teamId: string;
  teamName: string;
}

export type ManagerIdentityResult =
  | { kind: 'ready'; identity: ManagerIdentity }
  | { kind: 'not-banker' }
  | { kind: 'no-team' }
  | { kind: 'failed'; message: string };

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Phase 125B — read a Dataverse
 * `@OData.Community.Display.V1.FormattedValue` annotation off a raw
 * record. Mirrors the Phase 122C banker-cockpit helper of the same
 * name. The auto-generated SDK exposes typed `<attr>name` shadow
 * fields that the live env does NOT populate for choice / lookup
 * columns; the formatted value Dataverse returns lives on the
 * annotation key, which is a legal JavaScript object key and arrives
 * verbatim from the Web API.
 *
 * Kept local to the manager module per the Phase 48 isolation rule
 * (src/manager/ does not import from src/deals/).
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

export async function loadManagerIdentity(upn: string): Promise<ManagerIdentityResult> {
  const bankersResult = await Cr664_bankersService.getAll({
    filter: `cr664_email eq '${escapeOData(upn)}'`,
    top: 1,
  });

  if (!bankersResult.success) {
    return {
      kind: 'failed',
      message: bankersResult.error?.message ?? 'Failed to load banker record',
    };
  }

  const banker = bankersResult.data?.[0];
  if (!banker) return { kind: 'not-banker' };

  const teamId = banker._cr664_team_value;
  if (!teamId) return { kind: 'no-team' };

  // Phase 125B — team name resolution priority (parity with the
  // Phase 122C banker-cockpit hydration order):
  //   1. lookup formatted value annotation on _cr664_team_value
  //   2. SDK-projected cr664_teamname shadow field (often empty in
  //      the live env even when the Banker.Team FK is populated —
  //      this is the live-screenshot bug we're fixing)
  //   3. undefined → preserve the legacy '(unnamed team)' display
  //      so callers don't crash, but no fake derivation from id.
  const bankerRaw = banker as unknown as Record<string, unknown>;
  const teamName =
    getLookupFormattedValue(bankerRaw, 'cr664_team') ??
    banker.cr664_teamname;

  return {
    kind: 'ready',
    identity: {
      bankerId: banker.cr664_bankerid,
      fullName: banker.cr664_fullname,
      email: banker.cr664_email ?? upn,
      teamId,
      teamName: teamName ?? '(unnamed team)',
    },
  };
}

export interface TeamDeal {
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
  /** Phase 95: collateral summary, forwarded into the Phase 73
   *  consistency check on the manager rollup + morning-catch-up
   *  surfaces. Not rendered on any list/screen — only the rollup
   *  derivation reads it. */
  collateralSummary: string | undefined;
  /** Phase 125B — Product / Loan Structure / Pricing display names
   *  resolved via the same formatted-value-first hydration the
   *  banker cockpit uses. Honest `undefined` when the deal has not
   *  yet pointed at a reference row. */
  productType: string | undefined;
  loanStructure: string | undefined;
  pricingType: string | undefined;
  /** N-17 follow-on (Final LOS Completion arc) — governed cr664_istestrecord classification,
   *  resolved the same way the banker pipeline resolves it (explicit field wins, name convention
   *  is the fallback). Previously this row shape omitted the field entirely, so operationalDeals()
   *  below always fell through to name-only matching regardless of an admin's explicit classification.
   *  Optional so existing TeamDeal literals (test fixtures, other manager surfaces) do not need to
   *  enumerate it; omitting it falls back to name-only matching, same as before. */
  isTestRecord?: boolean;
}

/**
 * Active, non-terminal deals scoped to the given team. Uses the same
 * conservative filter as BankerProvider's pipeline (statecode eq 0,
 * isterminalstatus eq false/null) so the manager only sees deals that
 * are operationally in-flight.
 *
 * Ordered by target close date asc so the closing-forecast and
 * at-risk computations can stream from the same ordered list.
 */
export interface LoadTeamPipelineOptions {
  /**
   * P0-4 — the team's member banker ids. When supplied, the scope ALSO includes active deals
   * assigned to any of these bankers even if their Owning Team was skipped, so a legitimate deal
   * never disappears from Manager oversight (see dealVisibilityScopes). Omitted = team-owned only
   * (backwards-compatible).
   */
  readonly memberBankerIds?: readonly string[];
  /**
   * Remediation 2026-07-22 (Workstream A/N) — admin-only escape hatch to include TEST/SMOKE/QA
   * deals. Default false: this is the canonical team pipeline every Manager/Team/Portfolio view
   * derives from, so it must apply the same operational exclusion the Banker pipeline already
   * does (loadBankerPipeline) — otherwise Manager/Team counts disagree with Banker counts by
   * exactly the population of test deals.
   */
  readonly includeTestDeals?: boolean;
}

export async function loadTeamPipeline(
  teamId: string,
  options: LoadTeamPipelineOptions = {},
): Promise<TeamDeal[]> {
  const result = await Cr664_loandealsService.getAll({
    filter: buildTeamVisibilityFilter(teamId, { memberBankerIds: options.memberBankerIds }),
    orderBy: ['cr664_targetclosedate asc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team pipeline');
  }

  // Phase 125B — every lookup / status display column is resolved
  // via the same formatted-value-first → shadow-field fallback
  // pattern Phase 122C uses on the banker cockpit. Without this the
  // SDK returns undefined for clientName / stage / status / banker
  // in the operator's live env even when Maker Portal shows them
  // populated, which is the live-screenshot bug fixed here.
  const mapped = (result.data ?? []).map((d): TeamDeal => {
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
      isTestRecord: isTestOrSmokeDeal({
        name: d.cr664_dealname,
        isTestRecord: raw['cr664_istestrecord'] as boolean | undefined,
      }),
    };
  });
  return [...operationalDeals(mapped, { includeTest: options.includeTestDeals === true })];
}

export interface TeamBanker {
  id: string;
  fullName: string;
  email: string | undefined;
  roleType: string | undefined;
  active: boolean;
}

/**
 * Active bankers on the given team. Used for the workload-summary card
 * to enumerate everyone on the team (so a banker with zero deals still
 * shows as 0 of N, rather than disappearing).
 */
export async function loadTeamBankers(teamId: string): Promise<TeamBanker[]> {
  const result = await Cr664_bankersService.getAll({
    filter: [
      `_cr664_team_value eq ${teamId}`,
      `statecode eq 0`,
    ].join(' and '),
    orderBy: ['cr664_fullname asc'],
  });

  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team bankers');
  }

  return (result.data ?? []).map(
    (b): TeamBanker => ({
      id: b.cr664_bankerid,
      fullName: b.cr664_fullname,
      email: b.cr664_email,
      roleType: b.cr664_roletypename,
      active: b.cr664_activeflag !== false,
    }),
  );
}

// ---------------------------------------------------------------------------
// Phase 87 — manager-scoped child data (tasks, documents, memos)
//
// These three loaders broaden manager Autopilot rollup signal coverage
// from Phase 81's 4-of-8 signals (deal-record fields only). With
// Phase 95 adding a sections loader + memo textPreview, the manager
// rollup now matches the full Phase 80 signal set (8 of 8 including
// memo-consistency-findings).
//
// Authorization boundary:
//   Each loader scopes children by their PARENT deal's team FK, OR by the
//   parent deal's assigned banker being a member of this team (N-03,
//   Production Remediation Factory Arc Phase 2 — buildTeamVisibilityFilterViaNavigation).
//   The manager's teamId is resolved once by loadManagerIdentity through the
//   banker-row lookup; this now matches loadTeamPipeline's own P0-4 fallback
//   exactly, instead of silently narrower. Before this fix, a deal with an
//   assigned banker but no Owning Team (reachable at New Deal create, where
//   cr664_Team is optional) appeared in the team's deal list via the
//   fallback while its tasks/documents/memos never did — the confirmed root
//   cause of "a newly created deal's task is invisible in Manager/Team
//   Workspace even though the deal itself is visible."
//
//   The pattern duplicates the team workspace's child-data filter
//   (src/team/teamQueries.ts loadTeamTasks / loadTeamDocuments /
//   loadTeamMemos) by design — Phase 48 isolation prohibits
//   src/manager/ from importing src/team/ and vice versa. The
//   duplication is one OData filter pattern, justified by the role-
//   isolation invariant, and pinned by tests.
//
//   No bypass: the manager NEVER calls loadDealTasks / loadDealDocuments
//   / loadDealCreditMemo from src/deals/ (those are banker-scoped,
//   per-deal loaders authorized by loadDealForBanker).
// ---------------------------------------------------------------------------

const MEMO_TEXT_PREVIEW_MAX_CHARS = 240;

function memoTextPreview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= MEMO_TEXT_PREVIEW_MAX_CHARS) return trimmed;
  return trimmed.slice(0, MEMO_TEXT_PREVIEW_MAX_CHARS).trimEnd() + '…';
}

function humanizeSectionKey(key: string): string {
  const spaced = key
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export interface TeamScopedTask {
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
 * Open (non-terminal) tasks whose parent deal sits on the manager's team, OR
 * whose parent deal is assigned to one of the team's member bankers (N-03
 * Owning-Team fallback — see the module header). Uses the OData
 * navigation-property filter on the parent's team/assigned-banker lookups;
 * same approach `loadTeamTasks` uses on the team workspace.
 */
export async function loadManagerTeamTasks(
  teamId: string,
  memberBankerIds?: readonly string[],
): Promise<TeamScopedTask[]> {
  const result = await Cr664_dealtask1sService.getAll({
    filter: buildTeamVisibilityFilterViaNavigation('cr664_Deal', teamId, { memberBankerIds }),
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team tasks');
  }
  return (result.data ?? []).map(
    (t): TeamScopedTask => ({
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

export type TeamScopedDocumentStatus = 'outstanding' | 'received' | 'reviewed';

export interface TeamScopedDocument {
  id: string;
  name: string;
  dueDate: string | undefined;
  requestDate: string | undefined;
  receivedDate: string | undefined;
  reviewer: string | undefined;
  uploaded: boolean;
  modifiedOn: string | undefined;
  status: TeamScopedDocumentStatus;
  dealId: string | undefined;
  dealName: string | undefined;
}

// Remediation 2026-07-22 (Workstream G) — delegates to
// documentStatusClassification.ts, the one canonical rule shared with
// dealDocumentQueries.ts / workQueueQueries.ts / teamQueries.ts.
const deriveDocStatus = classifyLegacyDocumentStatus;

/**
 * Document checklist rows whose parent deal sits on the manager's team, OR
 * whose parent deal is assigned to one of the team's member bankers (N-03
 * Owning-Team fallback). The `status` field is derived client-side from the
 * same (reviewer / receivedDate / uploaded) inputs `loadTeamDocuments`
 * uses — the rollup derivation buckets by status.
 */
export async function loadManagerTeamDocuments(
  teamId: string,
  memberBankerIds?: readonly string[],
): Promise<TeamScopedDocument[]> {
  const result = await Cr664_documentchecklistsService.getAll({
    filter: buildTeamVisibilityFilterViaNavigation('cr664_Deal', teamId, { memberBankerIds }),
    orderBy: ['cr664_duedate asc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team documents');
  }
  // Remediation 2026-07-22 (Workstream G) — exclude documents the Document
  // Requirement workspace has Waived or marked Not Applicable; they persist
  // no reviewer/receivedDate/upload and would otherwise be miscounted as
  // "outstanding" in the manager rollup (see documentStatusClassification.ts).
  return (result.data ?? [])
    .filter((d) => {
      const raw = d as unknown as DocumentRequirementFields;
      return !isGovernedExcusedDocument({
        waived: raw.cr664_waived,
        requirementStatus: requirementStatusFromCode(raw.cr664_requirementstatus),
      });
    })
    .map((d): TeamScopedDocument => {
      const uploaded = d.cr664_uploadstatus === true;
      return {
        id: d.cr664_documentchecklistid,
        name: d.cr664_documentname,
        dueDate: d.cr664_duedate,
        requestDate: d.cr664_requestdate,
        receivedDate: d.cr664_receiveddate,
        reviewer: d.cr664_reviewer,
        uploaded,
        modifiedOn: d.modifiedon,
        status: deriveDocStatus({
          reviewer: d.cr664_reviewer,
          receivedDate: d.cr664_receiveddate,
          uploaded,
        }),
        dealId: d._cr664_deal_value,
        dealName: d.cr664_dealname,
      };
    });
}

export type TeamScopedMemoStatusKey = 'draft' | 'final' | 'stale';

export interface TeamScopedMemo {
  id: string;
  name: string;
  statusKey: TeamScopedMemoStatusKey | undefined;
  generatedAt: string;
  modifiedOn: string | undefined;
  dealId: string | undefined;
  dealName: string | undefined;
  /** Phase 95: trimmed preview of the memo body (cr664_memotext)
   *  used by the Phase 73 consistency check on the rollup +
   *  morning-catch-up surfaces. */
  textPreview: string | undefined;
}

/**
 * Phase 95: per-deal credit memo draft section row for the manager
 * surface. Mirrors `CreditMemoSectionItem` by structural typing.
 */
export interface TeamScopedMemoSection {
  id: string;
  dealId: string | undefined;
  sectionKey: string;
  sectionLabel: string;
  textPreview: string | undefined;
}

const MEMO_STATUS_MAP: Record<number, TeamScopedMemoStatusKey> = {
  788190000: 'draft',
  788190001: 'final',
  788190002: 'stale',
};

function lookupMemoStatus(v: unknown): TeamScopedMemoStatusKey | undefined {
  if (typeof v === 'number') return MEMO_STATUS_MAP[v];
  if (typeof v === 'string' && /^\d+$/.test(v)) return MEMO_STATUS_MAP[Number(v)];
  return undefined;
}

/**
 * Credit memo rows whose parent deal sits on the manager's team, OR whose
 * parent deal is assigned to one of the team's member bankers (N-03
 * Owning-Team fallback). Phase 95: the row now carries `textPreview`
 * (cr664_memotext capped at 240 chars) so the Phase 73 consistency check
 * can run on the manager rollup + morning-catch-up surfaces. Sections are
 * loaded separately by `loadManagerTeamMemoSections`.
 */
export async function loadManagerTeamMemos(
  teamId: string,
  memberBankerIds?: readonly string[],
): Promise<TeamScopedMemo[]> {
  const result = await Cr664_creditmemo1sService.getAll({
    filter: buildTeamVisibilityFilterViaNavigation('cr664_Deal', teamId, { memberBankerIds }),
    orderBy: ['cr664_generatedat desc'],
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load team memos');
  }
  return (result.data ?? []).map(
    (m): TeamScopedMemo => ({
      id: m.cr664_creditmemo1id,
      name: m.cr664_memoname,
      statusKey: lookupMemoStatus(m.cr664_status),
      generatedAt: m.cr664_generatedat,
      modifiedOn: m.modifiedon,
      dealId: m._cr664_deal_value,
      dealName: m.cr664_dealname,
      textPreview: memoTextPreview(m.cr664_memotext),
    }),
  );
}

/**
 * Phase 95: credit memo draft section rows whose parent deal sits on the
 * manager's team, OR whose parent deal is assigned to one of the team's
 * member bankers (N-03 Owning-Team fallback). Same scope pattern the
 * memos / tasks / documents loaders use. The full draft text isn't shipped
 * — only a 240-char preview — to keep the payload small. The Phase 73
 * consistency check is text-based but compares against short structured
 * deal field values, so the truncated preview is sufficient for its checks.
 */
export async function loadManagerTeamMemoSections(
  teamId: string,
  memberBankerIds?: readonly string[],
): Promise<TeamScopedMemoSection[]> {
  const result = await Cr664_creditmemodraftsectionsService.getAll({
    filter: buildTeamVisibilityFilterViaNavigation('cr664_Deal', teamId, { memberBankerIds }),
    orderBy: ['cr664_sectionkey asc'],
  });
  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to load team memo sections',
    );
  }
  return (result.data ?? []).map(
    (s): TeamScopedMemoSection => ({
      id: s.cr664_creditmemodraftsectionid,
      dealId: s._cr664_deal_value,
      sectionKey: s.cr664_sectionkey,
      sectionLabel: humanizeSectionKey(s.cr664_sectionkey),
      textPreview: memoTextPreview(s.cr664_drafttext),
    }),
  );
}

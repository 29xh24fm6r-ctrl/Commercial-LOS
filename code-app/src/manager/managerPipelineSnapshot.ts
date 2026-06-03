import type {
  TeamDeal,
  TeamBanker,
  TeamScopedTask,
  TeamScopedDocument,
} from './managerQueries';
import type { DealDetail } from '../deals/dealQueries';
import type {
  DealTask,
  DealTasksResult,
} from '../deals/dealTaskQueries';
import type {
  DealDocument,
  DealDocumentsResult,
} from '../deals/dealDocumentQueries';
import {
  deriveDealCockpitMetrics,
} from '../deals/dealCockpitMetrics';
import {
  deriveBlockers,
  type BlockerSignal,
  type BlockersResult,
} from '../deals/blockerRules';
import {
  deriveDealIntelligenceViewModel,
  type DealIntelligenceViewModel,
} from '../shared/dealIntelligenceViewModel';

/**
 * Phase 124A — Manager pipeline snapshot deriver.
 *
 * Pure function that projects the already-authorized manager data
 * (team-scoped pipeline + bankers + tasks + documents) into the
 * single shape the Bloomberg Control Panel renders. Discipline carried
 * over from every other deriver in this codebase:
 *
 *   - Inputs are the typed, already-authorized records returned by
 *     ManagerDataProvider's loaders. The function never reads from
 *     Dataverse, never calls a service, never writes anything.
 *   - Outputs are projected from typed-field presence/values. Missing
 *     fields surface as `undefined`, zero counts, or honest-missing
 *     classification — never as fabricated defaults.
 *   - Per-deal classification routes through the SAME shared
 *     `deriveDealIntelligenceViewModel` the banker cockpit consumes
 *     (Phase 123A). Manager rollup and banker cockpit converge on
 *     one source of truth for blocker / nextBestAction / missing
 *     fields.
 *   - No predictive language. No deal score. The "exception tape"
 *     is a mechanical classification — blocker status from the
 *     existing `deriveBlockers` pipeline, missing-fields from the
 *     existing PROFILE_COMPLETENESS_FIELDS catalog, stale-activity
 *     from the deal's `modifiedOn` timestamp.
 *
 * Permission-before-render: the caller (Bloomberg Control Panel)
 * mounts only inside ManagerProvider + ManagerDataProvider, both of
 * which authorize the manager's team scope. This deriver does not
 * re-check authorization — by contract it only receives records the
 * caller is allowed to display.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagerPipelineCommandStrip {
  /** Count of authorized active deals on the team. */
  activeDealCount: number;
  /** Sum of populated deal amounts. Missing amounts contribute 0. */
  totalPipelineAmount: number;
  /** Distinct count of deals with at least one missing required field. */
  missingDataCount: number;
  /** Distinct count of deals whose blocker status is 'blocked' or 'at-risk'. */
  blockerAtRiskCount: number;
  /** Distinct count of deals whose blocker status is 'blocked'. */
  blockedDealCount: number;
  /** Distinct count of deals whose blocker status is 'at-risk'. */
  atRiskDealCount: number;
  /** Total outstanding documents across all team-scoped deals. */
  outstandingDocumentCount: number;
  /** Total open (non-completed) tasks across all team-scoped deals. */
  openTaskCount: number;
  /** Total open tasks past their due date (now-relative). */
  overdueTaskCount: number;
  /** Distinct count of deals not modified within MANAGER_STALE_DEAL_DAYS. */
  staleDealCount: number;
  /**
   * Count of deals with targetCloseDate within the next 30 days
   * (inclusive of today, exclusive of dates already past).
   */
  closingNext30DayCount: number;
  /**
   * Sum of populated amounts on deals closing in the next 30 days.
   * Missing amounts contribute 0.
   */
  closingNext30DayAmount: number;
  /**
   * Mean days-in-stage across deals with a populated stageEntryDate.
   * `undefined` when no deal has a stageEntryDate (honest absence —
   * the dashboard renders 'Not yet wired' instead of 0).
   */
  avgDaysInStage: number | undefined;
}

export type ManagerExceptionSeverity = 'blocked' | 'at-risk' | 'missing' | 'stale';

export interface ManagerExceptionRow {
  dealId: string;
  dealName: string;
  /** Banker assigned, or undefined if unset on the deal. */
  bankerName: string | undefined;
  /** Loan amount, or undefined if unset. */
  amount: number | undefined;
  /** Severity classification. */
  severity: ManagerExceptionSeverity;
  /** Short reason this row was surfaced. Always honest — derived
   *  from the blocker / missing-field / staleness signal that fired. */
  reason: string;
}

export interface ManagerExceptionTape {
  /** Deals whose blockers pipeline reports 'blocked'. Top blocker
   *  signal label provided as the reason. */
  blocked: ManagerExceptionRow[];
  /** Deals whose blockers pipeline reports 'at-risk' (and are NOT
   *  also blocked). Top at-risk signal label provided as the reason. */
  atRisk: ManagerExceptionRow[];
  /** Deals with at least one PROFILE_COMPLETENESS missing field that
   *  are NOT already surfaced as blocked / at-risk. Count of missing
   *  fields provided as the reason. */
  missingFields: ManagerExceptionRow[];
  /** Deals not touched (modifiedOn) within MANAGER_STALE_DEAL_DAYS
   *  that are NOT already surfaced elsewhere. Days-since-modified
   *  provided as the reason. */
  stale: ManagerExceptionRow[];
}

export interface BankerWorkloadRow {
  /** Banker id, or '__unassigned__' for the synthetic catch-all row
   *  that aggregates deals whose assignedBankerId is undefined. */
  bankerId: string;
  /** Display name. The synthetic catch-all row uses 'Unassigned'. */
  bankerName: string;
  /** Count of deals assigned to this banker on this team. */
  activeDealCount: number;
  /** Sum of populated amounts for this banker's deals. */
  totalAmount: number;
  /** Open tasks across this banker's deals. */
  openTaskCount: number;
  /** Outstanding documents across this banker's deals. */
  outstandingDocumentCount: number;
  /** Distinct count of this banker's deals classified blocked / at-risk. */
  atRiskCount: number;
}

export interface ManagerTopDealRow {
  dealId: string;
  dealName: string;
  clientName: string | undefined;
  stage: string | undefined;
  status: string | undefined;
  bankerName: string | undefined;
  amount: number | undefined;
  /** Shared-VM blocker classification ('blocked'|'at-risk'|'clear') for the deal. */
  blockerStatus: DealIntelligenceViewModel['blockerStatus'];
  /** Shared-VM mechanical next-best-action when one fires. May be undefined. */
  nextBestAction: DealIntelligenceViewModel['nextBestAction'];
}

export interface ManagerPipelineSnapshot {
  commandStrip: ManagerPipelineCommandStrip;
  exceptionTape: ManagerExceptionTape;
  bankerWorkload: BankerWorkloadRow[];
  topDeals: ManagerTopDealRow[];
  /** True when there are zero authorized active deals on this team.
   *  Lets the cockpit render the honest "no records" empty state
   *  instead of an all-zero KPI strip. */
  isEmpty: boolean;
  /**
   * Per-deal projected rows — exposed for Phase 125A chart helpers
   * that need to slice + count over the same authorized records the
   * snapshot already derived. Each row carries the projected VM
   * (with loader-gap signals muted) plus the manager-scoped missing
   * fields list + per-deal open/overdue task counts + outstanding
   * document count, so chart derivers do not re-run any IO.
   */
  vmRows: ReadonlyArray<ManagerVMRow>;
}

/**
 * Per-deal row consumed by the Phase 125A chart helpers. Identical
 * to the internal VMRow shape — exposed so a chart deriver can
 * iterate without re-projecting through deriveBlockers /
 * deriveDealCockpitMetrics / deriveDealIntelligenceViewModel.
 */
export interface ManagerVMRow {
  teamDeal: TeamDeal;
  vm: DealIntelligenceViewModel;
  openTaskCount: number;
  overdueTaskCount: number;
  outstandingDocumentCount: number;
  managerMissingFieldLabels: ReadonlyArray<string>;
}

export interface ManagerPipelineSnapshotInput {
  teamPipeline: ReadonlyArray<TeamDeal>;
  teamBankers: ReadonlyArray<TeamBanker>;
  teamTasks: ReadonlyArray<TeamScopedTask>;
  teamDocuments: ReadonlyArray<TeamScopedDocument>;
  /** Injectable now so date-sensitive classifications (overdue,
   *  staleness) are reproducible under test. Default `new Date()`. */
  now?: Date;
  /** Cap on the topDeals list. Default 5. */
  topN?: number;
}

/**
 * Days since `modifiedOn` above which a deal joins the 'stale' bucket
 * of the exception tape. Matches the banker cockpit's staleness
 * threshold (Phase 123A STALE_ACTIVITY_DAYS) so manager + banker
 * surfaces agree on what 'stale' means.
 */
export const MANAGER_STALE_DEAL_DAYS = 14;

/** Default cap on the topDeals list rendered in the cockpit. */
export const DEFAULT_TOP_DEALS = 5;

/**
 * Manager-scoped "required fields" — the subset of operational fields
 * the team-pipeline loader actually returns. The 4-field check the
 * banker blocker pipeline uses (`amount` / `targetCloseDate` /
 * `clientName` / `productType`) cannot run cleanly here because the
 * team-pipeline query does NOT load `productType` (Phase 14 cost
 * decision); using the banker check unaltered would mis-fire
 * 'missing-required' on every team deal. The manager check defines
 * what "incomplete data" means for fields the manager surface
 * actually has visibility into.
 */
const MANAGER_REQUIRED_TEAM_FIELDS: ReadonlyArray<{
  key: keyof TeamDeal;
  label: string;
}> = [
  { key: 'clientName', label: 'Client' },
  { key: 'amount', label: 'Loan amount' },
  { key: 'targetCloseDate', label: 'Target close' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'assignedBankerName', label: 'Banker' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

export function deriveManagerPipelineSnapshot(
  input: ManagerPipelineSnapshotInput,
): ManagerPipelineSnapshot {
  const now = input.now ?? new Date();
  const topN = input.topN ?? DEFAULT_TOP_DEALS;

  // Group tasks / documents by parent deal id once so per-deal lookups
  // are O(1) rather than O(deals × items).
  const tasksByDeal = groupByDealId(input.teamTasks);
  const docsByDeal = groupByDealId(input.teamDocuments);

  // Project every authorized deal through the SHARED Phase-123A
  // dealIntelligenceViewModel so the manager rollup converges with
  // the banker cockpit on per-deal classification.
  const vmRows: VMRow[] = input.teamPipeline.map((td) =>
    projectTeamDealToVM(td, tasksByDeal.get(td.id) ?? [], docsByDeal.get(td.id) ?? [], now),
  );

  const commandStrip = buildCommandStrip(vmRows, now);
  const exceptionTape = buildExceptionTape(vmRows, now);
  const bankerWorkload = buildBankerWorkload(input.teamBankers, vmRows);
  const topDeals = buildTopDeals(vmRows, topN);

  return {
    commandStrip,
    exceptionTape,
    bankerWorkload,
    topDeals,
    isEmpty: input.teamPipeline.length === 0,
    vmRows,
  };
}

// ---------------------------------------------------------------------------
// Per-deal VM projection
// ---------------------------------------------------------------------------

interface VMRow {
  teamDeal: TeamDeal;
  vm: DealIntelligenceViewModel;
  openTaskCount: number;
  /** Phase 124E — open tasks past their due date (now-relative). */
  overdueTaskCount: number;
  outstandingDocumentCount: number;
  /** Manager-scoped missing-fields list (see MANAGER_REQUIRED_TEAM_FIELDS). */
  managerMissingFieldLabels: ReadonlyArray<string>;
}

function projectTeamDealToVM(
  td: TeamDeal,
  tasks: TeamScopedTask[],
  docs: TeamScopedDocument[],
  now: Date,
): VMRow {
  const deal = teamDealToDealDetail(td);
  const tasksResult = teamScopedTasksToDealTasksResult(tasks);
  const documentsResult = teamScopedDocumentsToDealDocumentsResult(docs);

  // creditMemo + activity are not loaded at the team-scoped level for
  // this phase — undefined is the honest input. The metrics deriver
  // already understands the undefined contract.
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

  // deriveBlockers always fires `missing-required` on team-pipeline
  // rows because the loader doesn't fetch productType (Phase 14 cost
  // decision); strip that one signal before handing the result to the
  // shared VM so the manager rollup's "blocker" classification
  // reflects real operational signals (past-target-close, stale-stage,
  // overdue-tasks, overdue-documents) and not the loader gap. The
  // manager-scoped missing-fields list below is the honest manager
  // surface for that concept.
  const rawBlockers = deriveBlockers(deal, tasksResult, documentsResult, now);
  const blockers = filterOutLoaderGapSignals(rawBlockers);
  const rawVm = deriveDealIntelligenceViewModel({ deal, metrics, blockers });
  const vm = muteLoaderGapNextBestAction(rawVm);

  // Overdue = open task whose dueDate has parsed and is in the past.
  let overdueTaskCount = 0;
  for (const t of tasksResult.open) {
    if (!t.dueDate) continue;
    const due = new Date(t.dueDate).getTime();
    if (!Number.isNaN(due) && due < now.getTime()) {
      overdueTaskCount += 1;
    }
  }

  return {
    teamDeal: td,
    vm,
    openTaskCount: tasksResult.open.length,
    overdueTaskCount,
    outstandingDocumentCount: documentsResult.outstanding.length,
    managerMissingFieldLabels: managerMissingFieldLabels(td),
  };
}

function muteLoaderGapNextBestAction(
  vm: DealIntelligenceViewModel,
): DealIntelligenceViewModel {
  // The VM's `populate-missing-fields` next-best-action would fire on
  // every team-pipeline projection because the team loader does not
  // fetch the 13-field profile-completeness catalog (Phase 14 cost
  // decision). The manager-scoped missing-fields list on the
  // exception tape is the honest manager surface for that concept;
  // muting the VM-side signal keeps the cockpit's "Next best action"
  // column truthful — it only surfaces signals that are real for
  // fields the manager loader actually has visibility into
  // (resolve-blocker / open-overdue-tasks / follow-up-documents).
  if (vm.nextBestAction?.id === 'populate-missing-fields') {
    return { ...vm, nextBestAction: undefined };
  }
  return vm;
}

function filterOutLoaderGapSignals(blockers: BlockersResult): BlockersResult {
  const signals = blockers.signals.filter((s) => s.id !== 'missing-required');
  const status = signals.some((s) => s.severity === 'blocked')
    ? 'blocked'
    : signals.length > 0
      ? 'at-risk'
      : 'clear';
  return { status, signals, closedDealNote: blockers.closedDealNote };
}

function managerMissingFieldLabels(td: TeamDeal): ReadonlyArray<string> {
  const missing: string[] = [];
  for (const f of MANAGER_REQUIRED_TEAM_FIELDS) {
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

// The TeamDeal shape is a strict subset of DealDetail (Phase 122
// loader output minus fields the team-pipeline query does not pull).
// Fields the pipeline does NOT expose surface as undefined — honest
// absence. The team-pipeline query filters out terminal deals via
// `cr664_isterminalstatus eq false or null` and `statecode eq 0`, so
// all loaded deals are open; isClosed is therefore false by contract.
function teamDealToDealDetail(td: TeamDeal): DealDetail {
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

function teamScopedTasksToDealTasksResult(
  tasks: ReadonlyArray<TeamScopedTask>,
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

function teamScopedDocumentsToDealDocumentsResult(
  docs: ReadonlyArray<TeamScopedDocument>,
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

function groupByDealId<T extends { dealId: string | undefined }>(
  items: ReadonlyArray<T>,
): Map<string, T[]> {
  const byId = new Map<string, T[]>();
  for (const item of items) {
    if (!item.dealId) continue;
    const bucket = byId.get(item.dealId);
    if (bucket) bucket.push(item);
    else byId.set(item.dealId, [item]);
  }
  return byId;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildCommandStrip(
  rows: ReadonlyArray<VMRow>,
  now: Date,
): ManagerPipelineCommandStrip {
  let totalPipelineAmount = 0;
  let missingDataCount = 0;
  let blockerAtRiskCount = 0;
  let blockedDealCount = 0;
  let atRiskDealCount = 0;
  let outstandingDocumentCount = 0;
  let openTaskCount = 0;
  let overdueTaskCount = 0;
  let staleDealCount = 0;
  let closingNext30DayCount = 0;
  let closingNext30DayAmount = 0;
  let stageDaysSum = 0;
  let stageDaysCount = 0;

  const closeHorizonMs = 30 * MS_PER_DAY;

  for (const r of rows) {
    if (typeof r.teamDeal.amount === 'number' && Number.isFinite(r.teamDeal.amount)) {
      totalPipelineAmount += r.teamDeal.amount;
    }
    if (r.managerMissingFieldLabels.length > 0) missingDataCount += 1;
    if (r.vm.blockerStatus === 'blocked') {
      blockedDealCount += 1;
      blockerAtRiskCount += 1;
    } else if (r.vm.blockerStatus === 'at-risk') {
      atRiskDealCount += 1;
      blockerAtRiskCount += 1;
    }
    outstandingDocumentCount += r.outstandingDocumentCount;
    openTaskCount += r.openTaskCount;
    overdueTaskCount += r.overdueTaskCount;
    const daysStale = daysSince(r.teamDeal.modifiedOn, now);
    if (daysStale !== undefined && daysStale >= MANAGER_STALE_DEAL_DAYS) {
      staleDealCount += 1;
    }
    // Closing-next-30: targetCloseDate within [now, now + 30d]. Past
    // dates are NOT counted (they belong on the blocker/at-risk
    // signal). Missing dates are NOT counted.
    if (r.teamDeal.targetCloseDate) {
      const tc = new Date(r.teamDeal.targetCloseDate).getTime();
      if (!Number.isNaN(tc)) {
        const delta = tc - now.getTime();
        if (delta >= 0 && delta <= closeHorizonMs) {
          closingNext30DayCount += 1;
          if (
            typeof r.teamDeal.amount === 'number' &&
            Number.isFinite(r.teamDeal.amount)
          ) {
            closingNext30DayAmount += r.teamDeal.amount;
          }
        }
      }
    }
    // Avg days in stage — only counted when stageEntryDate parses.
    const daysInStage = daysSince(r.teamDeal.stageEntryDate, now);
    if (daysInStage !== undefined && daysInStage >= 0) {
      stageDaysSum += daysInStage;
      stageDaysCount += 1;
    }
  }

  const avgDaysInStage =
    stageDaysCount === 0 ? undefined : Math.round(stageDaysSum / stageDaysCount);

  return {
    activeDealCount: rows.length,
    totalPipelineAmount,
    missingDataCount,
    blockerAtRiskCount,
    blockedDealCount,
    atRiskDealCount,
    outstandingDocumentCount,
    openTaskCount,
    overdueTaskCount,
    staleDealCount,
    closingNext30DayCount,
    closingNext30DayAmount,
    avgDaysInStage,
  };
}

function buildExceptionTape(
  rows: ReadonlyArray<VMRow>,
  now: Date,
): ManagerExceptionTape {
  const blocked: ManagerExceptionRow[] = [];
  const atRisk: ManagerExceptionRow[] = [];
  const missingFields: ManagerExceptionRow[] = [];
  const stale: ManagerExceptionRow[] = [];

  for (const r of rows) {
    const id = r.teamDeal.id;
    const base = {
      dealId: id,
      dealName: r.teamDeal.name,
      bankerName: r.teamDeal.assignedBankerName,
      amount: r.teamDeal.amount,
    };

    if (r.vm.blockerStatus === 'blocked') {
      const top = topBlockerSignal(r.vm.blockerSignals, 'blocked');
      blocked.push({
        ...base,
        severity: 'blocked',
        reason: top?.label ?? 'Blocker pipeline reports blocked status.',
      });
      continue;
    }
    if (r.vm.blockerStatus === 'at-risk') {
      const top = topBlockerSignal(r.vm.blockerSignals, 'at-risk');
      atRisk.push({
        ...base,
        severity: 'at-risk',
        reason: top?.label ?? 'Blocker pipeline reports at-risk status.',
      });
      continue;
    }
    if (r.managerMissingFieldLabels.length > 0) {
      missingFields.push({
        ...base,
        severity: 'missing',
        reason: managerMissingReason(r.managerMissingFieldLabels),
      });
      continue;
    }
    const daysStale = daysSince(r.teamDeal.modifiedOn, now);
    if (daysStale !== undefined && daysStale >= MANAGER_STALE_DEAL_DAYS) {
      stale.push({
        ...base,
        severity: 'stale',
        reason: `No record activity in ${daysStale} day(s).`,
      });
      continue;
    }
  }

  return { blocked, atRisk, missingFields, stale };
}

function buildBankerWorkload(
  bankers: ReadonlyArray<TeamBanker>,
  rows: ReadonlyArray<VMRow>,
): BankerWorkloadRow[] {
  type Acc = {
    bankerId: string;
    bankerName: string;
    activeDealCount: number;
    totalAmount: number;
    openTaskCount: number;
    outstandingDocumentCount: number;
    atRiskCount: number;
  };
  const empty = (bankerId: string, bankerName: string): Acc => ({
    bankerId,
    bankerName,
    activeDealCount: 0,
    totalAmount: 0,
    openTaskCount: 0,
    outstandingDocumentCount: 0,
    atRiskCount: 0,
  });

  const accByBanker = new Map<string, Acc>();
  for (const b of bankers) {
    accByBanker.set(b.id, empty(b.id, b.fullName));
  }
  const unassignedKey = '__unassigned__';

  for (const r of rows) {
    const id = r.teamDeal.assignedBankerId;
    const name = r.teamDeal.assignedBankerName;
    let acc: Acc;
    if (id) {
      const existing = accByBanker.get(id);
      acc = existing ?? empty(id, name ?? id);
      if (!existing) accByBanker.set(id, acc);
    } else {
      const existing = accByBanker.get(unassignedKey);
      acc = existing ?? empty(unassignedKey, 'Unassigned');
      if (!existing) accByBanker.set(unassignedKey, acc);
    }
    acc.activeDealCount += 1;
    if (typeof r.teamDeal.amount === 'number' && Number.isFinite(r.teamDeal.amount)) {
      acc.totalAmount += r.teamDeal.amount;
    }
    acc.openTaskCount += r.openTaskCount;
    acc.outstandingDocumentCount += r.outstandingDocumentCount;
    if (r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk') {
      acc.atRiskCount += 1;
    }
  }

  // Drop bankers with zero load AND no roster row (they were aggregated
  // from deals where the banker id wasn't on the loaded roster). Keep
  // roster bankers even at zero load — surfacing "0 of 0" is honest.
  const rosterIds = new Set(bankers.map((b) => b.id));
  const rows_ = Array.from(accByBanker.values()).filter(
    (a) => a.activeDealCount > 0 || rosterIds.has(a.bankerId),
  );
  rows_.sort((a, b) => {
    // Primary: total amount desc; secondary: name asc.
    if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
    return a.bankerName.localeCompare(b.bankerName);
  });
  return rows_;
}

function buildTopDeals(
  rows: ReadonlyArray<VMRow>,
  topN: number,
): ManagerTopDealRow[] {
  const sortable = rows.slice().sort((a, b) => {
    const amA = typeof a.teamDeal.amount === 'number' ? a.teamDeal.amount : -Infinity;
    const amB = typeof b.teamDeal.amount === 'number' ? b.teamDeal.amount : -Infinity;
    if (amA !== amB) return amB - amA;
    return a.teamDeal.name.localeCompare(b.teamDeal.name);
  });
  const limit = Math.max(0, topN);
  return sortable.slice(0, limit).map((r) => ({
    dealId: r.teamDeal.id,
    dealName: r.teamDeal.name,
    clientName: r.teamDeal.clientName,
    stage: r.teamDeal.stage,
    status: r.teamDeal.status,
    bankerName: r.teamDeal.assignedBankerName,
    amount: r.teamDeal.amount,
    blockerStatus: r.vm.blockerStatus,
    nextBestAction: r.vm.nextBestAction,
  }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function managerMissingReason(labels: ReadonlyArray<string>): string {
  if (labels.length === 0) return 'Required deal fields are missing.';
  const preview = labels.slice(0, 3).join(', ');
  const suffix = labels.length > 3 ? `, +${labels.length - 3} more` : '';
  return `${labels.length} required field(s) not captured: ${preview}${suffix}.`;
}

function topBlockerSignal(
  signals: ReadonlyArray<BlockerSignal>,
  preferredSeverity: 'blocked' | 'at-risk',
): BlockerSignal | undefined {
  return (
    signals.find((s) => s.severity === preferredSeverity) ?? signals[0]
  );
}

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY);
}

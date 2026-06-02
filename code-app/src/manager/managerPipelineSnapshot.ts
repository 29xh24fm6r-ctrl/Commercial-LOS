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
  /** Total outstanding documents across all team-scoped deals. */
  outstandingDocumentCount: number;
  /** Total open (non-completed) tasks across all team-scoped deals. */
  openTaskCount: number;
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

  const commandStrip = buildCommandStrip(vmRows);
  const exceptionTape = buildExceptionTape(vmRows, now);
  const bankerWorkload = buildBankerWorkload(input.teamBankers, vmRows);
  const topDeals = buildTopDeals(vmRows, topN);

  return {
    commandStrip,
    exceptionTape,
    bankerWorkload,
    topDeals,
    isEmpty: input.teamPipeline.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Per-deal VM projection
// ---------------------------------------------------------------------------

interface VMRow {
  teamDeal: TeamDeal;
  vm: DealIntelligenceViewModel;
  openTaskCount: number;
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

  return {
    teamDeal: td,
    vm,
    openTaskCount: tasksResult.open.length,
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

function buildCommandStrip(rows: ReadonlyArray<VMRow>): ManagerPipelineCommandStrip {
  let totalPipelineAmount = 0;
  let missingDataCount = 0;
  let blockerAtRiskCount = 0;
  let outstandingDocumentCount = 0;
  let openTaskCount = 0;

  for (const r of rows) {
    if (typeof r.teamDeal.amount === 'number' && Number.isFinite(r.teamDeal.amount)) {
      totalPipelineAmount += r.teamDeal.amount;
    }
    if (r.managerMissingFieldLabels.length > 0) missingDataCount += 1;
    if (r.vm.blockerStatus === 'blocked' || r.vm.blockerStatus === 'at-risk') {
      blockerAtRiskCount += 1;
    }
    outstandingDocumentCount += r.outstandingDocumentCount;
    openTaskCount += r.openTaskCount;
  }

  return {
    activeDealCount: rows.length,
    totalPipelineAmount,
    missingDataCount,
    blockerAtRiskCount,
    outstandingDocumentCount,
    openTaskCount,
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

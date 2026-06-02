import type { DealDetail } from '../deals/dealQueries';
import type { DealCockpitMetrics } from '../deals/dealCockpitMetrics';
import type { BlockersResult, BlockerSignal } from '../deals/blockerRules';

/**
 * Phase 123A — Shared deal intelligence view-model.
 *
 * One read-only derivation function that produces the single shape
 * every workspace surface (Banker / Manager / Team / Executive /
 * Portfolio) consumes when rendering a deal. Lifts per-surface
 * roll-ups (each historically maintained its own derivation of
 * completeness / next-best-action / outstanding-docs) into a
 * shared, audit-pinned layer.
 *
 * Discipline (same as every other deriver in this codebase):
 *
 *   - Pure function. No fetching, no IO, no service calls. The
 *     caller assembles the typed inputs from already-authorized
 *     loaders and the existing cockpit-metrics pipeline; this
 *     module just projects them onto the view-model shape.
 *   - Honest absence. Every nullable input maps to `undefined`
 *     in the view-model — never a fabricated fallback, never
 *     "Not set" injected as a value. The Phase 122C loader fix
 *     is upstream of this layer; if the loader returned undefined
 *     because the Dataverse lookup is empty, the view-model
 *     surfaces undefined and the UI is expected to render an
 *     honest empty state.
 *   - No predictive language. No approval-odds, no deal-score,
 *     no ranking. nextBestAction is a simple, mechanical
 *     classification over a small set of mechanical signals
 *     (open tasks, outstanding documents, staleness, missing
 *     fields). No invented insight.
 *   - No mock / sample data. The view-model accepts whatever
 *     the loaders returned; it never substitutes a hardcoded
 *     borrower or test name. Pinned by a static-source
 *     regression in workspaceScreens.test.ts.
 *
 * Permission-before-render: the view-model is derived AFTER the
 * caller's loader has authorized the deal (loadDealForBanker /
 * loadDealForManager / loadDealForTeam already return 'denied'
 * for unauthorized callers). This module does not re-check
 * authorization — by contract it only receives DealDetail shapes
 * the caller is allowed to display.
 */

export type DealClosureState =
  /** Phase 122 isClosed === false. */
  | 'open'
  /** Phase 122 isClosed === true. */
  | 'closed';

export type DealLastActivityState =
  /** activity slot has not loaded yet, or loader was not wired. */
  | 'unknown'
  /** activity loaded with zero events. Honest empty. */
  | 'none'
  /** activity loaded with at least one event. */
  | 'has-events';

export interface DealIntelligenceCompleteness {
  /** Number of profile-completeness fields populated. */
  populatedFieldCount: number;
  /** Total number of profile-completeness fields tracked. */
  totalFieldCount: number;
  /** Rounded percentage 0–100. */
  completenessPct: number;
  /** Names of the missing profile-completeness fields, in catalog order. */
  missingFieldLabels: ReadonlyArray<string>;
}

export interface DealIntelligenceLastActivity {
  /** Iso of the most recent activity event; undefined when none or unknown. */
  iso: string | undefined;
  /** Days since the most recent event; undefined when none or unknown. */
  daysSince: number | undefined;
  /** Mechanical classification of the activity slot. */
  state: DealLastActivityState;
}

export interface DealIntelligenceNextBestAction {
  /** Short imperative label for the surfaced action. */
  label: string;
  /** One-sentence reason the action surfaced, derived mechanically. */
  reason: string;
  /** Stable id so surfaces can route the call-to-action. */
  id:
    | 'open-overdue-tasks'
    | 'open-outstanding-tasks'
    | 'follow-up-documents'
    | 'borrower-check-in'
    | 'populate-missing-fields'
    | 'refresh-stale-memo'
    | 'draft-credit-memo'
    | 'resolve-blocker';
}

export interface DealIntelligenceViewModel {
  // ---- Identity ------------------------------------------------------------
  dealId: string;
  dealName: string;

  // ---- Phase-122-hydrated display values (may be undefined per loader) ----
  clientName: string | undefined;
  bankerName: string | undefined;
  stageName: string | undefined;
  statusName: string | undefined;
  productTypeName: string | undefined;
  loanStructureName: string | undefined;
  pricingTypeName: string | undefined;

  // ---- Quantitative --------------------------------------------------------
  amount: number | undefined;
  targetCloseDate: string | undefined;
  /** Days until target close. Negative when target is in the past. undefined when no target. */
  daysToClose: number | undefined;
  /** Days since the deal entered its current stage. undefined when stageEntryDate is unset. */
  daysInStage: number | undefined;
  collateralSummary: string | undefined;

  // ---- Completeness --------------------------------------------------------
  completeness: DealIntelligenceCompleteness;

  // ---- Work counts ---------------------------------------------------------
  openTaskCount: number;
  overdueTaskCount: number;
  outstandingDocumentCount: number;

  // ---- Exceptions / blockers ----------------------------------------------
  /** Result from blockerRules.deriveBlockers, when the caller has it. */
  blockerStatus: BlockersResult['status'] | undefined;
  blockerSignals: ReadonlyArray<BlockerSignal>;

  // ---- Activity / freshness -----------------------------------------------
  lastActivity: DealIntelligenceLastActivity;

  // ---- Mechanical next-best-action ----------------------------------------
  /**
   * `undefined` when no mechanical signal surfaces. Surfaces with richer
   * autopilot logic (e.g. DealAutopilotPanel) can layer on top — the
   * view-model only emits the bare-minimum signal so leadership /
   * roll-up surfaces have one consistent value to display.
   */
  nextBestAction: DealIntelligenceNextBestAction | undefined;

  // ---- Closure -------------------------------------------------------------
  closure: DealClosureState;
}

export interface DealIntelligenceViewModelInput {
  /** Already-authorized DealDetail from one of the role-scoped loaders. */
  deal: DealDetail;
  /**
   * Output of deriveDealCockpitMetrics for this deal. The view-model
   * does NOT recompute completeness / counts / freshness; it uses the
   * cockpit-metrics pipeline as the single source of truth so the
   * Banker cockpit display and the leadership roll-up never disagree.
   */
  metrics: DealCockpitMetrics;
  /**
   * Output of deriveBlockers for this deal, when the caller has fetched
   * tasks + documents. Optional because not every surface needs the
   * full blocker pipeline (e.g. an executive snapshot may only show
   * amount + stage; it can omit the blocker derivation entirely).
   */
  blockers?: BlockersResult;
}

/**
 * Stale-activity threshold (days) above which the view-model surfaces a
 * "borrower check-in" next-best-action. Matches the existing
 * DealAutopilotPanel rule so the leadership roll-up agrees with the
 * banker cockpit's autopilot panel.
 */
const STALE_ACTIVITY_DAYS = 14;

/**
 * Profile-completeness threshold below which the view-model surfaces a
 * "populate missing fields" next-best-action.
 */
const COMPLETENESS_NUDGE_PCT = 50;

/**
 * Derive the shared deal-intelligence view-model.
 *
 * Inputs: already-authorized DealDetail + DealCockpitMetrics +
 * (optional) BlockersResult.
 * Outputs: the single read-only shape every surface consumes.
 *
 * Pure. No IO. No fetching. Honest absence everywhere.
 */
export function deriveDealIntelligenceViewModel(
  input: DealIntelligenceViewModelInput,
): DealIntelligenceViewModel {
  const { deal, metrics, blockers } = input;

  const completeness: DealIntelligenceCompleteness = {
    populatedFieldCount: metrics.populatedFieldCount,
    totalFieldCount: metrics.totalFieldCount,
    completenessPct: metrics.profileCompletenessPct,
    missingFieldLabels: metrics.missingFieldLabels,
  };

  const lastActivity: DealIntelligenceLastActivity = {
    iso: metrics.lastTouchedIso,
    daysSince: metrics.daysSinceLastTouched,
    state: metrics.communicationState,
  };

  const overdueTaskCount = metrics.taskOverdueCount;
  const openTaskCount = metrics.taskOpenCount;
  const outstandingDocumentCount = metrics.docOutstandingCount;

  return {
    dealId: deal.id,
    dealName: deal.name,

    clientName: deal.clientName,
    bankerName: deal.bankerName,
    stageName: deal.stage,
    statusName: deal.status,
    productTypeName: deal.productType,
    loanStructureName: deal.loanStructure,
    pricingTypeName: deal.pricingType,

    amount: deal.amount,
    targetCloseDate: deal.targetCloseDate,
    daysToClose: metrics.daysToClose,
    daysInStage: metrics.daysInStage,
    collateralSummary: deal.collateralSummary,

    completeness,

    openTaskCount,
    overdueTaskCount,
    outstandingDocumentCount,

    blockerStatus: blockers?.status,
    blockerSignals: blockers?.signals ?? [],

    lastActivity,

    nextBestAction: deriveNextBestAction({
      blockers,
      overdueTaskCount,
      openTaskCount,
      outstandingDocumentCount,
      daysSinceLastTouched: metrics.daysSinceLastTouched,
      memoState: metrics.memoState,
      completenessPct: metrics.profileCompletenessPct,
      missingFieldLabels: metrics.missingFieldLabels,
      isClosed: deal.isClosed,
    }),

    closure: deal.isClosed ? 'closed' : 'open',
  };
}

interface NextBestActionInputs {
  blockers: BlockersResult | undefined;
  overdueTaskCount: number;
  openTaskCount: number;
  outstandingDocumentCount: number;
  daysSinceLastTouched: number | undefined;
  memoState: DealCockpitMetrics['memoState'];
  completenessPct: number;
  missingFieldLabels: ReadonlyArray<string>;
  isClosed: boolean;
}

/**
 * Mechanical priority over the cockpit metrics. The order is the
 * priority — first rule that fires wins; ties broken by source
 * ordering. Closed deals never produce a next-best-action.
 *
 * No predictive language. No "you should". The reason is a plain
 * statement of WHY the signal fired (count, threshold, classification),
 * not advice. Surfaces with richer flows can ignore this and render
 * their own autopilot panel.
 */
function deriveNextBestAction(
  inputs: NextBestActionInputs,
): DealIntelligenceNextBestAction | undefined {
  if (inputs.isClosed) return undefined;

  // 1. Hard blockers from the blockerRules pipeline.
  if (inputs.blockers?.status === 'blocked' && inputs.blockers.signals.length > 0) {
    const first = inputs.blockers.signals[0];
    return {
      id: 'resolve-blocker',
      label: `Resolve blocker: ${first.label}`,
      reason: first.detail,
    };
  }

  // 2. Overdue tasks.
  if (inputs.overdueTaskCount > 0) {
    return {
      id: 'open-overdue-tasks',
      label:
        inputs.overdueTaskCount === 1
          ? 'Open the 1 overdue task'
          : `Open the ${inputs.overdueTaskCount} overdue tasks`,
      reason:
        `Task pipeline reports ${inputs.overdueTaskCount} task(s) past their due date.`,
    };
  }

  // 3. Outstanding documents.
  if (inputs.outstandingDocumentCount > 0) {
    return {
      id: 'follow-up-documents',
      label:
        inputs.outstandingDocumentCount === 1
          ? 'Follow up on 1 outstanding document'
          : `Follow up on ${inputs.outstandingDocumentCount} outstanding documents`,
      reason:
        `Document checklist reports ${inputs.outstandingDocumentCount} item(s) not yet received.`,
    };
  }

  // 4. Stale activity (no timeline event for STALE_ACTIVITY_DAYS).
  if (
    typeof inputs.daysSinceLastTouched === 'number' &&
    inputs.daysSinceLastTouched >= STALE_ACTIVITY_DAYS
  ) {
    return {
      id: 'borrower-check-in',
      label: `No timeline activity in ${inputs.daysSinceLastTouched} days`,
      reason:
        `Most recent timeline event was ${inputs.daysSinceLastTouched} day(s) ago. ` +
        `Consider a borrower check-in.`,
    };
  }

  // 5. Stale or draft memo.
  if (inputs.memoState === 'stale') {
    return {
      id: 'refresh-stale-memo',
      label: 'Refresh the stale credit memo',
      reason: 'Credit memo pipeline reports memoState=stale.',
    };
  }
  if (inputs.memoState === 'draft') {
    return {
      id: 'draft-credit-memo',
      label: 'Finalize the draft credit memo',
      reason: 'Credit memo pipeline reports memoState=draft.',
    };
  }

  // 6. Open (non-overdue) tasks.
  if (inputs.openTaskCount > 0) {
    return {
      id: 'open-outstanding-tasks',
      label:
        inputs.openTaskCount === 1
          ? 'Open the 1 active task'
          : `Open the ${inputs.openTaskCount} active tasks`,
      reason: `Task pipeline reports ${inputs.openTaskCount} active task(s).`,
    };
  }

  // 7. Profile-completeness nudge.
  if (
    inputs.completenessPct < COMPLETENESS_NUDGE_PCT &&
    inputs.missingFieldLabels.length > 0
  ) {
    const first = inputs.missingFieldLabels[0];
    return {
      id: 'populate-missing-fields',
      label: `Populate ${first}`,
      reason:
        `Profile completeness is ${inputs.completenessPct}% — ${inputs.missingFieldLabels.length} ` +
        `required field(s) still unset. Start with "${first}".`,
    };
  }

  return undefined;
}

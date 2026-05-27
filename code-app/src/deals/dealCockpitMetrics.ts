import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';

/**
 * Phase 125D — Deal cockpit metric derivation.
 *
 * Pure-function deriver that produces every value the cockpit
 * KPI deck, profile-completeness ring, workstream bars, and
 * right-rail count badges render. Discipline carried over from
 * every other deriver in this codebase:
 *
 *   - Inputs are the already-authorized DealDetail + child
 *     query slots. The function never reads from Dataverse,
 *     never calls a service, never writes anything.
 *   - Outputs are derived from typed-field presence/values.
 *     Missing fields surface as `undefined`, zero counts, or
 *     'missing' / 'unknown' — never as fabricated defaults.
 *   - No predictive language. No approval-odds. No ranking.
 *     No "approval probability". Field names describe what
 *     the value IS (a count, a date, a percentage of populated
 *     deal-summary fields), not what it MEANS for credit
 *     decisioning.
 *   - The set of fields counted toward profile completeness
 *     is documented in PROFILE_COMPLETENESS_FIELDS below so
 *     reviewers can audit exactly what the percentage means.
 */

/**
 * Fields counted toward "profile completeness" — the subset of
 * DealDetail that a banker would expect to be populated before
 * a deal moves into underwriting / committee. Every entry here
 * counts equally; presence is binary (populated vs. missing).
 *
 * The list is deliberately narrow: schema-actual fields only,
 * no derived combinations, no compound conditions. A future
 * phase can extend it — every entry that goes in raises the
 * denominator, so reviewers should agree the field is part of
 * the readiness signal before adding it.
 */
export const PROFILE_COMPLETENESS_FIELDS: ReadonlyArray<{
  key: keyof DealDetail;
  label: string;
}> = [
  { key: 'amount', label: 'Loan amount' },
  { key: 'targetCloseDate', label: 'Target close' },
  { key: 'clientName', label: 'Client' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status' },
  { key: 'bankerName', label: 'Banker' },
  { key: 'productType', label: 'Product type' },
  { key: 'loanStructure', label: 'Loan structure' },
  { key: 'customerType', label: 'Customer type' },
  { key: 'industry', label: 'Industry' },
  { key: 'guarantorStructure', label: 'Guarantor structure' },
  { key: 'pricingType', label: 'Pricing type' },
  { key: 'collateralSummary', label: 'Collateral' },
];

export interface DealCockpitMetrics {
  /** Loan amount in raw dollars; undefined if unset. */
  loanAmount: number | undefined;

  /** Iso target-close date; undefined if unset. */
  targetCloseIso: string | undefined;

  /** Days until target close, or negative if past. undefined if no date. */
  daysToClose: number | undefined;

  /** Days since the deal entered its current stage. undefined if unset. */
  daysInStage: number | undefined;

  /** Number of profile-completeness fields populated. */
  populatedFieldCount: number;

  /** Total number of profile-completeness fields tracked. */
  totalFieldCount: number;

  /** Rounded percentage 0-100. */
  profileCompletenessPct: number;

  /** Names of the missing profile-completeness fields, in catalog order. */
  missingFieldLabels: ReadonlyArray<string>;

  /** Task counts. Zero when the slot is still loading. */
  taskOpenCount: number;
  taskOverdueCount: number;
  taskCompletedCount: number;

  /** Document counts. */
  docOutstandingCount: number;
  docReceivedCount: number;
  docReviewedCount: number;

  /** Credit memo state. 'none' is honest when no memo exists at all.
   *  'borrower-safe' fires when at least one memo carries
   *  borrowerSafe=true. 'final' / 'draft' / 'stale' come from
   *  the cr664_status statusKey. 'unknown' covers the schema
   *  edge-case where a memo exists but its status didn't map. */
  memoState: 'none' | 'draft' | 'borrower-safe' | 'final' | 'stale' | 'unknown';
  memoCount: number;

  /** Communication state — based on activity events. */
  communicationState:
    | 'none'
    | 'has-events'
    | 'unknown';

  /** Most recent activity event iso; undefined if no events / loading. */
  lastTouchedIso: string | undefined;
  /** Days since last activity event; undefined if no events. */
  daysSinceLastTouched: number | undefined;

  /** Counts that drive the right-rail count badges. */
  rightRail: {
    tasksOpen: number;
    documentsOutstanding: number;
    memos: number;
    communicationEvents: number;
  };
}

export interface DealCockpitMetricsInput {
  deal: DealDetail;
  tasks: DealTasksResult | undefined;
  documents: DealDocumentsResult | undefined;
  creditMemo: CreditMemoData | undefined;
  activity: ReadonlyArray<TimelineEvent> | undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function deriveDealCockpitMetrics(
  input: DealCockpitMetricsInput,
  now: Date = new Date(),
): DealCockpitMetrics {
  const { deal, tasks, documents, creditMemo, activity } = input;

  // Profile completeness — schema-actual presence only.
  let populated = 0;
  const missing: string[] = [];
  for (const f of PROFILE_COMPLETENESS_FIELDS) {
    const v = deal[f.key];
    if (isPopulated(v)) {
      populated += 1;
    } else {
      missing.push(f.label);
    }
  }
  const total = PROFILE_COMPLETENESS_FIELDS.length;
  const completenessPct = total === 0 ? 0 : Math.round((populated / total) * 100);

  // Days arithmetic — only computed when source iso parses.
  const daysToClose = daysFromNow(deal.targetCloseDate, now);
  const daysInStage = daysAgo(deal.stageEntryDate, now);

  // Task counts.
  const taskOpen = tasks?.open ?? [];
  const taskCompleted = tasks?.completed ?? [];
  const taskOverdue = taskOpen.filter((t) => isOverdueTask(t.dueDate, now));

  // Document counts.
  const docOutstanding = documents?.outstanding ?? [];
  const docReceived = documents?.received ?? [];
  const docReviewed = documents?.reviewed ?? [];

  // Memo state — use the highest-tier state present.
  const memos = creditMemo?.memos ?? [];
  const memoState = deriveMemoState(memos);

  // Communication — scan activity for outbound/inbound communication
  // signals. `activity === undefined` means loading, which we model
  // as `unknown` so the UI can render a calm placeholder. `activity
  // === []` means the slot loaded but no events — `none`, honest.
  const { communicationState, communicationEvents, lastTouchedIso } =
    deriveCommunicationState(activity);

  return {
    loanAmount: numberOrUndefined(deal.amount),
    targetCloseIso: deal.targetCloseDate,
    daysToClose,
    daysInStage,
    populatedFieldCount: populated,
    totalFieldCount: total,
    profileCompletenessPct: completenessPct,
    missingFieldLabels: missing,
    taskOpenCount: taskOpen.length,
    taskOverdueCount: taskOverdue.length,
    taskCompletedCount: taskCompleted.length,
    docOutstandingCount: docOutstanding.length,
    docReceivedCount: docReceived.length,
    docReviewedCount: docReviewed.length,
    memoState,
    memoCount: memos.length,
    communicationState,
    lastTouchedIso,
    daysSinceLastTouched: daysAgo(lastTouchedIso, now),
    rightRail: {
      tasksOpen: taskOpen.length,
      documentsOutstanding: docOutstanding.length,
      memos: memos.length,
      communicationEvents,
    },
  };
}

function isPopulated(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return Boolean(value);
}

function numberOrUndefined(n: number | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function daysFromNow(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return Math.round((d.getTime() - now.getTime()) / MS_PER_DAY);
}

function daysAgo(iso: string | undefined, now: Date): number | undefined {
  const fwd = daysFromNow(iso, now);
  if (fwd === undefined) return undefined;
  return -fwd;
}

function isOverdueTask(dueIso: string | undefined, now: Date): boolean {
  if (!dueIso) return false;
  const d = new Date(dueIso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

function deriveMemoState(
  memos: CreditMemoData['memos'],
): DealCockpitMetrics['memoState'] {
  if (memos.length === 0) return 'none';
  const keys = new Set(memos.map((m) => m.statusKey));
  const hasBorrowerSafe = memos.some((m) => m.borrowerSafe);
  // The highest-tier state present wins. Order: final >
  // borrower-safe > draft > stale > unknown.
  if (keys.has('final')) return 'final';
  if (hasBorrowerSafe) return 'borrower-safe';
  if (keys.has('draft')) return 'draft';
  if (keys.has('stale')) return 'stale';
  return 'unknown';
}

const COMMUNICATION_EVENT_TYPES: ReadonlySet<TimelineEventTypeKey> = new Set<TimelineEventTypeKey>([
  'EmailLogged',
  'BorrowerUpdateSent',
  'CallLogged',
  'NoteLogged',
  'MeetingLogged',
]);

function deriveCommunicationState(
  activity: ReadonlyArray<TimelineEvent> | undefined,
): {
  communicationState: DealCockpitMetrics['communicationState'];
  communicationEvents: number;
  lastTouchedIso: string | undefined;
} {
  if (activity === undefined) {
    return { communicationState: 'unknown', communicationEvents: 0, lastTouchedIso: undefined };
  }
  if (activity.length === 0) {
    return { communicationState: 'none', communicationEvents: 0, lastTouchedIso: undefined };
  }
  let count = 0;
  for (const ev of activity) {
    if (ev.eventTypeKey && COMMUNICATION_EVENT_TYPES.has(ev.eventTypeKey)) {
      count += 1;
    }
  }
  const lastTouchedIso = activity[0]?.eventAt;
  if (count === 0) {
    return { communicationState: 'none', communicationEvents: 0, lastTouchedIso };
  }
  return { communicationState: 'has-events', communicationEvents: count, lastTouchedIso };
}

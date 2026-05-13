import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';

export type BlockerSeverity = 'blocked' | 'at-risk' | 'info';
export type BlockerStatus = 'blocked' | 'at-risk' | 'clear';

export interface BlockerSignal {
  id: string;
  severity: BlockerSeverity;
  label: string;
  detail: string;
}

export interface BlockersResult {
  status: BlockerStatus;
  signals: BlockerSignal[];
  closedDealNote: string | undefined;
}

/** Days in current stage that promote a deal to At Risk. Simple constant
 *  for now; a future phase will read this from cr664_KPIThresholdConfiguration. */
const STAGE_AGING_AT_RISK_DAYS = 30;

/** Days past target close before a missed-close signal flips from
 *  At Risk to Blocked. Keeps short slippage warning-only. */
const PAST_CLOSE_BLOCKED_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function parseDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function formatDate(iso: string | undefined): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isPastDue(iso: string | undefined, now: Date): boolean {
  const d = parseDate(iso);
  return !!d && d.getTime() < now.getTime();
}

function joinPreview(items: string[], max = 3): string {
  if (items.length === 0) return '';
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown}, +${items.length - max} more` : shown;
}

/**
 * Derive blocker / at-risk signals from the authorized deal record,
 * plus optional task and document results loaded by DealDataProvider.
 *
 * - tasks and documents are optional and may still be loading or
 *   failed; their signals are only added when 'ready'. Deal-only
 *   signals always render, so the card is useful even if a child
 *   query is in flight or errored.
 * - Per spec rules: missing-doc and overdue-task style signals are
 *   never 'blocked'; only target close >= 7 days overdue qualifies
 *   for red. Red is reserved for explicit blocking conditions.
 *
 * Closed deals short-circuit to 'clear' regardless of other signals;
 * a missed-close warning on a finalized deal is noise.
 */
export function deriveBlockers(
  deal: DealDetail,
  tasks: DealTasksResult | undefined,
  documents: DealDocumentsResult | undefined,
  now: Date = new Date(),
): BlockersResult {
  if (deal.isClosed) {
    return {
      status: 'clear',
      signals: [],
      closedDealNote: 'Deal is closed; blocker checks are not applied.',
    };
  }

  const signals: BlockerSignal[] = [];

  // 1. Past target close date with deal still open
  const target = parseDate(deal.targetCloseDate);
  if (target && target.getTime() < now.getTime()) {
    const overdueDays = daysBetween(target, now);
    const severity: BlockerSeverity =
      overdueDays >= PAST_CLOSE_BLOCKED_DAYS ? 'blocked' : 'at-risk';
    signals.push({
      id: 'past-target-close',
      severity,
      label:
        severity === 'blocked'
          ? `Target close date passed ${overdueDays} days ago`
          : `Target close date passed ${overdueDays === 0 ? 'today' : `${overdueDays} day(s) ago`}`,
      detail: `Target close was ${formatDate(deal.targetCloseDate)} and the deal is not yet closed.`,
    });
  }

  // 2. Stale in current stage
  const stageEntry = parseDate(deal.stageEntryDate);
  if (stageEntry) {
    const daysInStage = daysBetween(stageEntry, now);
    if (daysInStage > STAGE_AGING_AT_RISK_DAYS) {
      signals.push({
        id: 'stale-stage',
        severity: 'at-risk',
        label: `In current stage for ${daysInStage} days`,
        detail: `Stage "${deal.stage ?? 'unknown'}" entered on ${formatDate(deal.stageEntryDate)} — past the ${STAGE_AGING_AT_RISK_DAYS}-day at-risk threshold.`,
      });
    }
  }

  // 3. Missing fields a banker would expect on an active deal
  const missing: string[] = [];
  if (deal.amount == null) missing.push('Loan amount');
  if (!deal.targetCloseDate) missing.push('Target close date');
  if (!deal.clientName) missing.push('Client');
  if (!deal.productType) missing.push('Product type');
  if (missing.length > 0) {
    signals.push({
      id: 'missing-required',
      severity: 'at-risk',
      label: 'Missing information',
      detail: `Not captured on this deal: ${missing.join(', ')}.`,
    });
  }

  // 4. Open tasks past their due date (from authorized child query)
  if (tasks) {
    const overdueTasks = tasks.open.filter((t) => isPastDue(t.dueDate, now));
    if (overdueTasks.length > 0) {
      signals.push({
        id: 'overdue-tasks',
        severity: 'at-risk',
        label: `${overdueTasks.length} overdue open task${overdueTasks.length === 1 ? '' : 's'}`,
        detail: `Past due: ${joinPreview(overdueTasks.map((t) => t.title))}.`,
      });
    }
  }

  // 5. Outstanding documents past their due date (from authorized child query)
  if (documents) {
    const overdueDocs = documents.outstanding.filter((d) => isPastDue(d.dueDate, now));
    if (overdueDocs.length > 0) {
      signals.push({
        id: 'overdue-documents',
        severity: 'at-risk',
        label: `${overdueDocs.length} overdue outstanding document${overdueDocs.length === 1 ? '' : 's'}`,
        detail: `Past due: ${joinPreview(overdueDocs.map((d) => d.name))}.`,
      });
    }
  }

  const status: BlockerStatus = signals.some((s) => s.severity === 'blocked')
    ? 'blocked'
    : signals.length > 0
      ? 'at-risk'
      : 'clear';

  return { status, signals, closedDealNote: undefined };
}

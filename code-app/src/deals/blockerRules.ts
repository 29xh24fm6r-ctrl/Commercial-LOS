import type { DealDetail } from './dealQueries';

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

/**
 * Derive blocker / at-risk signals from the already-authorized deal
 * record only. No tasks, documents, memos, or alert queues are
 * consulted — those will hang off this same result type in later phases.
 *
 * Closed deals always resolve to 'clear' regardless of other signals;
 * a missed-close warning on a finalized deal is noise.
 */
export function deriveBlockers(deal: DealDetail, now: Date = new Date()): BlockersResult {
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

  const status: BlockerStatus = signals.some((s) => s.severity === 'blocked')
    ? 'blocked'
    : signals.length > 0
      ? 'at-risk'
      : 'clear';

  return { status, signals, closedDealNote: undefined };
}

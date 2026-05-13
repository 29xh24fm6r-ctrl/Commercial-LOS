import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';

/**
 * ⚠️ TRANSITIONAL OPERATIONAL FALLBACK — DO NOT EXPAND.
 *
 * Per SPEC W2 (Executive live-data hardening), Executive Workspace
 * surfaces are supposed to consume only governed snapshot entities.
 *
 * Two of the five phase-15 cards (Pipeline by Stage and Monthly
 * Closing Forecast) do not yet have corresponding snapshot entities
 * in the Dataverse schema. Per the phase-15 brief:
 *
 *   "If snapshot entities do not yet exist:
 *      - implement a clearly-isolated temporary adapter layer
 *      - explicitly mark it as transitional operational fallback
 *      - keep Executive queries isolated from operational UI providers"
 *
 * This file is that adapter. It directly reads cr664_loandeal — the
 * live operational pipeline — but never exposes individual deal
 * records to the executive UI. The functions below return aggregate
 * counts and totals ONLY. Per-card components surface a clearly
 * labeled "Transitional: derived from live operational data;
 * snapshot version pending" footer so executives know which numbers
 * are governed and which are not.
 *
 * The file is also intentionally isolated from ManagerProvider /
 * BankerProvider / DealDataProvider — those are operational UI
 * concerns. The Executive workspace must not depend on them.
 *
 * When snapshot entities for stage and forecast are added to the
 * schema, replace these calls with snapshot reads and delete this
 * file.
 */

export interface StageAggregate {
  stage: string;
  count: number;
  totalAmount: number;
}

export interface MonthBucketAggregate {
  /** YYYY-MM, or '__past__' / '__no_date__' for outlier buckets. */
  key: string;
  /** Human label, e.g. 'May 2026' / 'Past target close' / 'No target close date'. */
  label: string;
  count: number;
  totalAmount: number;
  past: boolean;
}

const UNKNOWN_STAGE = '(no stage)';
const PAST_KEY = '__past__';
const NO_DATE_KEY = '__no_date__';

/**
 * Aggregate active, non-terminal deals by stage. Returns counts and
 * total amount per stage only — no per-deal identifiers leave the
 * adapter.
 */
export async function loadPipelineByStageFallback(): Promise<StageAggregate[]> {
  const result = await Cr664_loandealsService.getAll({
    filter: [
      `statecode eq 0`,
      `(cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)`,
    ].join(' and '),
  });

  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to load operational pipeline aggregate',
    );
  }

  const map = new Map<string, StageAggregate>();
  for (const d of result.data ?? []) {
    const key = d.cr664_stagereferencename ?? UNKNOWN_STAGE;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      existing.totalAmount += d.cr664_amount ?? 0;
    } else {
      map.set(key, { stage: key, count: 1, totalAmount: d.cr664_amount ?? 0 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Aggregate active, non-terminal deals by target close month. Returns
 * a 'Past target close' bucket for everything overdue and a 'No target
 * close date' bucket for deals without a target. Only aggregate counts
 * and totals leave the adapter.
 */
export async function loadClosingForecastFallback(
  now: Date = new Date(),
): Promise<MonthBucketAggregate[]> {
  const result = await Cr664_loandealsService.getAll({
    filter: [
      `statecode eq 0`,
      `(cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)`,
    ].join(' and '),
  });

  if (!result.success) {
    throw new Error(
      result.error?.message ?? 'Failed to load operational forecast aggregate',
    );
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const buckets = new Map<string, MonthBucketAggregate>();

  for (const d of result.data ?? []) {
    const amount = d.cr664_amount ?? 0;
    let key: string;
    let label: string;
    let past = false;

    if (!d.cr664_targetclosedate) {
      key = NO_DATE_KEY;
      label = 'No target close date';
    } else {
      const dt = new Date(d.cr664_targetclosedate);
      if (Number.isNaN(dt.getTime())) {
        key = NO_DATE_KEY;
        label = 'No target close date';
      } else if (dt.getTime() < monthStart) {
        key = PAST_KEY;
        label = 'Past target close';
        past = true;
      } else {
        const y = dt.getFullYear();
        const m = dt.getMonth();
        key = `${y}-${String(m + 1).padStart(2, '0')}`;
        label = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      }
    }

    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
      existing.totalAmount += amount;
    } else {
      buckets.set(key, { key, label, count: 1, totalAmount: amount, past });
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.key === PAST_KEY) return -1;
    if (b.key === PAST_KEY) return 1;
    if (a.key === NO_DATE_KEY) return 1;
    if (b.key === NO_DATE_KEY) return -1;
    return a.key.localeCompare(b.key);
  });
}

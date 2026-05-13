import type { TeamDeal } from './managerQueries';

/** Days in current stage that promote a deal to 'at risk' in the
 *  manager workspace. Mirrors the threshold used in blockerRules.ts
 *  so the same deal that flips amber on the banker's deal page also
 *  appears in the manager's at-risk roll-up. */
export const STAGE_AGING_AT_RISK_DAYS = 30;

/** Days past target close before a deal flips from 'at risk' to
 *  'blocked' in the manager workspace. Same threshold as blocker
 *  rules. */
export const PAST_CLOSE_BLOCKED_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DealSeverity = 'blocked' | 'atRisk' | 'clear';

export interface DealSeveritySignal {
  severity: DealSeverity;
  /** Why the deal is flagged. Human-readable phrase, no card-level
   *  formatting. Caller can compose into a row label. */
  reason: string;
}

function parseDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Reuse of the blocker logic from blockerRules.ts but rolled up to a
 * single severity + single reason per deal, so the manager workspace
 * at-risk card can render one row per deal. The full per-signal detail
 * still lives on the deal page; here we just need the worst-case
 * severity and a one-line summary.
 */
export function dealTeamSeverity(deal: TeamDeal, now: Date = new Date()): DealSeveritySignal {
  const target = parseDate(deal.targetCloseDate);
  if (target && target.getTime() < now.getTime()) {
    const overdueDays = daysBetween(target, now);
    if (overdueDays >= PAST_CLOSE_BLOCKED_DAYS) {
      return {
        severity: 'blocked',
        reason: `Target close passed ${overdueDays} days ago`,
      };
    }
    return {
      severity: 'atRisk',
      reason: overdueDays === 0
        ? 'Target close passes today'
        : `Target close passed ${overdueDays} day(s) ago`,
    };
  }

  const stageEntry = parseDate(deal.stageEntryDate);
  if (stageEntry) {
    const daysInStage = daysBetween(stageEntry, now);
    if (daysInStage > STAGE_AGING_AT_RISK_DAYS) {
      return {
        severity: 'atRisk',
        reason: `In ${deal.stage ?? 'current stage'} for ${daysInStage} days`,
      };
    }
  }

  return { severity: 'clear', reason: '' };
}

export interface TeamSignalCounts {
  total: number;
  blocked: number;
  atRisk: number;
  clear: number;
  totalAmount: number;
  closingThisMonth: number;
  pastTargetClose: number;
}

export function summarizeTeamPipeline(deals: TeamDeal[], now: Date = new Date()): TeamSignalCounts {
  let blocked = 0;
  let atRisk = 0;
  let clear = 0;
  let totalAmount = 0;
  let closingThisMonth = 0;
  let pastTargetClose = 0;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  for (const d of deals) {
    if (d.amount != null) totalAmount += d.amount;

    const target = parseDate(d.targetCloseDate);
    if (target) {
      const t = target.getTime();
      if (t >= monthStart && t < monthEnd) closingThisMonth++;
      if (t < now.getTime()) pastTargetClose++;
    }

    const sig = dealTeamSeverity(d, now);
    if (sig.severity === 'blocked') blocked++;
    else if (sig.severity === 'atRisk') atRisk++;
    else clear++;
  }

  return {
    total: deals.length,
    blocked,
    atRisk,
    clear,
    totalAmount,
    closingThisMonth,
    pastTargetClose,
  };
}

import type { BankerPersonalActivity } from '../shared/analytics/bankerPersonalActivity';
import type { PipelineDeal } from './dealQueries';

/**
 * Banker Command Center — the WORK model (the action cockpit's content).
 *
 * Pure and derived ENTIRELY from data the dashboard already loads (the KPI rollup +
 * the banker's deals). It fabricates nothing: every count comes from
 * `deriveBankerPersonalActivity` / the real deal list, and an all-zero queue is an
 * honest "you're clear", not an invented number. The governance/flag posture lives
 * in the separate `bankerOperatingCommandCenterModel` (the demoted status strip).
 */

/** Existing shell tabs a work item can route to — all honest, already-built destinations. */
export type WorkTab = 'active-deals' | 'my-alerts' | 'tasks' | 'due-diligence';
export type WorkTone = 'urgent' | 'attention' | 'info';

export interface WorkItem {
  readonly id: string;
  readonly count: number;
  readonly label: string;
  readonly tone: WorkTone;
  readonly actionLabel: string;
  readonly target: WorkTab;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * The banker's priority work, most-urgent first. Only non-zero buckets appear; an empty
 * result is the honest "nothing needs you" state (rendered by the component). Open tasks
 * are only surfaced when there are no overdue tasks, so the same queue isn't double-listed.
 */
export function deriveBankerWorkQueue(kpis: BankerPersonalActivity): readonly WorkItem[] {
  const items: WorkItem[] = [];

  if (kpis.urgentItemCount > 0) {
    items.push({
      id: 'urgent',
      count: kpis.urgentItemCount,
      label: `${plural(kpis.urgentItemCount, 'urgent item')} need attention`,
      tone: 'urgent',
      actionLabel: 'Review now',
      target: 'my-alerts',
    });
  }
  if (kpis.overdueTaskCount > 0) {
    items.push({
      id: 'overdue-tasks',
      count: kpis.overdueTaskCount,
      label: plural(kpis.overdueTaskCount, 'overdue task'),
      tone: 'attention',
      actionLabel: 'Work tasks',
      target: 'tasks',
    });
  }
  const dueDiligence = kpis.outstandingDocumentCount + kpis.pendingReviewDocumentCount;
  if (dueDiligence > 0) {
    items.push({
      id: 'due-diligence',
      count: dueDiligence,
      label: `${plural(dueDiligence, 'document')} need due diligence`,
      tone: 'attention',
      actionLabel: 'Open',
      target: 'due-diligence',
    });
  }
  if (kpis.staleActivityCount > 0) {
    items.push({
      id: 'stale',
      count: kpis.staleActivityCount,
      label: `${plural(kpis.staleActivityCount, 'deal')} stale 14+ days`,
      tone: 'attention',
      actionLabel: 'Review',
      target: 'active-deals',
    });
  }
  if (kpis.closingSoonCount > 0) {
    items.push({
      id: 'closing-soon',
      count: kpis.closingSoonCount,
      label: `${plural(kpis.closingSoonCount, 'deal')} closing within 14 days`,
      tone: 'info',
      actionLabel: 'Open',
      target: 'active-deals',
    });
  }
  if (kpis.openTaskCount > 0 && kpis.overdueTaskCount === 0) {
    items.push({
      id: 'open-tasks',
      count: kpis.openTaskCount,
      label: plural(kpis.openTaskCount, 'open task'),
      tone: 'info',
      actionLabel: 'Work tasks',
      target: 'tasks',
    });
  }
  return items;
}

export interface StageGroup {
  readonly stage: string;
  readonly count: number;
  readonly amount: number;
}

export interface PipelineSnapshot {
  readonly totalActive: number;
  readonly totalAmount: number;
  readonly groups: readonly StageGroup[];
}

/**
 * Active deals grouped by their ACTUAL stage value — the honest current state, never a faked
 * distribution. Deals with no stage are grouped under "Unstaged" (so unseeded stages read
 * truthfully as one bucket rather than being spread across invented stages). Sorted by count.
 */
export function deriveBankerPipelineByStage(deals: readonly PipelineDeal[]): PipelineSnapshot {
  const active = deals.filter((d) => !d.isClosed);
  const map = new Map<string, { count: number; amount: number }>();
  for (const d of active) {
    const stage = (d.stage ?? '').trim() || 'Unstaged';
    const g = map.get(stage) ?? { count: 0, amount: 0 };
    g.count += 1;
    g.amount += typeof d.amount === 'number' ? d.amount : 0;
    map.set(stage, g);
  }
  const groups = [...map.entries()]
    .map(([stage, g]) => ({ stage, count: g.count, amount: g.amount }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  const totalAmount = active.reduce((sum, d) => sum + (typeof d.amount === 'number' ? d.amount : 0), 0);
  return { totalActive: active.length, totalAmount, groups };
}

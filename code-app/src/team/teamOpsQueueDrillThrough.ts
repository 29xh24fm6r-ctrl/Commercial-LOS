/**
 * Phase 144B — Team Ops Queue drill-through adapters.
 *
 * Pure mappers from the already-derived Team Ops command ribbon into read-only
 * {@link DrillThroughTarget}s for the KPI ribbon tiles. No new loader, no
 * Dataverse query, no write, no fake data, and NO task-completion control — every
 * value comes from the ribbon the cockpit already renders.
 */

import {
  buildDrillThroughTarget,
  type DrillThroughSourceCount,
  type DrillThroughTarget,
} from '../shared/drillthrough/drillThroughTypes';
import type { TeamOpsCommandRibbon } from './teamOpsQueueSnapshot';

const SURFACE = 'team_ops_queue' as const;

/** All team-ops KPI ribbon targets, keyed by the tile's `data-team-kpi` slug. */
export function teamOpsKpiTargets(ribbon: TeamOpsCommandRibbon): Record<string, DrillThroughTarget> {
  const kpi = (
    slug: string,
    title: string,
    summary: string,
    sourceCounts: DrillThroughSourceCount[],
    nextReviewStep?: string,
  ): DrillThroughTarget =>
    buildDrillThroughTarget({
      id: `team-kpi-${slug}`,
      title,
      subtitle: 'Team Ops KPI',
      surface: SURFACE,
      entityKind: 'kpi',
      summary,
      sourceCounts,
      nextReviewStep,
    });

  return {
    'active-deals': kpi('active-deals', 'Active deals', `${ribbon.activeDealCount} authorized active deals on the team.`, [
      { label: 'Active deals', count: ribbon.activeDealCount },
    ]),
    'open-tasks': kpi('open-tasks', 'Open tasks', `${ribbon.openTaskCount} open tasks (${ribbon.overdueTaskCount} overdue, ${ribbon.dueSoonTaskCount} due soon).`, [
      { label: 'Open tasks', count: ribbon.openTaskCount },
      { label: 'Overdue', count: ribbon.overdueTaskCount },
      { label: 'Due soon', count: ribbon.dueSoonTaskCount },
    ]),
    'overdue-tasks': kpi('overdue-tasks', 'Overdue tasks', `${ribbon.overdueTaskCount} open tasks are past their due date.`, [
      { label: 'Overdue tasks', count: ribbon.overdueTaskCount },
    ], ribbon.overdueTaskCount > 0 ? 'Follow up on overdue tasks in the work-queue lanes.' : undefined),
    'due-soon': kpi('due-soon', 'Due soon', `${ribbon.dueSoonTaskCount} tasks are due in the next 7 days.`, [
      { label: 'Due in ≤7d', count: ribbon.dueSoonTaskCount },
    ]),
    'outstanding-docs': kpi('outstanding-docs', 'Outstanding documents', `${ribbon.outstandingDocumentCount} document rows are outstanding.`, [
      { label: 'Outstanding documents', count: ribbon.outstandingDocumentCount },
    ]),
    'pending-review': kpi('pending-review', 'Pending review', `${ribbon.docsPendingReviewCount} received documents are pending review.`, [
      { label: 'Pending review', count: ribbon.docsPendingReviewCount },
    ]),
    blocked: kpi('blocked', 'Blocked deals', `${ribbon.blockedDealCount} deals have a blocking condition.`, [
      { label: 'Blocked', count: ribbon.blockedDealCount },
    ], ribbon.blockedDealCount > 0 ? 'Review blocked deals on the execution board.' : undefined),
    'at-risk': kpi('at-risk', 'At-risk deals', `${ribbon.atRiskDealCount} deals are at risk.`, [
      { label: 'At risk', count: ribbon.atRiskDealCount },
    ], ribbon.atRiskDealCount > 0 ? 'Triage at-risk deals before they become blocked.' : undefined),
    'stale-deals': kpi('stale-deals', 'Stale deals', `${ribbon.staleDealCount} deals have no record activity in 14+ days.`, [
      { label: 'Stale deals', count: ribbon.staleDealCount },
    ]),
    'closing-30d': kpi('closing-30d', 'Closing 30d', `${ribbon.closingNext30DayCount} deals close within the next 30 days.`, [
      { label: 'Closing ≤30d', count: ribbon.closingNext30DayCount },
    ]),
  };
}

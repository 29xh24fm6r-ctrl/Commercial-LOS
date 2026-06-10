/**
 * Phase 144B — Manager cockpit drill-through adapters.
 *
 * Pure mappers from the already-derived Manager pipeline command strip into
 * read-only {@link DrillThroughTarget}s for the KPI ribbon tiles. No new loader,
 * no Dataverse query, no write, no fake data — every value comes from the strip
 * the cockpit already renders. Missing values yield honest unavailable targets.
 */

import {
  buildDrillThroughTarget,
  type DetailRow,
  type DrillThroughSourceCount,
  type DrillThroughTarget,
} from '../shared/drillthrough/drillThroughTypes';
import type { ManagerPipelineCommandStrip } from './managerPipelineSnapshot';

const SURFACE = 'manager_control_panel' as const;

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** All manager KPI ribbon targets, keyed by the tile's `data-manager-kpi` slug. */
export function managerKpiTargets(strip: ManagerPipelineCommandStrip): Record<string, DrillThroughTarget> {
  const kpi = (
    slug: string,
    title: string,
    summary: string,
    opts: {
      sourceCounts?: DrillThroughSourceCount[];
      sourceFields?: DetailRow[];
      warnings?: string[];
      nextReviewStep?: string;
      unavailableReason?: string;
    } = {},
  ): DrillThroughTarget =>
    buildDrillThroughTarget({
      id: `manager-kpi-${slug}`,
      title,
      subtitle: 'Manager KPI',
      surface: SURFACE,
      entityKind: 'kpi',
      summary,
      sourceCounts: opts.sourceCounts,
      sourceFields: opts.sourceFields,
      warnings: opts.warnings,
      nextReviewStep: opts.nextReviewStep,
      unavailableReason: opts.unavailableReason,
    });

  return {
    'active-deals': kpi('active-deals', 'Active deals', `${strip.activeDealCount} authorized active deals on the team.`, {
      sourceCounts: [{ label: 'Active deals', count: strip.activeDealCount }],
    }),
    'pipeline-amount': kpi('pipeline-amount', 'Pipeline amount', `Sum of populated deal amounts: ${formatCurrency(strip.totalPipelineAmount)}.`, {
      sourceFields: [{ label: 'Pipeline amount', value: formatCurrency(strip.totalPipelineAmount), source: 'sum of populated deal amounts' }],
      sourceCounts: [{ label: 'Active deals', count: strip.activeDealCount }],
    }),
    'closing-30d': kpi('closing-30d', 'Closing 30d', `${strip.closingNext30DayCount} deals close within 30 days (${formatCurrency(strip.closingNext30DayAmount)}).`, {
      sourceCounts: [{ label: 'Closing ≤30d', count: strip.closingNext30DayCount }],
      sourceFields: [{ label: 'Closing exposure', value: formatCurrency(strip.closingNext30DayAmount), source: 'deals with targetCloseDate ≤30d' }],
    }),
    'closing-30d-$': kpi('closing-30d-$', 'Closing 30d $', `Exposure on deals closing within 30 days: ${formatCurrency(strip.closingNext30DayAmount)}.`, {
      sourceFields: [{ label: 'Closing exposure', value: formatCurrency(strip.closingNext30DayAmount), source: 'sum of amounts on deals closing ≤30d' }],
      sourceCounts: [{ label: 'Closing ≤30d', count: strip.closingNext30DayCount }],
    }),
    blocked: kpi('blocked', 'Blocked deals', `${strip.blockedDealCount} deals have a blocking condition.`, {
      sourceCounts: [
        { label: 'Blocked', count: strip.blockedDealCount },
        { label: 'Blocked + at-risk', count: strip.blockerAtRiskCount },
      ],
      nextReviewStep: strip.blockedDealCount > 0 ? 'Review the Exception tape and triage each blocked deal.' : undefined,
    }),
    'at-risk': kpi('at-risk', 'At-risk deals', `${strip.atRiskDealCount} deals are at risk (overdue / stalled / missing data).`, {
      sourceCounts: [{ label: 'At risk', count: strip.atRiskDealCount }],
      nextReviewStep: strip.atRiskDealCount > 0 ? 'Triage at-risk deals before they become blocked.' : undefined,
    }),
    'missing-data': kpi('missing-data', 'Missing data', `${strip.missingDataCount} deals have at least one missing required field.`, {
      sourceCounts: [{ label: 'Deals missing fields', count: strip.missingDataCount }],
      warnings: strip.missingDataCount > 0 ? ['Some deals are missing required fields; figures may be incomplete.'] : undefined,
    }),
    'stale-deals': kpi('stale-deals', 'Stale deals', `${strip.staleDealCount} deals have no record activity in 14+ days.`, {
      sourceCounts: [{ label: 'Stale deals', count: strip.staleDealCount }],
    }),
    'outstanding-docs': kpi('outstanding-docs', 'Outstanding documents', `${strip.outstandingDocumentCount} outstanding documents across the team.`, {
      sourceCounts: [{ label: 'Outstanding documents', count: strip.outstandingDocumentCount }],
    }),
    'open-tasks': kpi('open-tasks', 'Open tasks', `${strip.openTaskCount} open tasks (${strip.overdueTaskCount} overdue).`, {
      sourceCounts: [
        { label: 'Open tasks', count: strip.openTaskCount },
        { label: 'Overdue tasks', count: strip.overdueTaskCount },
      ],
    }),
    'overdue-tasks': kpi('overdue-tasks', 'Overdue tasks', `${strip.overdueTaskCount} open tasks are past their due date.`, {
      sourceCounts: [{ label: 'Overdue tasks', count: strip.overdueTaskCount }],
      nextReviewStep: strip.overdueTaskCount > 0 ? 'Follow up on overdue tasks with the responsible bankers.' : undefined,
    }),
    'avg-days-in-stage':
      strip.avgDaysInStage === undefined
        ? kpi('avg-days-in-stage', 'Avg days in stage', 'Average days-in-stage cannot be computed in the current scope.', {
            unavailableReason: 'No deal has a populated stage-entry date, so average days-in-stage cannot be computed yet.',
          })
        : kpi('avg-days-in-stage', 'Avg days in stage', `Mean days-in-stage is ${strip.avgDaysInStage}d.`, {
            sourceFields: [{ label: 'Avg days in stage', value: `${strip.avgDaysInStage}d`, source: 'mean over deals with a stage-entry date' }],
          }),
  };
}

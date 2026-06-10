/**
 * Phase 144B — Portfolio cockpit drill-through adapters.
 *
 * Pure mappers from the already-derived Portfolio Command snapshot into read-only
 * {@link DrillThroughTarget}s for the KPI ribbon tiles and the analytics chart
 * cards. No new loader, no Dataverse query, no write, no fake data — every value
 * comes from data the cockpit already rendered. Absent data yields an honest
 * unavailable target, never a fabricated row.
 */

import {
  buildDrillThroughTarget,
  type DetailRow,
  type DrillThroughSourceCount,
  type DrillThroughTarget,
} from '../shared/drillthrough/drillThroughTypes';
import type {
  PortfolioCommandRibbon,
  PortfolioConcentrationRow,
  PortfolioExceptionRow,
} from './portfolioCommandSnapshot';

const SURFACE = 'portfolio_command_center' as const;

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function exceptionRows(exceptions: readonly PortfolioExceptionRow[], severity: 'blocked' | 'at-risk'): DetailRow[] {
  return exceptions
    .filter((e) => e.severity === severity)
    .map((e) => ({
      label: e.dealName,
      value: `${e.bankerName ?? 'Unassigned'} · ${e.reason}`,
      source: 'portfolio exceptions',
    }));
}

/** All portfolio KPI ribbon targets, keyed by the tile's `data-portfolio-kpi` slug. */
export function portfolioKpiTargets(
  ribbon: PortfolioCommandRibbon,
  exceptions: readonly PortfolioExceptionRow[] = [],
): Record<string, DrillThroughTarget> {
  const blockedDeals = exceptionRows(exceptions, 'blocked');
  const atRiskDeals = exceptionRows(exceptions, 'at-risk');

  const kpi = (
    slug: string,
    title: string,
    summary: string,
    opts: {
      sourceCounts?: DrillThroughSourceCount[];
      sourceFields?: DetailRow[];
      detailRows?: DetailRow[];
      detailTitle?: string;
      detailEmpty?: string;
      warnings?: string[];
      nextReviewStep?: string;
      unavailableReason?: string;
    } = {},
  ): DrillThroughTarget =>
    buildDrillThroughTarget({
      id: `portfolio-kpi-${slug}`,
      title,
      subtitle: 'Portfolio KPI',
      surface: SURFACE,
      entityKind: 'kpi',
      summary,
      sourceCounts: opts.sourceCounts,
      sourceFields: opts.sourceFields,
      detailSections: opts.detailRows
        ? [{ title: opts.detailTitle ?? 'Contributing deals', rows: opts.detailRows, emptyMessage: opts.detailEmpty }]
        : undefined,
      warnings: opts.warnings,
      nextReviewStep: opts.nextReviewStep,
      unavailableReason: opts.unavailableReason,
    });

  return {
    'active-deals': kpi('active-deals', 'Active deals', `${ribbon.activeDealCount} authorized active deals on the portfolio.`, {
      sourceCounts: [{ label: 'Active deals', count: ribbon.activeDealCount }],
    }),
    'total-exposure': kpi('total-exposure', 'Total exposure', `Sum of populated deal amounts: ${formatCurrency(ribbon.totalExposure)}.`, {
      sourceFields: [{ label: 'Total exposure', value: formatCurrency(ribbon.totalExposure), source: 'sum of populated deal amounts' }],
      sourceCounts: [{ label: 'Active deals', count: ribbon.activeDealCount }],
    }),
    'closing-30d': kpi('closing-30d', 'Closing 30d', `${ribbon.closingNext30DayCount} deals close within 30 days (${formatCurrency(ribbon.closingNext30DayAmount)}).`, {
      sourceCounts: [{ label: 'Closing ≤30d', count: ribbon.closingNext30DayCount }],
      sourceFields: [{ label: 'Closing exposure', value: formatCurrency(ribbon.closingNext30DayAmount), source: 'deals with targetCloseDate ≤30d' }],
    }),
    'closing-30d-$': kpi('closing-30d-$', 'Closing 30d $', `Exposure on deals closing within 30 days: ${formatCurrency(ribbon.closingNext30DayAmount)}.`, {
      sourceFields: [{ label: 'Closing exposure', value: formatCurrency(ribbon.closingNext30DayAmount), source: 'sum of amounts on deals closing ≤30d' }],
      sourceCounts: [{ label: 'Closing ≤30d', count: ribbon.closingNext30DayCount }],
    }),
    blocked: kpi('blocked', 'Blocked deals', `${ribbon.blockedDealCount} deals have a blocking condition.`, {
      sourceCounts: [{ label: 'Blocked', count: ribbon.blockedDealCount }],
      detailRows: blockedDeals,
      detailEmpty: 'No blocked deals in the current scope.',
      nextReviewStep: ribbon.blockedDealCount > 0 ? 'Review each blocked deal with the responsible banker.' : undefined,
    }),
    'at-risk': kpi('at-risk', 'At-risk deals', `${ribbon.atRiskDealCount} deals are at risk (overdue / stalled / missing data).`, {
      sourceCounts: [{ label: 'At risk', count: ribbon.atRiskDealCount }],
      detailRows: atRiskDeals,
      detailEmpty: 'No at-risk deals in the current scope.',
      nextReviewStep: ribbon.atRiskDealCount > 0 ? 'Triage at-risk deals before they become blocked.' : undefined,
    }),
    'missing-data': kpi('missing-data', 'Missing data', `${ribbon.missingDataCount} deals have at least one missing required field.`, {
      sourceCounts: [{ label: 'Deals missing fields', count: ribbon.missingDataCount }],
      warnings: ribbon.missingDataCount > 0 ? ['Some deals are missing required fields; figures may be incomplete.'] : undefined,
    }),
    'stale-deals': kpi('stale-deals', 'Stale deals', `${ribbon.staleDealCount} deals have no record activity in 14+ days.`, {
      sourceCounts: [{ label: 'Stale deals', count: ribbon.staleDealCount }],
    }),
    'outstanding-docs': kpi('outstanding-docs', 'Outstanding documents', `${ribbon.outstandingDocumentCount} outstanding documents across the portfolio.`, {
      sourceCounts: [{ label: 'Outstanding documents', count: ribbon.outstandingDocumentCount }],
    }),
    'open-tasks': kpi('open-tasks', 'Open tasks', `${ribbon.openTaskCount} open (non-completed) tasks across the portfolio.`, {
      sourceCounts: [{ label: 'Open tasks', count: ribbon.openTaskCount }],
    }),
    'avg-days-in-stage':
      ribbon.avgDaysInStage === undefined
        ? kpi('avg-days-in-stage', 'Avg days in stage', 'Average days-in-stage cannot be computed in the current scope.', {
            unavailableReason: 'No deal has a populated stage-entry date, so average days-in-stage cannot be computed yet.',
          })
        : kpi('avg-days-in-stage', 'Avg days in stage', `Mean days-in-stage is ${ribbon.avgDaysInStage}d.`, {
            sourceFields: [{ label: 'Avg days in stage', value: `${ribbon.avgDaysInStage}d`, source: 'mean over deals with a stage-entry date' }],
          }),
  };
}

/**
 * Builds a drill-through target for an analytics chart card, explaining each
 * segment as a contributing source count. Concentration rows additionally expose
 * exposure + share in a detail section.
 */
export function portfolioChartTarget(
  id: string,
  title: string,
  subtitle: string,
  rows: readonly PortfolioConcentrationRow[],
): DrillThroughTarget {
  const sourceCounts: DrillThroughSourceCount[] = rows.map((r) => ({ label: r.label, count: r.dealCount }));
  const detailRows: DetailRow[] = rows.map((r) => ({
    label: r.label,
    value: `${r.dealCount} deals · ${formatCurrency(r.totalExposure)} · ${r.sharePct}% share`,
    source: 'portfolio concentration',
    warning: r.isUnknown ? 'unknown / unset bucket' : undefined,
  }));
  return buildDrillThroughTarget({
    id: `portfolio-chart-${id}`,
    title,
    subtitle,
    surface: SURFACE,
    entityKind: 'metric',
    summary: rows.length === 0 ? `${title}: no data in the current scope.` : `${title} across ${rows.length} segments.`,
    sourceCounts,
    detailSections: rows.length === 0 ? undefined : [{ title: 'Segments', rows: detailRows }],
    unavailableReason: rows.length === 0 ? `${title} has no contributing segments in the current scope.` : undefined,
  });
}

/** Simple {label,value} segment chart target (donut / histogram / forecast). */
export function portfolioSegmentChartTarget(
  id: string,
  title: string,
  subtitle: string,
  segments: ReadonlyArray<{ label: string; value: number }>,
): DrillThroughTarget {
  const nonZero = segments.filter((s) => s.value > 0);
  return buildDrillThroughTarget({
    id: `portfolio-chart-${id}`,
    title,
    subtitle,
    surface: SURFACE,
    entityKind: 'metric',
    summary: nonZero.length === 0 ? `${title}: no data in the current scope.` : `${title} across ${nonZero.length} segments.`,
    sourceCounts: segments.map((s) => ({ label: s.label, count: s.value })),
    unavailableReason: nonZero.length === 0 ? `${title} has no contributing data in the current scope.` : undefined,
  });
}

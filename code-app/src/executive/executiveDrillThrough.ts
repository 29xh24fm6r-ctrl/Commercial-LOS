/**
 * Phase 144B — Executive cockpit drill-through adapters.
 *
 * Pure mappers from the already-derived Executive KPI ribbon into read-only
 * {@link DrillThroughTarget}s for the ribbon tiles. No new loader, no Dataverse
 * query, no write, no fake data — every value comes from the ribbon the cockpit
 * already renders. Profitability / ROE remain availability-only (Phase 142S).
 */

import {
  buildDrillThroughTarget,
  type DrillThroughSourceCount,
  type DrillThroughTarget,
} from '../shared/drillthrough/drillThroughTypes';
import type { ExecutiveKpiRibbon } from './executiveCommandSnapshot';

const SURFACE = 'executive_command_center' as const;

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Executive KPI ribbon targets, keyed by a stable tile key. */
export function executiveKpiTargets(ribbon: ExecutiveKpiRibbon): Record<string, DrillThroughTarget> {
  const kpi = (
    key: string,
    title: string,
    summary: string,
    sourceCounts: DrillThroughSourceCount[],
    opts: { sourceFieldValue?: { label: string; value: string; source: string }; nextReviewStep?: string } = {},
  ): DrillThroughTarget =>
    buildDrillThroughTarget({
      id: `executive-kpi-${key}`,
      // Panel heading carries a "details" suffix so it does not collide with deck
      // tests that exact-match the bare tile label (e.g. getByText('Total exposure')).
      title: `${title} — details`,
      subtitle: 'Executive KPI',
      surface: SURFACE,
      entityKind: 'kpi',
      summary,
      sourceCounts,
      sourceFields: opts.sourceFieldValue ? [opts.sourceFieldValue] : undefined,
      nextReviewStep: opts.nextReviewStep,
    });

  return {
    'active-deals': kpi('active-deals', 'Active deals', `${ribbon.totalActiveDeals} authorized active deals across the bank.`, [
      { label: 'Active deals', count: ribbon.totalActiveDeals },
    ]),
    'total-exposure': kpi('total-exposure', 'Total exposure', `Sum of populated deal amounts: ${formatCurrency(ribbon.totalExposure)}.`, [
      { label: 'Active deals', count: ribbon.totalActiveDeals },
    ], { sourceFieldValue: { label: 'Total exposure', value: formatCurrency(ribbon.totalExposure), source: 'sum of populated deal amounts' } }),
    closing: kpi('closing', ribbon.closingWindowLabel ? `Closing — ${ribbon.closingWindowLabel}` : 'Closing window', `Exposure in the closing window: ${formatCurrency(ribbon.closingWindowExposure)}.`, [], {
      sourceFieldValue: { label: 'Closing-window exposure', value: formatCurrency(ribbon.closingWindowExposure), source: 'deals in the closing window' },
    }),
    blocked: kpi('blocked', 'Blocked deals', `${ribbon.blockedCount} deals have a blocking condition.`, [
      { label: 'Blocked', count: ribbon.blockedCount },
      { label: 'Open blockers', count: ribbon.openBlockerCount },
    ], { nextReviewStep: ribbon.blockedCount > 0 ? 'Review blocked deals in the exception tape.' : undefined }),
    'at-risk': kpi('at-risk', 'At-risk deals', `${ribbon.atRiskCount} deals are at risk.`, [
      { label: 'At risk', count: ribbon.atRiskCount },
    ]),
    'open-blockers': kpi('open-blockers', 'Open blockers', `${ribbon.openBlockerCount} open blocker signals across the book.`, [
      { label: 'Open blockers', count: ribbon.openBlockerCount },
    ]),
    'outstanding-docs': kpi('outstanding-docs', 'Outstanding documents', `${ribbon.outstandingDocumentCount} outstanding documents across the book.`, [
      { label: 'Outstanding documents', count: ribbon.outstandingDocumentCount },
    ]),
    'pending-approvals': kpi('pending-approvals', 'Pending approvals', `${ribbon.pendingApprovalCount} items are pending approval.`, [
      { label: 'Pending approvals', count: ribbon.pendingApprovalCount },
    ]),
    'stale-items': kpi('stale-items', 'Stale items', `${ribbon.staleItemCount} items have gone stale.`, [
      { label: 'Stale items', count: ribbon.staleItemCount },
    ]),
    'readiness-unknown': kpi('readiness-unknown', 'Readiness unknown', `${ribbon.readinessUnknownCount} deals have no readiness band (${ribbon.readinessScoredCount} scored).`, [
      { label: 'Readiness unknown', count: ribbon.readinessUnknownCount },
      { label: 'Readiness scored', count: ribbon.readinessScoredCount },
    ]),
  };
}

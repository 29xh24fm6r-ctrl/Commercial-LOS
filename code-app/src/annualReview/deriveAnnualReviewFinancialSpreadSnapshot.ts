/**
 * Phase 141O — Annual review financial SPREAD snapshot deriver.
 *
 * PURE, evidence-backed. Derives spread metrics + trends ONLY from trusted fact
 * refs. Unknown stays unknown; conflicting facts go to review; nothing is
 * fabricated or annualized without explicit policy; every metric carries its
 * source fact / document ids.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. Metrics derive only from countable (trusted, non-generic) facts.
 *   - Missing facts → unknown_missing_data. Conflicting facts → review_required.
 *   - Interim periods are never annualized here.
 */

import type {
  AnnualReviewFinancialSpreadInput,
  AnnualReviewFinancialSpreadSnapshot,
  AnnualReviewFinancialMetric,
  AnnualReviewFinancialTrend,
  AnnualReviewFinancialFactRef,
  AnnualReviewFinancialPeriod,
  AnnualReviewSpreadStatus,
} from './annualReviewFinancialTypes';
import { isCountableFact } from './annualReviewFinancialFacts';

interface MetricSpec {
  metricKey: string;
  label: string;
  unit: string;
}

const METRIC_CATALOG: readonly MetricSpec[] = [
  { metricKey: 'revenue', label: 'Revenue', unit: 'currency' },
  { metricKey: 'gross_profit', label: 'Gross profit', unit: 'currency' },
  { metricKey: 'ebitda', label: 'EBITDA', unit: 'currency' },
  { metricKey: 'net_income', label: 'Net income', unit: 'currency' },
  { metricKey: 'total_assets', label: 'Total assets', unit: 'currency' },
  { metricKey: 'total_liabilities', label: 'Total liabilities', unit: 'currency' },
  { metricKey: 'tangible_net_worth', label: 'Tangible net worth', unit: 'currency' },
  { metricKey: 'current_assets', label: 'Current assets', unit: 'currency' },
  { metricKey: 'current_liabilities', label: 'Current liabilities', unit: 'currency' },
  { metricKey: 'cash', label: 'Cash', unit: 'currency' },
  { metricKey: 'debt', label: 'Debt', unit: 'currency' },
  { metricKey: 'debt_service', label: 'Debt service', unit: 'currency' },
  { metricKey: 'owner_distributions', label: 'Owner distributions', unit: 'currency' },
  { metricKey: 'ar_aging', label: 'AR aging', unit: 'currency' },
  { metricKey: 'ap_aging', label: 'AP aging', unit: 'currency' },
  { metricKey: 'inventory', label: 'Inventory', unit: 'currency' },
];

function deriveMetric(
  spec: MetricSpec,
  periodId: string,
  facts: readonly AnnualReviewFinancialFactRef[],
): AnnualReviewFinancialMetric {
  const relevant = facts.filter(
    (f) => isCountableFact(f) && f.metricKey === spec.metricKey && f.periodId === periodId,
  );
  if (relevant.length === 0) {
    return { metricKey: spec.metricKey, label: spec.label, value: null, unit: spec.unit, periodId, sourceFactIds: [], status: 'unknown_missing_data', confidence: 'low', warnings: [], blockers: [] };
  }
  const distinctValues = new Set(relevant.map((f) => f.value));
  const hasReview = relevant.some((f) => f.status === 'review_required' || f.reviewRequired);
  if (distinctValues.size > 1 || hasReview) {
    return { metricKey: spec.metricKey, label: spec.label, value: null, unit: spec.unit, periodId, sourceFactIds: relevant.map((f) => f.factId), status: 'review_required', confidence: 'low', warnings: distinctValues.size > 1 ? ['Conflicting source facts.'] : ['Source fact flagged for review.'], blockers: [] };
  }
  const fact = relevant[0];
  return { metricKey: spec.metricKey, label: spec.label, value: fact.value, unit: spec.unit, periodId, sourceFactIds: relevant.map((f) => f.factId), status: 'available', confidence: fact.confidence, warnings: [], blockers: [] };
}

function primaryPeriods(periods: readonly AnnualReviewFinancialPeriod[]): AnnualReviewFinancialPeriod[] {
  return [...periods]
    .filter((p) => !p.periodReviewRequired)
    .sort((a, b) => b.fiscalYear - a.fiscalYear);
}

function trend(
  key: string,
  label: string,
  metricKey: string,
  current: AnnualReviewFinancialMetric | undefined,
  prior: AnnualReviewFinancialMetric | undefined,
): AnnualReviewFinancialTrend {
  if (!current || !prior || current.value === null || prior.value === null || current.status !== 'available' || prior.status !== 'available') {
    return { trendKey: key, label, direction: 'not_available', status: 'unknown_missing_data', sourceMetricKeys: [metricKey] };
  }
  const change = prior.value === 0 ? undefined : ((current.value - prior.value) / Math.abs(prior.value)) * 100;
  let direction: AnnualReviewFinancialTrend['direction'] = 'stable';
  if (current.value > prior.value) direction = 'improving';
  else if (current.value < prior.value) direction = 'declining';
  return { trendKey: key, label, direction, fromPeriodId: prior.periodId, toPeriodId: current.periodId, fromValue: prior.value, toValue: current.value, changePercent: change, status: 'available', sourceMetricKeys: [metricKey] };
}

export function deriveAnnualReviewFinancialSpreadSnapshot(
  input: AnnualReviewFinancialSpreadInput,
): AnnualReviewFinancialSpreadSnapshot {
  const { facts } = input;
  const ordered = primaryPeriods(input.periods);
  const primary = ordered[0];
  const prior = ordered[1];

  if (!primary) {
    return {
      annualReviewId: input.annualReviewId,
      metrics: [],
      trends: [],
      periodsCovered: [],
      status: 'unknown',
      blockers: [{ code: 'no_available_period', message: 'No unambiguous financial period to spread.' }],
      warnings: [],
      auditSummary: { evidenceFactIds: [], evidenceDocumentIds: [], unknownMetrics: [], containsFabricatedValue: false },
    };
  }

  const metrics: AnnualReviewFinancialMetric[] = METRIC_CATALOG.map((spec) => deriveMetric(spec, primary.periodId, facts));

  // Derived working capital = current assets − current liabilities (both available).
  const ca = metrics.find((m) => m.metricKey === 'current_assets');
  const cl = metrics.find((m) => m.metricKey === 'current_liabilities');
  if (ca?.status === 'available' && cl?.status === 'available' && ca.value !== null && cl.value !== null) {
    metrics.push({ metricKey: 'working_capital', label: 'Working capital', value: ca.value - cl.value, unit: 'currency', periodId: primary.periodId, sourceFactIds: [...ca.sourceFactIds, ...cl.sourceFactIds], status: 'available', confidence: 'medium', warnings: [], blockers: [] });
  } else {
    metrics.push({ metricKey: 'working_capital', label: 'Working capital', value: null, unit: 'currency', periodId: primary.periodId, sourceFactIds: [], status: 'unknown_missing_data', confidence: 'low', warnings: [], blockers: [] });
  }

  // Trends (current vs prior annual period).
  const trends: AnnualReviewFinancialTrend[] = [];
  if (prior) {
    const priorMetric = (key: string) => deriveMetric(METRIC_CATALOG.find((s) => s.metricKey === key)!, prior.periodId, facts);
    trends.push(trend('yoy_revenue', 'Revenue (YoY)', 'revenue', metrics.find((m) => m.metricKey === 'revenue'), priorMetric('revenue')));
    trends.push(trend('yoy_ebitda', 'EBITDA (YoY)', 'ebitda', metrics.find((m) => m.metricKey === 'ebitda'), priorMetric('ebitda')));
    trends.push(trend('yoy_net_income', 'Net income (YoY)', 'net_income', metrics.find((m) => m.metricKey === 'net_income'), priorMetric('net_income')));
    const priorCa = priorMetric('current_assets');
    const priorCl = priorMetric('current_liabilities');
    const priorWc = priorCa.status === 'available' && priorCl.status === 'available' && priorCa.value !== null && priorCl.value !== null
      ? { ...priorCa, metricKey: 'working_capital', value: priorCa.value - priorCl.value }
      : undefined;
    trends.push(trend('working_capital_trend', 'Working capital', 'working_capital', metrics.find((m) => m.metricKey === 'working_capital'), priorWc));
  }

  const available = metrics.filter((m) => m.status === 'available').length;
  const review = metrics.some((m) => m.status === 'review_required');
  let status: AnnualReviewSpreadStatus;
  if (review) status = 'review_required';
  else if (available === 0) status = 'unknown';
  else if (available === metrics.length) status = 'available';
  else status = 'partial';

  const evidenceFactIds = Array.from(new Set(metrics.flatMap((m) => m.sourceFactIds)));
  const evidenceDocumentIds = Array.from(new Set(facts.filter((f) => evidenceFactIds.includes(f.factId)).map((f) => f.sourceDocumentId)));
  const unknownMetrics = metrics.filter((m) => m.status === 'unknown_missing_data').map((m) => m.metricKey);

  return {
    annualReviewId: input.annualReviewId,
    metrics,
    trends,
    periodsCovered: ordered.map((p) => p.periodId),
    status,
    blockers: [],
    warnings: [],
    auditSummary: { evidenceFactIds, evidenceDocumentIds, unknownMetrics, containsFabricatedValue: false },
  };
}

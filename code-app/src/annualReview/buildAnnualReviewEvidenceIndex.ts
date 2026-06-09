/**
 * Phase 141P — Annual review EVIDENCE INDEX builder.
 *
 * PURE. Builds a traceable evidence index from documents, trusted facts, the
 * spread snapshot, and covenant results. Missing evidence becomes a missing item
 * (never invented); superseded / system-invalidated / rejected facts are
 * excluded; ambiguous-period facts are marked review_required.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No fake document names / page numbers / source facts.
 *   - Every claim is traceable; what is missing is listed, not fabricated.
 */

import type {
  AnnualReviewFinancialDocumentRequirement,
  AnnualReviewFinancialFactRef,
  AnnualReviewFinancialPeriod,
  AnnualReviewFinancialSpreadSnapshot,
  AnnualReviewCovenantTestingSnapshot,
} from './annualReviewFinancialTypes';
import { isCountableFact } from './annualReviewFinancialFacts';
import type {
  AnnualReviewEvidenceIndex,
  AnnualReviewEvidenceItem,
  AnnualReviewPackageAuditSummary,
} from './annualReviewPackageTypes';

/** Required metrics whose absence is a missing-evidence item (others are optional). */
const REQUIRED_METRIC_KEYS: readonly string[] = [
  'revenue', 'ebitda', 'net_income', 'tangible_net_worth',
  'current_assets', 'current_liabilities', 'debt_service', 'cash',
];

export interface BuildAnnualReviewEvidenceIndexInput {
  annualReviewId: string;
  documents: readonly AnnualReviewFinancialDocumentRequirement[];
  facts: readonly AnnualReviewFinancialFactRef[];
  spread: AnnualReviewFinancialSpreadSnapshot;
  covenants: AnnualReviewCovenantTestingSnapshot;
  periods?: readonly AnnualReviewFinancialPeriod[];
}

export function buildAnnualReviewEvidenceIndex(
  input: BuildAnnualReviewEvidenceIndexInput,
): AnnualReviewEvidenceIndex {
  const items: AnnualReviewEvidenceItem[] = [];
  const ambiguousPeriodIds = new Set(
    (input.periods ?? []).filter((p) => p.periodReviewRequired).map((p) => p.periodId),
  );

  // 1. Documents — accepted are present; required-but-missing are missing items.
  for (const d of input.documents) {
    if (d.accepted) {
      items.push({
        evidenceId: `ev-doc-${d.requirementId}`, label: d.label, evidenceType: 'document',
        sourceDocumentId: d.sourceDocumentId, sourceFactIds: [], relatedSection: 'financial_performance',
        relatedMetricKeys: [], relatedCovenantIds: [], status: 'present', confidence: 'high', caveats: [],
      });
    } else if (d.required) {
      items.push({
        evidenceId: `ev-doc-${d.requirementId}`, label: d.label, evidenceType: 'document',
        sourceFactIds: [], relatedSection: 'financial_performance', relatedMetricKeys: [], relatedCovenantIds: [],
        status: 'missing', confidence: 'low', caveats: [], missingReason: 'Required document not received/accepted.',
      });
    }
  }

  // 2. Financial facts — only countable (trusted, non-generic) facts. Facts in
  //    an ambiguous period are marked review_required.
  for (const f of input.facts) {
    if (!isCountableFact(f)) continue;
    const reviewRequired = ambiguousPeriodIds.has(f.periodId) || f.status === 'review_required' || f.reviewRequired;
    items.push({
      evidenceId: `ev-fact-${f.factId}`, label: f.metricKey, evidenceType: 'financial_fact',
      sourceDocumentId: f.sourceDocumentId, sourcePage: f.sourcePage, sourceFactIds: [f.factId],
      relatedSection: 'financial_performance', relatedMetricKeys: [f.metricKey], relatedCovenantIds: [],
      status: reviewRequired ? 'review_required' : 'present', confidence: f.confidence,
      caveats: reviewRequired ? ['Ambiguous period or fact flagged for review.'] : [],
    });
  }

  // 3. Required spread metrics that are unknown → missing evidence items.
  //    Optional metrics (e.g. inventory, AR/AP aging) are not forced.
  for (const m of input.spread.metrics) {
    if (m.status === 'unknown_missing_data' && REQUIRED_METRIC_KEYS.includes(m.metricKey)) {
      items.push({
        evidenceId: `ev-metric-${m.metricKey}`, label: m.label, evidenceType: 'financial_fact',
        sourceFactIds: [], relatedSection: 'financial_performance', relatedMetricKeys: [m.metricKey], relatedCovenantIds: [],
        status: 'missing', confidence: 'low', caveats: [], missingReason: 'No trusted source fact for this metric.',
      });
    }
  }

  // 4. Covenant results → evidence items (unknown/review become non-present).
  for (const r of input.covenants.results) {
    const status = r.status === 'pass' || r.status === 'fail' ? 'present' : r.status === 'review_required' ? 'review_required' : 'missing';
    items.push({
      evidenceId: `ev-cov-${r.covenantId}`, label: r.label, evidenceType: 'covenant_result',
      sourceFactIds: r.sourceFactIds, sourceDocumentId: r.sourceDocumentIds[0], relatedSection: 'covenant_compliance',
      relatedMetricKeys: [], relatedCovenantIds: [r.covenantId], status: status as AnnualReviewEvidenceItem['status'],
      confidence: r.confidence, caveats: status === 'missing' ? ['Covenant could not be tested with available evidence.'] : [],
      missingReason: status === 'missing' ? `Covenant status: ${r.status}.` : undefined,
    });
  }

  const missingItems = items.filter((i) => i.status === 'missing');
  const reviewRequiredItems = items.filter((i) => i.status === 'review_required');
  const status: AnnualReviewEvidenceIndex['status'] =
    missingItems.length === 0 && reviewRequiredItems.length === 0
      ? 'complete'
      : items.some((i) => i.status === 'present')
        ? 'partial'
        : 'incomplete';

  const evidenceFactIds = Array.from(new Set(items.flatMap((i) => i.sourceFactIds)));
  const evidenceDocumentIds = Array.from(new Set(items.map((i) => i.sourceDocumentId).filter((x): x is string => !!x)));
  const auditSummary: AnnualReviewPackageAuditSummary = {
    evidenceFactIds, evidenceDocumentIds,
    unresolvedItems: [...missingItems, ...reviewRequiredItems].map((i) => i.evidenceId),
    containsFinalDecision: false,
  };

  return { annualReviewId: input.annualReviewId, items, missingItems, reviewRequiredItems, status, auditSummary };
}

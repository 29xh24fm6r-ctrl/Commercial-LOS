/**
 * Phase 141O — Annual review financial MEMO section builder.
 *
 * PURE. Builds DRAFT memo sections from the financial analysis snapshot. Unknown
 * metrics are explicitly labeled unknown, covenant failures are described as
 * findings requiring review, evidence references and caveats are included, and
 * there is NO final approval/decline recommendation and no fabricated ratios.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No final credit recommendation. Evidence refs preserved.
 */

import type { AnnualReviewFinancialAnalysisSnapshot } from './annualReviewFinancialTypes';

export interface AnnualReviewFinancialMemoSection {
  key: string;
  title: string;
  draftOnly: true;
  lines: readonly string[];
  evidenceFactIds: readonly string[];
  evidenceDocumentIds: readonly string[];
  caveats: readonly string[];
}

export interface AnnualReviewFinancialMemoSections {
  financialPerformance: AnnualReviewFinancialMemoSection;
  covenantCompliance: AnnualReviewFinancialMemoSection;
  evidenceCaveats: AnnualReviewFinancialMemoSection;
  missingData: AnnualReviewFinancialMemoSection;
  recommendedFollowUp: AnnualReviewFinancialMemoSection;
}

const DRAFT_NOTE = 'Draft only. No final credit recommendation is made in this phase.';

export function buildAnnualReviewFinancialMemoSections(
  snapshot: AnnualReviewFinancialAnalysisSnapshot,
): AnnualReviewFinancialMemoSections {
  // Financial performance — sourced metrics; unknowns explicitly labeled.
  const perfLines = snapshot.keyMetrics.map((m) =>
    m.status === 'available' && m.value !== null
      ? `${m.label}: ${m.value} (${m.unit}) [facts: ${m.sourceFactIds.join(', ') || 'none'}]`
      : `${m.label}: unknown (${m.status})`,
  );
  const perfFactIds = snapshot.keyMetrics.flatMap((m) => m.sourceFactIds);

  // Covenant compliance — pass/fail/unknown as findings.
  const covLines = snapshot.covenantResults.map((r) => `${r.label}: ${r.status} — ${r.result}`);
  const covFactIds = snapshot.covenantResults.flatMap((r) => r.sourceFactIds);
  const covDocIds = snapshot.covenantResults.flatMap((r) => r.sourceDocumentIds);

  // Missing data — explicit unknowns.
  const unknownMetricLines = snapshot.keyMetrics.filter((m) => m.status !== 'available').map((m) => `${m.label}: ${m.status}`);
  const unknownCovenantLines = snapshot.covenantResults.filter((r) => r.status.startsWith('unknown_') || r.status === 'review_required').map((r) => `${r.label}: ${r.status}`);

  return {
    financialPerformance: {
      key: 'financial_performance', title: 'Financial performance', draftOnly: true,
      lines: perfLines.length > 0 ? perfLines : ['No spread metrics available.'],
      evidenceFactIds: Array.from(new Set(perfFactIds)), evidenceDocumentIds: [],
      caveats: [DRAFT_NOTE, 'Unknown metrics are labeled unknown and not estimated.'],
    },
    covenantCompliance: {
      key: 'covenant_compliance', title: 'Covenant compliance', draftOnly: true,
      lines: covLines.length > 0 ? covLines : ['No covenants resolved for testing.'],
      evidenceFactIds: Array.from(new Set(covFactIds)), evidenceDocumentIds: Array.from(new Set(covDocIds)),
      caveats: [DRAFT_NOTE, 'Covenant failures are findings requiring review, not credit decisions. No waiver is applied automatically.'],
    },
    evidenceCaveats: {
      key: 'evidence_caveats', title: 'Evidence & caveats', draftOnly: true,
      lines: [`Evidence facts: ${snapshot.evidenceSummary.factIds.length}`, `Evidence documents: ${snapshot.evidenceSummary.documentIds.length}`],
      evidenceFactIds: snapshot.evidenceSummary.factIds, evidenceDocumentIds: snapshot.evidenceSummary.documentIds,
      caveats: [DRAFT_NOTE],
    },
    missingData: {
      key: 'missing_data', title: 'Missing data', draftOnly: true,
      lines: [...unknownMetricLines, ...unknownCovenantLines].length > 0 ? [...unknownMetricLines, ...unknownCovenantLines] : ['No missing data identified.'],
      evidenceFactIds: [], evidenceDocumentIds: [],
      caveats: [DRAFT_NOTE],
    },
    recommendedFollowUp: {
      key: 'recommended_follow_up', title: 'Recommended follow-up', draftOnly: true,
      lines: snapshot.nextBestActions.map((a) => a.label),
      evidenceFactIds: [], evidenceDocumentIds: [],
      caveats: [DRAFT_NOTE],
    },
  };
}

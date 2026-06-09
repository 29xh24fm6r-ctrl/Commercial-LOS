/**
 * Phase 141P — Annual review memo / board / FDIC package types.
 *
 * The evidence-backed, DRAFT-ONLY model for institutional annual-review
 * packages. Every package is caveated and traceable to evidence; missing data
 * stays missing.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - TYPES only. No IO, no fabricated content, no sample values.
 *   - There is NO approved / submitted / filed / sent / exported_final status,
 *     and no final credit recommendation.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type AnnualReviewPackageType =
  | 'annual_review_credit_memo'
  | 'annual_review_board_package'
  | 'annual_review_fdic_package';

export type AnnualReviewPackageStatus =
  | 'draft_not_ready'
  | 'draft_ready_with_caveats'
  | 'review_ready'
  | 'blocked_missing_evidence'
  | 'blocked_missing_financials'
  | 'blocked_unknown_covenants'
  | 'blocked_policy_exception'
  | 'disabled_not_configured';

export type AnnualReviewEvidenceItemStatus = 'present' | 'missing' | 'review_required';

export type AnnualReviewEvidenceType =
  | 'document'
  | 'financial_fact'
  | 'covenant_result'
  | 'borrower_request'
  | 'audit_entry';

// ---------------------------------------------------------------------------
// Blockers / caveats / audit
// ---------------------------------------------------------------------------

export interface AnnualReviewPackageBlocker {
  code: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface AnnualReviewPackageCaveat {
  code: string;
  message: string;
}

export interface AnnualReviewPackageAuditSummary {
  evidenceFactIds: readonly string[];
  evidenceDocumentIds: readonly string[];
  unresolvedItems: readonly string[];
  /** STRUCTURAL: packages are draft-only and never carry a final decision. */
  containsFinalDecision: false;
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// Evidence index
// ---------------------------------------------------------------------------

export interface AnnualReviewEvidenceItem {
  evidenceId: string;
  label: string;
  evidenceType: AnnualReviewEvidenceType;
  sourceDocumentId?: string;
  sourceDocumentName?: string;
  sourcePage?: number;
  sourceFactIds: readonly string[];
  relatedSection: string;
  relatedMetricKeys: readonly string[];
  relatedCovenantIds: readonly string[];
  status: AnnualReviewEvidenceItemStatus;
  confidence: 'high' | 'medium' | 'low';
  caveats: readonly string[];
  missingReason?: string;
}

export interface AnnualReviewEvidenceIndex {
  annualReviewId: string;
  items: readonly AnnualReviewEvidenceItem[];
  missingItems: readonly AnnualReviewEvidenceItem[];
  reviewRequiredItems: readonly AnnualReviewEvidenceItem[];
  status: 'complete' | 'partial' | 'incomplete';
  auditSummary: AnnualReviewPackageAuditSummary;
}

// ---------------------------------------------------------------------------
// Sections + packages
// ---------------------------------------------------------------------------

export interface AnnualReviewPackageSectionBase {
  key: string;
  title: string;
  draftOnly: true;
  lines: readonly string[];
  evidenceFactIds: readonly string[];
  evidenceDocumentIds: readonly string[];
  caveats: readonly string[];
}

export type AnnualReviewMemoSection = AnnualReviewPackageSectionBase;
export type AnnualReviewBoardPackageSection = AnnualReviewPackageSectionBase;
export type AnnualReviewFdicPackageSection = AnnualReviewPackageSectionBase;

export interface AnnualReviewMemoPackage {
  annualReviewId: string;
  packageType: 'annual_review_credit_memo';
  status: AnnualReviewPackageStatus;
  sections: readonly AnnualReviewMemoSection[];
  blockers: readonly AnnualReviewPackageBlocker[];
  caveats: readonly AnnualReviewPackageCaveat[];
  /** STRUCTURAL: never a final credit recommendation in this phase. */
  finalCreditRecommendation: null;
  auditSummary: AnnualReviewPackageAuditSummary;
}

export interface AnnualReviewBoardPackage {
  annualReviewId: string;
  packageType: 'annual_review_board_package';
  status: AnnualReviewPackageStatus;
  sections: readonly AnnualReviewBoardPackageSection[];
  blockers: readonly AnnualReviewPackageBlocker[];
  caveats: readonly AnnualReviewPackageCaveat[];
  finalCreditRecommendation: null;
  auditSummary: AnnualReviewPackageAuditSummary;
}

export interface AnnualReviewFdicPackage {
  annualReviewId: string;
  packageType: 'annual_review_fdic_package';
  status: AnnualReviewPackageStatus;
  sections: readonly AnnualReviewFdicPackageSection[];
  blockers: readonly AnnualReviewPackageBlocker[];
  caveats: readonly AnnualReviewPackageCaveat[];
  auditSummary: AnnualReviewPackageAuditSummary;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface AnnualReviewPackageReadiness {
  annualReviewId: string;
  memoStatus: AnnualReviewPackageStatus;
  boardStatus: AnnualReviewPackageStatus;
  fdicStatus: AnnualReviewPackageStatus;
  financialsComplete: boolean;
  covenantsComplete: boolean;
  evidenceComplete: boolean;
  reviewReady: boolean;
  boardReady: boolean;
  fdicReady: boolean;
  blockers: readonly AnnualReviewPackageBlocker[];
  caveats: readonly AnnualReviewPackageCaveat[];
  nextBestActions: readonly { code: string; label: string }[];
  auditSummary: AnnualReviewPackageAuditSummary;
}

// ---------------------------------------------------------------------------
// Export preview (disabled adapter)
// ---------------------------------------------------------------------------

export interface AnnualReviewPackageExportPreview {
  packageType: AnnualReviewPackageType;
  status: AnnualReviewPackageStatus;
  sectionCount: number;
  evidenceCount: number;
  /** STRUCTURAL: export is disabled and no file is generated in this phase. */
  exportEnabled: false;
  hasGeneratedFile: false;
  notes: string;
}

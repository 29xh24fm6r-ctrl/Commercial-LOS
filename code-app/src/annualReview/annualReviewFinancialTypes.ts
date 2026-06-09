/**
 * Phase 141O — Annual review financial spreading + covenant testing types.
 *
 * The evidence-backed model for annual-review financial analysis: periods,
 * document requirements, fact references, spread metrics/trends, covenant
 * definitions/tests, and the combined analysis snapshot.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - TYPES only. No IO, no fabricated financials, no sample values.
 *   - Missing means missing; ambiguous periods go to review; covenant status is
 *     unknown when source facts are missing or untrusted.
 *   - There is NO automatic waiver state and NO final credit recommendation.
 */

import type { AnnualReviewDocumentType } from '../shared/annualReview/annualReviewTypes';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type AnnualReviewConfidence = 'high' | 'medium' | 'low';

export type AnnualReviewFinancialPeriodType =
  | 'annual'
  | 'interim'
  | 'ytd'
  | 'quarter'
  | 'trailing_twelve'
  | 'unknown';

export type AnnualReviewStatementType =
  | 'balance_sheet'
  | 'income_statement'
  | 'cash_flow'
  | 'aging'
  | 'covenant'
  | 'other';

export type AnnualReviewFactStatus =
  | 'extracted'
  | 'accepted'
  | 'rejected'
  | 'review_required'
  | 'superseded';

export type AnnualReviewMetricStatus =
  | 'available'
  | 'unknown_missing_data'
  | 'review_required'
  | 'not_applicable';

export type AnnualReviewFinancialReadinessStatus =
  | 'spread_ready'
  | 'blocked'
  | 'review_required'
  | 'not_started';

export type AnnualReviewSpreadStatus =
  | 'available'
  | 'partial'
  | 'unknown'
  | 'review_required';

export type AnnualReviewTrendDirection =
  | 'improving'
  | 'declining'
  | 'stable'
  | 'not_available';

export type AnnualReviewCovenantType =
  | 'dscr'
  | 'debt_to_tangible_net_worth'
  | 'current_ratio'
  | 'liquidity_minimum'
  | 'tangible_net_worth_minimum'
  | 'leverage_maximum'
  | 'borrowing_base_required'
  | 'reporting_requirement'
  | 'insurance_requirement'
  | 'tax_return_requirement'
  | 'financial_statement_delivery_requirement';

export type AnnualReviewCovenantOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'required';

export type AnnualReviewCovenantResultStatus =
  | 'pass'
  | 'fail'
  | 'unknown_missing_data'
  | 'unknown_ambiguous_period'
  | 'unknown_no_definition'
  | 'not_applicable'
  | 'review_required';

export type AnnualReviewCovenantSource =
  | 'boarded_loan'
  | 'originated_deal'
  | 'loan_agreement_fact'
  | 'manual';

// ---------------------------------------------------------------------------
// Blockers + audit
// ---------------------------------------------------------------------------

export interface AnnualReviewFinancialBlocker {
  code: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface AnnualReviewFinancialAuditSummary {
  evidenceFactIds: readonly string[];
  evidenceDocumentIds: readonly string[];
  unknownMetrics: readonly string[];
  /** STRUCTURAL: outputs are evidence-backed, never fabricated. */
  containsFabricatedValue: false;
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// Periods + documents + facts
// ---------------------------------------------------------------------------

export interface AnnualReviewFinancialPeriod {
  periodId: string;
  fiscalYear: number;
  periodType: AnnualReviewFinancialPeriodType;
  periodStartDate?: string;
  periodEndDate?: string;
  statementDate?: string;
  sourceDocumentIds: readonly string[];
  confidence: AnnualReviewConfidence;
  /** True when the period is ambiguous and must go to human review. */
  periodReviewRequired: boolean;
  warnings: readonly string[];
  blockers: readonly AnnualReviewFinancialBlocker[];
}

export interface AnnualReviewFinancialDocumentRequirement {
  requirementId: string;
  documentType: AnnualReviewDocumentType;
  label: string;
  fiscalYear: number;
  required: boolean;
  received: boolean;
  accepted: boolean;
  sourceDocumentId?: string;
  blockerCode?: string;
  notes?: string;
}

export interface AnnualReviewFinancialFactRef {
  factId: string;
  canonicalType: string;
  statementType: AnnualReviewStatementType;
  metricKey: string;
  periodId: string;
  value: number | null;
  unit: string;
  sourceDocumentId: string;
  sourcePage?: number;
  confidence: AnnualReviewConfidence;
  status: AnnualReviewFactStatus;
  isSuperseded: boolean;
  systemInvalidated: boolean;
  reviewRequired: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Metrics + trends + spread
// ---------------------------------------------------------------------------

export interface AnnualReviewFinancialMetric {
  metricKey: string;
  label: string;
  value: number | null;
  unit: string;
  periodId?: string;
  sourceFactIds: readonly string[];
  status: AnnualReviewMetricStatus;
  confidence: AnnualReviewConfidence;
  warnings: readonly string[];
  blockers: readonly AnnualReviewFinancialBlocker[];
}

export interface AnnualReviewFinancialTrend {
  trendKey: string;
  label: string;
  direction: AnnualReviewTrendDirection;
  fromPeriodId?: string;
  toPeriodId?: string;
  fromValue?: number;
  toValue?: number;
  changePercent?: number;
  status: AnnualReviewMetricStatus;
  sourceMetricKeys: readonly string[];
}

export interface AnnualReviewFinancialReadinessResult {
  annualReviewId: string;
  fiscalYear: number;
  requiredDocuments: readonly AnnualReviewFinancialDocumentRequirement[];
  availableDocuments: readonly AnnualReviewFinancialDocumentRequirement[];
  missingDocuments: readonly AnnualReviewFinancialDocumentRequirement[];
  acceptedDocuments: readonly AnnualReviewFinancialDocumentRequirement[];
  rejectedDocuments: readonly AnnualReviewFinancialDocumentRequirement[];
  availablePeriods: readonly AnnualReviewFinancialPeriod[];
  missingPeriods: readonly number[];
  ambiguousPeriods: readonly AnnualReviewFinancialPeriod[];
  readinessStatus: AnnualReviewFinancialReadinessStatus;
  blockers: readonly AnnualReviewFinancialBlocker[];
  warnings: readonly string[];
  nextBestAction: { code: string; label: string };
}

export interface AnnualReviewFinancialSpreadInput {
  annualReviewId: string;
  readiness: AnnualReviewFinancialReadinessResult;
  facts: readonly AnnualReviewFinancialFactRef[];
  periods: readonly AnnualReviewFinancialPeriod[];
}

export interface AnnualReviewFinancialSpreadSnapshot {
  annualReviewId: string;
  metrics: readonly AnnualReviewFinancialMetric[];
  trends: readonly AnnualReviewFinancialTrend[];
  periodsCovered: readonly string[];
  status: AnnualReviewSpreadStatus;
  blockers: readonly AnnualReviewFinancialBlocker[];
  warnings: readonly string[];
  auditSummary: AnnualReviewFinancialAuditSummary;
}

// ---------------------------------------------------------------------------
// Covenants
// ---------------------------------------------------------------------------

export interface AnnualReviewCovenantDefinition {
  covenantId: string;
  label: string;
  covenantType: AnnualReviewCovenantType;
  operator?: AnnualReviewCovenantOperator;
  thresholdValue?: number;
  thresholdUnit?: string;
  testFrequency?: string;
  source: AnnualReviewCovenantSource;
  sourceDocumentId?: string;
  active: boolean;
  /** Set when the definition is incomplete and must go to review. */
  definitionBlocker?: string;
  notes?: string;
}

export interface AnnualReviewCovenantTestInput {
  definitions: readonly AnnualReviewCovenantDefinition[];
  spread: AnnualReviewFinancialSpreadSnapshot;
  readiness: AnnualReviewFinancialReadinessResult;
  testedPeriodId?: string;
}

export interface AnnualReviewCovenantTestResult {
  covenantId: string;
  label: string;
  covenantType: AnnualReviewCovenantType;
  testedPeriodId?: string;
  actualValue?: number;
  thresholdValue?: number;
  status: AnnualReviewCovenantResultStatus;
  /** Short human-readable result description (finding language, not a decision). */
  result: string;
  sourceFactIds: readonly string[];
  sourceDocumentIds: readonly string[];
  confidence: AnnualReviewConfidence;
  blockers: readonly AnnualReviewFinancialBlocker[];
  warnings: readonly string[];
  auditSummary: AnnualReviewFinancialAuditSummary;
}

export interface AnnualReviewCovenantTestingSnapshot {
  results: readonly AnnualReviewCovenantTestResult[];
  passCount: number;
  failCount: number;
  unknownCount: number;
  reviewCount: number;
  blockers: readonly AnnualReviewFinancialBlocker[];
  warnings: readonly string[];
  auditSummary: AnnualReviewFinancialAuditSummary;
}

// ---------------------------------------------------------------------------
// Combined analysis snapshot
// ---------------------------------------------------------------------------

export interface AnnualReviewFinancialMemoSectionRef {
  key: string;
  title: string;
  draftReady: boolean;
}

export interface AnnualReviewFinancialAnalysisSnapshot {
  annualReviewId: string;
  overallFinancialReadiness: AnnualReviewFinancialReadinessStatus;
  spreadStatus: AnnualReviewSpreadStatus;
  covenantStatus: 'all_pass' | 'has_failures' | 'has_unknowns' | 'review_required' | 'no_covenants';
  primaryBlockers: readonly AnnualReviewFinancialBlocker[];
  keyMetrics: readonly AnnualReviewFinancialMetric[];
  trendSummary: readonly AnnualReviewFinancialTrend[];
  covenantResults: readonly AnnualReviewCovenantTestResult[];
  evidenceSummary: {
    factIds: readonly string[];
    documentIds: readonly string[];
  };
  nextBestActions: readonly { code: string; label: string }[];
  memoReadySections: readonly AnnualReviewFinancialMemoSectionRef[];
  boardPackageReady: boolean;
  fdicPackageReady: boolean;
  /** STRUCTURAL: this phase never emits a final credit recommendation. */
  finalCreditRecommendation: null;
  auditSummary: AnnualReviewFinancialAuditSummary;
}

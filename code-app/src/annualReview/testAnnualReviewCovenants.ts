/**
 * Phase 141O — Annual review covenant TESTING engine.
 *
 * PURE, evidence-backed. Tests active covenant definitions against the financial
 * spread snapshot and readiness. Missing source facts → unknown_missing_data;
 * ambiguous periods → unknown_ambiguous_period; incomplete definitions →
 * unknown_no_definition. It NEVER produces a waiver/approval and failures become
 * review findings, not credit decisions.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No automatic waiver. No credit decision.
 *   - Unknown stays unknown when facts are missing/untrusted/ambiguous.
 */

import type {
  AnnualReviewCovenantTestInput,
  AnnualReviewCovenantTestingSnapshot,
  AnnualReviewCovenantTestResult,
  AnnualReviewCovenantDefinition,
  AnnualReviewCovenantOperator,
  AnnualReviewFinancialSpreadSnapshot,
  AnnualReviewFinancialReadinessResult,
  AnnualReviewFinancialMetric,
  AnnualReviewFinancialAuditSummary,
} from './annualReviewFinancialTypes';
import type { AnnualReviewDocumentType } from '../shared/annualReview/annualReviewTypes';

function metric(spread: AnnualReviewFinancialSpreadSnapshot, key: string): AnnualReviewFinancialMetric | undefined {
  return spread.metrics.find((m) => m.metricKey === key);
}

function compare(actual: number, operator: AnnualReviewCovenantOperator, threshold: number): boolean {
  switch (operator) {
    case 'gte': return actual >= threshold;
    case 'lte': return actual <= threshold;
    case 'gt': return actual > threshold;
    case 'lt': return actual < threshold;
    case 'eq': return actual === threshold;
    default: return false;
  }
}

function audit(factIds: readonly string[], docIds: readonly string[]): AnnualReviewFinancialAuditSummary {
  return { evidenceFactIds: factIds, evidenceDocumentIds: docIds, unknownMetrics: [], containsFabricatedValue: false };
}

const RATIO_TYPES = new Set(['dscr', 'debt_to_tangible_net_worth', 'current_ratio', 'leverage_maximum']);
const SINGLE_METRIC: Record<string, string> = { liquidity_minimum: 'cash', tangible_net_worth_minimum: 'tangible_net_worth' };
const DOC_COVENANTS: Record<string, AnnualReviewDocumentType> = {
  borrowing_base_required: 'borrowing_base_certificate',
  reporting_requirement: 'annual_financial_statements',
  financial_statement_delivery_requirement: 'annual_financial_statements',
  insurance_requirement: 'insurance_evidence',
  tax_return_requirement: 'tax_returns',
};

function ratioInputs(type: string): [string, string] {
  if (type === 'dscr') return ['ebitda', 'debt_service'];
  if (type === 'current_ratio') return ['current_assets', 'current_liabilities'];
  if (type === 'debt_to_tangible_net_worth') return ['debt', 'tangible_net_worth'];
  return ['total_liabilities', 'tangible_net_worth']; // leverage_maximum
}

function defaultOperator(type: string): AnnualReviewCovenantOperator {
  if (type === 'leverage_maximum' || type === 'debt_to_tangible_net_worth') return 'lte';
  return 'gte';
}

function testOne(
  def: AnnualReviewCovenantDefinition,
  spread: AnnualReviewFinancialSpreadSnapshot,
  readiness: AnnualReviewFinancialReadinessResult,
  testedPeriodId: string | undefined,
): AnnualReviewCovenantTestResult {
  const base = { covenantId: def.covenantId, label: def.label, covenantType: def.covenantType, testedPeriodId, sourceFactIds: [] as string[], sourceDocumentIds: [] as string[], confidence: 'low' as const, blockers: [], warnings: [] };

  // Incomplete numeric definition → cannot be tested.
  if (def.definitionBlocker) {
    return { ...base, status: 'unknown_no_definition', result: 'Covenant definition is incomplete (missing threshold/operator).', actualValue: undefined, thresholdValue: def.thresholdValue, auditSummary: audit([], []) };
  }

  const isRatio = RATIO_TYPES.has(def.covenantType);
  const isSingle = def.covenantType in SINGLE_METRIC;

  // Ambiguous period blocks financial covenant testing.
  if ((isRatio || isSingle) && readiness.ambiguousPeriods.length > 0) {
    return { ...base, status: 'unknown_ambiguous_period', result: 'Tested period is ambiguous; covenant not tested.', thresholdValue: def.thresholdValue, auditSummary: audit([], []) };
  }

  // Document-receipt covenants.
  const docType = DOC_COVENANTS[def.covenantType];
  if (docType) {
    const accepted = readiness.acceptedDocuments.find((d) => d.documentType === docType);
    const missing = readiness.missingDocuments.find((d) => d.documentType === docType);
    if (accepted) {
      return { ...base, status: 'pass', result: `${def.label}: required document received and accepted.`, sourceDocumentIds: accepted.sourceDocumentId ? [accepted.sourceDocumentId] : [], confidence: 'high', auditSummary: audit([], accepted.sourceDocumentId ? [accepted.sourceDocumentId] : []) };
    }
    if (missing) {
      return { ...base, status: 'fail', result: `${def.label}: required document is missing (finding requires review).`, auditSummary: audit([], []) };
    }
    return { ...base, status: 'unknown_missing_data', result: `${def.label}: document receipt could not be confirmed.`, auditSummary: audit([], []) };
  }

  // Numeric covenants.
  if (isRatio) {
    const [numKey, denKey] = ratioInputs(def.covenantType);
    const num = metric(spread, numKey);
    const den = metric(spread, denKey);
    if (!num || !den || num.status === 'unknown_missing_data' || den.status === 'unknown_missing_data' || num.value === null || den.value === null || den.value === 0) {
      return { ...base, status: 'unknown_missing_data', result: `${def.label}: required inputs (${numKey}, ${denKey}) are missing.`, thresholdValue: def.thresholdValue, auditSummary: audit([...num?.sourceFactIds ?? [], ...den?.sourceFactIds ?? []], []) };
    }
    if (num.status === 'review_required' || den.status === 'review_required') {
      return { ...base, status: 'review_required', result: `${def.label}: source facts require review.`, thresholdValue: def.thresholdValue, auditSummary: audit([...num.sourceFactIds, ...den.sourceFactIds], []) };
    }
    const actual = num.value / den.value;
    const op = def.operator ?? defaultOperator(def.covenantType);
    const threshold = def.thresholdValue!;
    const pass = compare(actual, op, threshold);
    return { ...base, status: pass ? 'pass' : 'fail', result: `${def.label}: actual ${actual.toFixed(2)} ${op} ${threshold} → ${pass ? 'pass' : 'fail (finding)'}.`, actualValue: actual, thresholdValue: threshold, sourceFactIds: [...num.sourceFactIds, ...den.sourceFactIds], confidence: 'medium', auditSummary: audit([...num.sourceFactIds, ...den.sourceFactIds], []) };
  }

  if (isSingle) {
    const key = SINGLE_METRIC[def.covenantType];
    const m = metric(spread, key);
    if (!m || m.status === 'unknown_missing_data' || m.value === null) {
      return { ...base, status: 'unknown_missing_data', result: `${def.label}: required input (${key}) is missing.`, thresholdValue: def.thresholdValue, auditSummary: audit(m?.sourceFactIds ?? [], []) };
    }
    if (m.status === 'review_required') {
      return { ...base, status: 'review_required', result: `${def.label}: source fact requires review.`, thresholdValue: def.thresholdValue, auditSummary: audit(m.sourceFactIds, []) };
    }
    const op = def.operator ?? 'gte';
    const pass = compare(m.value, op, def.thresholdValue!);
    return { ...base, status: pass ? 'pass' : 'fail', result: `${def.label}: actual ${m.value} ${op} ${def.thresholdValue} → ${pass ? 'pass' : 'fail (finding)'}.`, actualValue: m.value, thresholdValue: def.thresholdValue, sourceFactIds: m.sourceFactIds, confidence: 'medium', auditSummary: audit(m.sourceFactIds, []) };
  }

  return { ...base, status: 'not_applicable', result: `${def.label}: not applicable.`, auditSummary: audit([], []) };
}

export function testAnnualReviewCovenants(
  input: AnnualReviewCovenantTestInput,
): AnnualReviewCovenantTestingSnapshot {
  const active = input.definitions.filter((d) => d.active);
  const results = active.map((d) => testOne(d, input.spread, input.readiness, input.testedPeriodId));

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const reviewCount = results.filter((r) => r.status === 'review_required').length;
  const unknownCount = results.filter((r) => r.status.startsWith('unknown_')).length;

  const evidenceFactIds = Array.from(new Set(results.flatMap((r) => r.sourceFactIds)));
  const evidenceDocumentIds = Array.from(new Set(results.flatMap((r) => r.sourceDocumentIds)));

  return {
    results,
    passCount,
    failCount,
    unknownCount,
    reviewCount,
    blockers: [],
    warnings: [],
    auditSummary: { evidenceFactIds, evidenceDocumentIds, unknownMetrics: [], containsFabricatedValue: false },
  };
}

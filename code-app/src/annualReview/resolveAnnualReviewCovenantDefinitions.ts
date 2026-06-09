/**
 * Phase 141O — Annual review covenant DEFINITION resolver.
 *
 * PURE. Resolves covenant definitions from boarded-loan covenant records, the
 * originated deal (only when linked + authoritative), and manually entered
 * definitions. It invents no covenants; an incomplete definition (missing
 * threshold / operator on a numeric covenant) becomes a review_required
 * definition blocker; inactive covenants are excluded by default.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - No IO. No invented covenants. Source references preserved.
 */

import type {
  AnnualReviewCovenantDefinition,
  AnnualReviewCovenantType,
  AnnualReviewCovenantOperator,
  AnnualReviewCovenantSource,
} from './annualReviewFinancialTypes';

export interface RawCovenantRecord {
  covenantId: string;
  label?: string;
  covenantType: AnnualReviewCovenantType;
  operator?: AnnualReviewCovenantOperator;
  thresholdValue?: number;
  thresholdUnit?: string;
  testFrequency?: string;
  active?: boolean;
  sourceDocumentId?: string;
  notes?: string;
}

export interface ResolveAnnualReviewCovenantDefinitionsInput {
  boardedLoanCovenants?: readonly RawCovenantRecord[];
  originatedDealCovenants?: readonly RawCovenantRecord[];
  /** Only use originated-deal covenants when the deal is linked + authoritative. */
  originatedDealLinked?: boolean;
  manualDefinitions?: readonly RawCovenantRecord[];
  /** Include inactive covenants (historical view). Default: false. */
  includeInactive?: boolean;
}

/** Numeric covenant types that require a threshold + operator to be complete. */
const NUMERIC_COVENANT_TYPES: readonly AnnualReviewCovenantType[] = [
  'dscr',
  'debt_to_tangible_net_worth',
  'current_ratio',
  'liquidity_minimum',
  'tangible_net_worth_minimum',
  'leverage_maximum',
];

function map(record: RawCovenantRecord, source: AnnualReviewCovenantSource): AnnualReviewCovenantDefinition {
  const numeric = NUMERIC_COVENANT_TYPES.includes(record.covenantType);
  const incomplete = numeric && (record.thresholdValue === undefined || record.operator === undefined);
  return {
    covenantId: record.covenantId,
    label: record.label ?? record.covenantId,
    covenantType: record.covenantType,
    operator: record.operator ?? (numeric ? undefined : 'required'),
    thresholdValue: record.thresholdValue,
    thresholdUnit: record.thresholdUnit,
    testFrequency: record.testFrequency,
    source,
    sourceDocumentId: record.sourceDocumentId,
    active: record.active !== false,
    definitionBlocker: incomplete ? 'missing_threshold' : undefined,
    notes: record.notes,
  };
}

export function resolveAnnualReviewCovenantDefinitions(
  input: ResolveAnnualReviewCovenantDefinitionsInput,
): readonly AnnualReviewCovenantDefinition[] {
  const byId = new Map<string, AnnualReviewCovenantDefinition>();

  // Boarded-loan records are the preferred / authoritative source.
  for (const r of input.boardedLoanCovenants ?? []) {
    byId.set(r.covenantId, map(r, 'boarded_loan'));
  }
  // Manual definitions fill gaps but never override a boarded-loan covenant.
  for (const r of input.manualDefinitions ?? []) {
    if (!byId.has(r.covenantId)) byId.set(r.covenantId, map(r, 'manual'));
  }
  // Originated-deal covenants only when explicitly linked + authoritative.
  if (input.originatedDealLinked === true) {
    for (const r of input.originatedDealCovenants ?? []) {
      if (!byId.has(r.covenantId)) byId.set(r.covenantId, map(r, 'originated_deal'));
    }
  }

  const all = Array.from(byId.values());
  return input.includeInactive ? all : all.filter((d) => d.active);
}

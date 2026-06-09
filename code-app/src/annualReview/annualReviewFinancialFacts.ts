/**
 * Phase 141O — Annual review financial fact-trust helpers (pure).
 *
 * Shared rules for which facts may drive evidence-backed outputs: superseded,
 * system-invalidated, and rejected facts NEVER count, and generic financial keys
 * do not satisfy readiness or spreading.
 */

import type { AnnualReviewFinancialFactRef } from './annualReviewFinancialTypes';

/** Generic / unclassified keys that must never satisfy readiness or spreading. */
export const GENERIC_FINANCIAL_KEYS: readonly string[] = Object.freeze([
  'generic',
  'generic_amount',
  'unclassified',
  'unknown',
  'amount',
  'value',
]);

export function isGenericFinancialFact(fact: AnnualReviewFinancialFactRef): boolean {
  return (
    GENERIC_FINANCIAL_KEYS.includes(fact.metricKey.toLowerCase()) ||
    fact.canonicalType.toLowerCase() === 'generic'
  );
}

/** A fact may be used as evidence only when it is not excluded and not generic. */
export function isTrustedFact(fact: AnnualReviewFinancialFactRef): boolean {
  if (fact.status === 'rejected') return false;
  if (fact.isSuperseded) return false;
  if (fact.systemInvalidated) return false;
  return true;
}

/** Countable for readiness/spreading: trusted AND not a generic key. */
export function isCountableFact(fact: AnnualReviewFinancialFactRef): boolean {
  return isTrustedFact(fact) && !isGenericFinancialFact(fact);
}

/**
 * Phase 262 (F) — rate-index model.
 *
 * A small, pure model for the reference indexes that variable-rate loans price
 * off (Prime / SOFR / 5-Year Treasury / Other). There is no live external rate
 * feed and no Dataverse rate-index table, so index values are NOT fabricated:
 * an operator enters the current value, its effective date, and a source in the
 * Variable Rate Control Center. This module only defines the shape + lookups
 * and is the single place that knows the index list.
 */

export type RateIndexType = 'Prime' | 'SOFR' | '5-Year Treasury' | 'Other';

export const RATE_INDEX_TYPES: readonly RateIndexType[] = Object.freeze([
  'Prime',
  'SOFR',
  '5-Year Treasury',
  'Other',
]);

/** One operator-entered index reading. `value` is a percent (e.g. 5.5 = 5.5%). */
export interface RateIndexValue {
  readonly indexType: RateIndexType;
  readonly value: number;
  /** ISO date the value is effective. */
  readonly effectiveDate: string;
  /** Where the value came from (e.g. "WSJ Prime", "FRED SOFR", "manual entry"). */
  readonly source: string;
}

/** Current index readings keyed by index type. Unset indexes are undefined. */
export type RateIndexBook = Partial<Record<RateIndexType, RateIndexValue>>;

/** Normalize a free-text index label to a known RateIndexType, or 'Other'. */
export function normalizeIndexType(raw: string | null | undefined): RateIndexType | undefined {
  const t = (raw ?? '').trim().toLowerCase();
  if (t.length === 0) return undefined;
  if (t === 'prime' || t.includes('prime')) return 'Prime';
  if (t === 'sofr' || t.includes('sofr')) return 'SOFR';
  if (t.includes('treasury') || t.includes('cmt') || /\b5[\s-]?(year|yr)\b/.test(t)) return '5-Year Treasury';
  return 'Other';
}

/** Look up a current index value from the book; undefined if not entered. */
export function indexValueFor(book: RateIndexBook, indexType: RateIndexType | undefined): RateIndexValue | undefined {
  if (!indexType) return undefined;
  return book[indexType];
}

/** Build a book from a list of operator-entered readings (last wins per type). */
export function buildRateIndexBook(values: readonly RateIndexValue[]): RateIndexBook {
  const book: RateIndexBook = {};
  for (const v of values) {
    if (typeof v.value === 'number' && !Number.isNaN(v.value)) book[v.indexType] = v;
  }
  return book;
}

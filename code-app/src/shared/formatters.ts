/**
 * Phase 261F — null-safe display formatters.
 *
 * Dataverse returns `null` (not `undefined`) for empty numeric/date fields, and
 * `Number.isNaN(null)` is `false`, so a bare `value.toLocaleString()` on a
 * nullable field throws "Cannot read properties of null (reading
 * 'toLocaleString')" and crashes the surface into the ErrorBoundary. These
 * helpers are the single safe path: they treat null/undefined/NaN as "empty"
 * (a caller-chosen marker, default "Not provided"), render an actual `0` as
 * `$0` / `0`, and otherwise format normally.
 */

const DEFAULT_EMPTY = 'Not provided';

function isEmpty(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

export interface CurrencyOptions {
  /** Marker shown for null/undefined/NaN. Default "Not provided". */
  readonly empty?: string;
  /** Abbreviate large values ($1.2M / $500K). Default false. */
  readonly abbreviate?: boolean;
}

/** Null-safe currency. `0` → "$0"; null/undefined/NaN → empty marker. */
export function formatCurrency(value: number | null | undefined, opts: CurrencyOptions = {}): string {
  const empty = opts.empty ?? DEFAULT_EMPTY;
  if (isEmpty(value)) return empty;
  if (opts.abbreviate) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

/** Null-safe number. `0` → "0"; null/undefined/NaN → empty marker. */
export function formatNumber(value: number | null | undefined, empty: string = DEFAULT_EMPTY): string {
  if (isEmpty(value)) return empty;
  return value.toLocaleString();
}

/** Null-safe percent. `0` → "0%"; null/undefined/NaN → empty marker. */
export function formatPercent(
  value: number | null | undefined,
  opts: { empty?: string; maximumFractionDigits?: number } = {},
): string {
  const empty = opts.empty ?? DEFAULT_EMPTY;
  if (isEmpty(value)) return empty;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: opts.maximumFractionDigits ?? 2 })}%`;
}

/**
 * Null-safe date. Accepts an ISO string or a Date; an unparseable / empty value
 * returns the empty marker. Default style is a localized "Jun 26, 2026".
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts: { empty?: string; options?: Intl.DateTimeFormatOptions } = {},
): string {
  const empty = opts.empty ?? DEFAULT_EMPTY;
  if (value === null || value === undefined) return empty;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return empty;
  return d.toLocaleDateString(undefined, opts.options ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

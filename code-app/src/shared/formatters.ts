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
 * A date-only value: "2026-09-08" or the midnight-UTC form Dataverse sometimes returns for a
 * DateOnly column ("2026-09-08T00:00:00Z" / ".000Z"). Such a value denotes a CALENDAR DATE,
 * not an instant in time.
 */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/;

/**
 * Parse a business date WITHOUT timezone drift.
 *
 * A date-only value represents a calendar date, not a moment. Parsing "2026-09-08" with
 * `new Date()` treats it as midnight UTC, which `toLocaleDateString` then renders as the PRIOR
 * day for any viewer west of UTC (the live-smoke bug: stored 2026-09-08 shown as "Sep 7, 2026").
 * For a date-only value we build a LOCAL midnight so the displayed day never shifts; a full
 * timestamp (with a real time-of-day) is parsed as-is because it genuinely IS an instant.
 */
export function parseCalendarDate(value: string | Date | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const m = DATE_ONLY_RE.exec(value.trim());
  if (m) {
    const [, y, mo, d] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d)); // local midnight — no timezone shift
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

/**
 * Null-safe date. Accepts an ISO string or a Date; an unparseable / empty value
 * returns the empty marker. Default style is a localized "Jun 26, 2026". Date-only values are
 * rendered as calendar dates (no timezone day-shift); true timestamps render in local time.
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts: { empty?: string; options?: Intl.DateTimeFormatOptions } = {},
): string {
  const empty = opts.empty ?? DEFAULT_EMPTY;
  const d = parseCalendarDate(value);
  if (!d) return empty;
  return d.toLocaleDateString(undefined, opts.options ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Null-safe calendar-date display for date-only business fields (target close date, application
 * date, due dates, stage-entry date). Semantic alias of {@link formatDate} that documents intent
 * at the call site: these fields must NEVER shift a day across timezones.
 */
export function formatCalendarDate(
  value: string | Date | null | undefined,
  opts: { empty?: string; options?: Intl.DateTimeFormatOptions } = {},
): string {
  return formatDate(value, opts);
}

/**
 * N-24/D-04 remediation (Production Remediation Factory Arc Phase 9) — a shared, date-only-safe
 * "days from today" calculation. Several surfaces (Kanban, Closing Soon, Manager rollups) each
 * reimplemented `(new Date(iso).getTime() - Date.now()) / 86_400_000` to decide "today" /
 * "tomorrow" / "Nd past" labels — the same UTC-midnight-vs-local-render drift that shifts the
 * displayed calendar date also shifts these day counts near a timezone's UTC-offset boundary.
 * This compares CALENDAR DAYS (local midnight to local midnight), never raw instants, so the
 * count is stable regardless of what time of day `now` happens to be.
 */
export function daysUntilCalendarDate(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): number | undefined {
  const target = parseCalendarDate(value);
  if (!target) return undefined;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((startOfTarget - startOfToday) / 86_400_000);
}

/** True when a date-only value's calendar day is strictly before today's calendar day. */
export function isPastCalendarDate(value: string | Date | null | undefined, now: Date = new Date()): boolean {
  const days = daysUntilCalendarDate(value, now);
  return days !== undefined && days < 0;
}

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDate,
  formatCalendarDate,
  parseCalendarDate,
  daysUntilCalendarDate,
  isPastCalendarDate,
} from './formatters';

/**
 * Intake→UW repair: date-only business fields are CALENDAR dates and must never shift a day across
 * timezones (the live-smoke defect: stored 2026-09-08 shown as "Sep 7, 2026" west of UTC).
 */
describe('date-only calendar rendering (no timezone drift)', () => {
  it('parses a plain date-only string as a LOCAL calendar day (no UTC shift)', () => {
    const d = parseCalendarDate('2026-09-08')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September (0-based)
    expect(d.getDate()).toBe(8); // never the 7th, regardless of the runner's timezone
  });

  it('treats the midnight-UTC DateOnly form as the same calendar day', () => {
    for (const v of ['2026-09-08T00:00:00Z', '2026-09-08T00:00:00.000Z']) {
      const d = parseCalendarDate(v)!;
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(8);
      expect(d.getDate()).toBe(8);
    }
  });

  it('formatDate / formatCalendarDate render the stored calendar day, not the prior day', () => {
    // Assert on the day number so the check is locale/timezone independent.
    expect(formatDate('2026-09-08')).toMatch(/\b8\b/);
    expect(formatDate('2026-09-08')).not.toMatch(/\b7\b/);
    expect(formatCalendarDate('2026-09-08')).toBe(formatDate('2026-09-08'));
  });

  it('still renders a true timestamp and honest empties', () => {
    expect(parseCalendarDate(undefined)).toBeUndefined();
    expect(parseCalendarDate('not-a-date')).toBeUndefined();
    expect(formatCalendarDate('', { empty: '—' })).toBe('—');
    // A full timestamp remains an instant (parsed, non-undefined).
    expect(parseCalendarDate('2026-09-08T14:30:00Z')).toBeInstanceOf(Date);
  });
});

/**
 * N-24/D-04 remediation (Production Remediation Factory Arc Phase 9) — daysUntilCalendarDate /
 * isPastCalendarDate: the shared "how many days until this date-only field" calculation several
 * surfaces (Kanban, Closing Soon, Manager rollups) each reimplemented with the same UTC-instant
 * drift bug. These compare CALENDAR days (local midnight to local midnight), so the count is
 * correct near DST transitions, month-end, leap day, and regardless of the viewer's UTC offset.
 */
describe('daysUntilCalendarDate / isPastCalendarDate (no timezone drift)', () => {
  it('is 0 for today, 1 for tomorrow, -1 for yesterday', () => {
    const now = new Date(2026, 8, 8); // Sep 8, 2026, local midnight
    expect(daysUntilCalendarDate('2026-09-08', now)).toBe(0);
    expect(daysUntilCalendarDate('2026-09-09', now)).toBe(1);
    expect(daysUntilCalendarDate('2026-09-07', now)).toBe(-1);
  });

  it('is honestly undefined for an unparseable/absent value — never fabricated as 0', () => {
    expect(daysUntilCalendarDate(undefined)).toBeUndefined();
    expect(daysUntilCalendarDate('not-a-date')).toBeUndefined();
  });

  it('month-end: Jan 31 -> Feb 1 is exactly 1 day, not 0 or 2', () => {
    const now = new Date(2026, 0, 31); // Jan 31, 2026
    expect(daysUntilCalendarDate('2026-02-01', now)).toBe(1);
  });

  it('30-day month-end: Apr 30 -> May 1 is exactly 1 day', () => {
    const now = new Date(2026, 3, 30); // Apr 30, 2026
    expect(daysUntilCalendarDate('2026-05-01', now)).toBe(1);
  });

  it('leap day: Feb 28 -> Feb 29 -> Mar 1 in a leap year, each exactly 1 day apart', () => {
    const now = new Date(2028, 1, 28); // Feb 28, 2028 (2028 is a leap year)
    expect(daysUntilCalendarDate('2028-02-29', now)).toBe(1);
    expect(daysUntilCalendarDate('2028-03-01', now)).toBe(2);
  });

  it('non-leap year: Feb 28 -> Mar 1 is exactly 1 day (no Feb 29 to cross)', () => {
    const now = new Date(2026, 1, 28); // Feb 28, 2026 (not a leap year)
    expect(daysUntilCalendarDate('2026-03-01', now)).toBe(1);
  });

  it('DST boundary: a day count across a US spring-forward/fall-back transition is still exactly 1 day, never 0 or 2 (a 23h or 25h calendar day)', () => {
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      // 2026-03-08 is the US spring-forward date (23-hour calendar day).
      expect(daysUntilCalendarDate('2026-03-08', new Date(2026, 2, 7))).toBe(1);
      // 2026-11-01 is the US fall-back date (25-hour calendar day).
      expect(daysUntilCalendarDate('2026-11-01', new Date(2026, 9, 31))).toBe(1);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('UTC offset boundary: the same stored date-only value reads as the identical calendar day west (New York) and east (Kolkata) of UTC', () => {
    const originalTz = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York'; // UTC-04:00/-05:00
      const west = parseCalendarDate('2026-09-08T00:00:00Z')!;
      expect([west.getFullYear(), west.getMonth(), west.getDate()]).toEqual([2026, 8, 8]);

      process.env.TZ = 'Asia/Kolkata'; // UTC+05:30
      const east = parseCalendarDate('2026-09-08T00:00:00Z')!;
      expect([east.getFullYear(), east.getMonth(), east.getDate()]).toEqual([2026, 8, 8]);
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('isPastCalendarDate is true only strictly before today\'s calendar day', () => {
    const now = new Date(2026, 8, 8);
    expect(isPastCalendarDate('2026-09-07', now)).toBe(true);
    expect(isPastCalendarDate('2026-09-08', now)).toBe(false);
    expect(isPastCalendarDate('2026-09-09', now)).toBe(false);
  });
});

/**
 * Phase 261F — null-safe formatters. The crash was `null.toLocaleString()`;
 * these never throw on null/undefined/NaN and still show a real `0`.
 */

describe('formatCurrency', () => {
  it('renders $0 for an actual zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
  it('renders the empty marker for null/undefined/NaN (no crash)', () => {
    expect(formatCurrency(null)).toBe('Not provided');
    expect(formatCurrency(undefined)).toBe('Not provided');
    expect(formatCurrency(Number.NaN)).toBe('Not provided');
    expect(formatCurrency(null, { empty: '—' })).toBe('—');
  });
  it('formats values and abbreviates when asked', () => {
    expect(formatCurrency(1234)).toBe('$1,234');
    expect(formatCurrency(2_400_000, { abbreviate: true })).toBe('$2.4M');
    expect(formatCurrency(500_000, { abbreviate: true })).toBe('$500K');
    expect(formatCurrency(0, { abbreviate: true })).toBe('$0');
  });
});

describe('formatNumber', () => {
  it('is null-safe and shows a real zero', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('Not provided');
    expect(formatNumber(undefined, '—')).toBe('—');
    expect(formatNumber(1500)).toBe('1,500');
  });
});

describe('formatPercent', () => {
  it('is null-safe and shows a real zero', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('Not provided');
    expect(formatPercent(4.25)).toBe('4.25%');
    expect(formatPercent(null, { empty: '—' })).toBe('—');
  });
});

describe('formatDate', () => {
  it('is null-safe for null/undefined/invalid', () => {
    expect(formatDate(null)).toBe('Not provided');
    expect(formatDate(undefined)).toBe('Not provided');
    expect(formatDate('not-a-date')).toBe('Not provided');
    expect(formatDate('', { empty: '—' })).toBe('—');
  });
  it('formats ISO strings and Date objects', () => {
    expect(formatDate('2026-06-26T00:00:00Z', { options: { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' } })).toContain('2026');
    expect(formatDate(new Date('2026-01-15T12:00:00Z'))).toContain('2026');
  });
});

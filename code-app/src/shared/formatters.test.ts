import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatPercent, formatDate, formatCalendarDate, parseCalendarDate } from './formatters';

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

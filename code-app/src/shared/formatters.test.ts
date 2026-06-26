import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatPercent, formatDate } from './formatters';

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

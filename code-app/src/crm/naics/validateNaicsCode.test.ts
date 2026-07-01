// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeNaicsCode, isSixDigitNaicsCode, validateNaicsCode } from './validateNaicsCode';
import type { NaicsRow } from './naicsSearch';

const ROWS: NaicsRow[] = [
  { cr664_code: '561422', cr664_title: 'Telemarketing Bureaus and Other Contact Centers' },
  { cr664_code: '722511', cr664_title: 'Full-Service Restaurants' },
];

describe('normalizeNaicsCode', () => {
  it('strips non-digits and caps at six', () => {
    expect(normalizeNaicsCode('561422abc')).toBe('561422');
    expect(normalizeNaicsCode('56-14-22')).toBe('561422');
    expect(normalizeNaicsCode('5614221234')).toBe('561422'); // capped at 6
    expect(normalizeNaicsCode('  561 422 ')).toBe('561422');
    expect(normalizeNaicsCode('abc')).toBe('');
  });
});

describe('isSixDigitNaicsCode', () => {
  it('accepts exactly six digits', () => {
    expect(isSixDigitNaicsCode('561422')).toBe(true);
  });
  it('rejects short, long, and non-numeric values', () => {
    expect(isSixDigitNaicsCode('5614')).toBe(false);
    expect(isSixDigitNaicsCode('5614221')).toBe(false);
    expect(isSixDigitNaicsCode('56142a')).toBe(false);
    expect(isSixDigitNaicsCode('')).toBe(false);
  });
});

describe('validateNaicsCode (fail-closed against internal rows)', () => {
  it('found: returns the official title from the internal table', () => {
    const r = validateNaicsCode('561422', ROWS);
    expect(r).toEqual({
      code: '561422',
      title: 'Telemarketing Bureaus and Other Contact Centers',
      validFormat: true,
      found: true,
      valid: true,
    });
  });

  it('normalizes before validating (561422abc → found)', () => {
    expect(validateNaicsCode('561422abc', ROWS).valid).toBe(true);
  });

  it('well-formed but absent → found:false, never a fabricated title', () => {
    const r = validateNaicsCode('999999', ROWS);
    expect(r).toMatchObject({ code: '999999', title: null, validFormat: true, found: false, valid: false });
  });

  it('ill-formed → validFormat:false (and not found)', () => {
    const r = validateNaicsCode('5614', ROWS);
    expect(r).toMatchObject({ validFormat: false, found: false, valid: false });
  });

  it('empty rows (table not seeded) → not found, fail-closed', () => {
    expect(validateNaicsCode('561422', []).found).toBe(false);
  });
});

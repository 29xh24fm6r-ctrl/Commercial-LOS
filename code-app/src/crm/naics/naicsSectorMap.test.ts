import { describe, it, expect } from 'vitest';
import {
  NAICS_SECTORS,
  sectorForCode,
  isNaicsCode6,
  NAICS_VALID_PREFIXES,
} from './naicsSectorMap';

/**
 * Phase 1 — NAICS sector derivation. Pins the 20-sector map and, critically, the
 * three RANGED sectors where a naive substring(0,2) would be wrong.
 */

describe('NAICS sector map', () => {
  it('has the canonical 20 sectors', () => {
    expect(NAICS_SECTORS.length).toBe(20);
  });

  it('derives single-prefix sectors correctly', () => {
    expect(sectorForCode('236220')).toEqual({ sectorCode: '23', sectorTitle: 'Construction' });
    expect(sectorForCode('722511')).toEqual({
      sectorCode: '72',
      sectorTitle: 'Accommodation and Food Services',
    });
    expect(sectorForCode('541211')).toEqual({
      sectorCode: '54',
      sectorTitle: 'Professional, Scientific, and Technical Services',
    });
    expect(sectorForCode('621111')).toEqual({
      sectorCode: '62',
      sectorTitle: 'Health Care and Social Assistance',
    });
  });

  describe('ranged sectors (the substring trap)', () => {
    it('31, 32, 33 all → 31-33 Manufacturing', () => {
      for (const code of ['311111', '321113', '339999']) {
        expect(sectorForCode(code)).toEqual({ sectorCode: '31-33', sectorTitle: 'Manufacturing' });
      }
    });
    it('44, 45 both → 44-45 Retail Trade', () => {
      for (const code of ['441110', '452210']) {
        expect(sectorForCode(code)).toEqual({ sectorCode: '44-45', sectorTitle: 'Retail Trade' });
      }
      // 811111 (auto repair) is NOT retail — guards the boundary
      expect(sectorForCode('811111')?.sectorCode).toBe('81');
    });
    it('48, 49 both → 48-49 Transportation and Warehousing', () => {
      for (const code of ['481111', '493110']) {
        expect(sectorForCode(code)).toEqual({
          sectorCode: '48-49',
          sectorTitle: 'Transportation and Warehousing',
        });
      }
    });
  });

  describe('honest unknowns (never fabricate a sector)', () => {
    it('rejects non-6-digit input', () => {
      expect(sectorForCode('72')).toBeNull();
      expect(sectorForCode('7225111')).toBeNull();
      expect(sectorForCode('abcdef')).toBeNull();
      expect(sectorForCode('')).toBeNull();
    });
    it('returns null for a 6-digit code with an unassigned prefix', () => {
      // 99 / 00 are not NAICS sectors
      expect(sectorForCode('990000')).toBeNull();
      expect(sectorForCode('000000')).toBeNull();
    });
  });

  it('isNaicsCode6 validates shape', () => {
    expect(isNaicsCode6('722511')).toBe(true);
    expect(isNaicsCode6('72251')).toBe(false);
    expect(isNaicsCode6('72251a')).toBe(false);
  });

  it('isNaicsCode6 rejects non-string input instead of letting sectorForCode throw', () => {
    // A numeric NAICS would coerce through the regex but throw on .slice(); guard it.
    expect(isNaicsCode6(722511 as unknown as string)).toBe(false);
    expect(isNaicsCode6(null as unknown as string)).toBe(false);
    expect(() => sectorForCode(722511 as unknown as string)).not.toThrow();
    expect(sectorForCode(722511 as unknown as string)).toBeNull();
  });

  it('exposes the valid prefixes used by the seed validator', () => {
    expect(NAICS_VALID_PREFIXES.has('31')).toBe(true);
    expect(NAICS_VALID_PREFIXES.has('45')).toBe(true);
    expect(NAICS_VALID_PREFIXES.has('49')).toBe(true);
    expect(NAICS_VALID_PREFIXES.has('99')).toBe(false);
    // 20 sectors expand to 24 two-digit prefixes (3 ranged sectors add 4 extra)
    expect(NAICS_VALID_PREFIXES.size).toBe(24);
  });
});

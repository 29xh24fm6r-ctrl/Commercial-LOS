import { describe, it, expect } from 'vitest';
import {
  resolveDealIndustryForSector,
  resolveDealIndustryFromNaics,
  isDealIndustryLabel,
  DEAL_INDUSTRY_LABELS,
  type NaicsIndustryMapRow,
} from './naicsIndustryMap';

/**
 * NAICS sector → deal industry resolution.
 *
 * Pins: mapping comes ONLY from the admin rows (never a hard-coded guess); an
 * unmapped sector, an inactive row, or a row pointing at a non-real industry all
 * resolve to `no-mapping` (honest); an invalid / unknown-prefix code is
 * `no-sector`; mapped codes resolve through the fixed sector map.
 */

const ROWS: NaicsIndustryMapRow[] = [
  { sectorCode: '31-33', dealIndustry: 'Manufacturing', active: true },
  { sectorCode: '44-45', dealIndustry: 'Retail', active: true },
  { sectorCode: '53', dealIndustry: 'RealEstate', active: true },
  // Inactive row must be ignored.
  { sectorCode: '62', dealIndustry: 'Healthcare', active: false },
  // Row pointing at a non-real industry must be treated as no-mapping.
  { sectorCode: '72', dealIndustry: 'Hospitality', active: true },
];

describe('deal industry labels', () => {
  it('the six real labels are recognized and nothing else', () => {
    for (const l of DEAL_INDUSTRY_LABELS) expect(isDealIndustryLabel(l)).toBe(true);
    expect(isDealIndustryLabel('Hospitality')).toBe(false);
    expect(isDealIndustryLabel('')).toBe(false);
    expect(isDealIndustryLabel(undefined)).toBe(false);
  });
});

describe('resolveDealIndustryForSector', () => {
  it('maps an active sector row to its deal industry', () => {
    expect(resolveDealIndustryForSector('31-33', ROWS)).toEqual({ kind: 'mapped', dealIndustry: 'Manufacturing' });
    expect(resolveDealIndustryForSector('53', ROWS)).toEqual({ kind: 'mapped', dealIndustry: 'RealEstate' });
  });

  it('is no-mapping for an unmapped sector', () => {
    expect(resolveDealIndustryForSector('11', ROWS)).toEqual({ kind: 'no-mapping' });
  });

  it('ignores an inactive mapping row (no-mapping)', () => {
    expect(resolveDealIndustryForSector('62', ROWS)).toEqual({ kind: 'no-mapping' });
  });

  it('treats a row pointing at a non-real industry as no-mapping (never fabricated)', () => {
    expect(resolveDealIndustryForSector('72', ROWS)).toEqual({ kind: 'no-mapping' });
  });

  it('is no-mapping for a blank sector', () => {
    expect(resolveDealIndustryForSector('', ROWS)).toEqual({ kind: 'no-mapping' });
  });
});

describe('resolveDealIndustryFromNaics', () => {
  it('resolves a 6-digit code → sector → mapped industry', () => {
    const r = resolveDealIndustryFromNaics('333111', ROWS); // 33 → 31-33 Manufacturing
    expect(r).toMatchObject({ kind: 'mapped', dealIndustry: 'Manufacturing', naicsCode: '333111' });
    if (r.kind === 'mapped') expect(r.sector.sectorCode).toBe('31-33');
  });

  it('resolves a ranged retail code', () => {
    expect(resolveDealIndustryFromNaics('445110', ROWS)).toMatchObject({ kind: 'mapped', dealIndustry: 'Retail' });
  });

  it('is no-mapping for a valid sector with no active mapping (honest blocked)', () => {
    const r = resolveDealIndustryFromNaics('541511', ROWS); // 54 Professional services — unmapped
    expect(r.kind).toBe('no-mapping');
    if (r.kind === 'no-mapping') {
      expect(r.sector.sectorCode).toBe('54');
      expect(r.naicsCode).toBe('541511');
    }
  });

  it('is no-sector for an unknown / invalid code (never fabricated)', () => {
    expect(resolveDealIndustryFromNaics('999999', ROWS).kind).toBe('no-sector');
    expect(resolveDealIndustryFromNaics('abc', ROWS).kind).toBe('no-sector');
    expect(resolveDealIndustryFromNaics('12345', ROWS).kind).toBe('no-sector'); // not 6 digits
  });
});

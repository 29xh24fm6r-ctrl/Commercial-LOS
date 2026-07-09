/**
 * NAICS sector map (2022) — the fixed, public-domain 20-sector classification.
 *
 * NAICS stores full 6-digit precision; concentration rollups happen at the 2-digit
 * SECTOR level. The sector is DERIVABLE from the code, so we store the 6-digit code
 * once and roll up freely — `sectorForCode` is the single source of truth.
 *
 * Three sectors span a RANGE of leading 2-digit values; a naive `code.slice(0, 2)`
 * is WRONG for these. They are handled explicitly:
 *   - 31, 32, 33 → "31-33" Manufacturing
 *   - 44, 45     → "44-45" Retail Trade
 *   - 48, 49     → "48-49" Transportation and Warehousing
 *
 * Source: U.S. Census Bureau, 2022 NAICS sector list (public domain).
 */

export interface NaicsSector {
  /** Canonical sector code, e.g. "11", "31-33", "44-45". */
  readonly sectorCode: string;
  /** Sector title. */
  readonly sectorTitle: string;
  /** The leading two-digit prefixes that belong to this sector. */
  readonly prefixes: readonly string[];
}

/** The 20 NAICS sectors (2022), in canonical order. */
export const NAICS_SECTORS: readonly NaicsSector[] = [
  { sectorCode: '11', sectorTitle: 'Agriculture, Forestry, Fishing and Hunting', prefixes: ['11'] },
  { sectorCode: '21', sectorTitle: 'Mining, Quarrying, and Oil and Gas Extraction', prefixes: ['21'] },
  { sectorCode: '22', sectorTitle: 'Utilities', prefixes: ['22'] },
  { sectorCode: '23', sectorTitle: 'Construction', prefixes: ['23'] },
  { sectorCode: '31-33', sectorTitle: 'Manufacturing', prefixes: ['31', '32', '33'] },
  { sectorCode: '42', sectorTitle: 'Wholesale Trade', prefixes: ['42'] },
  { sectorCode: '44-45', sectorTitle: 'Retail Trade', prefixes: ['44', '45'] },
  { sectorCode: '48-49', sectorTitle: 'Transportation and Warehousing', prefixes: ['48', '49'] },
  { sectorCode: '51', sectorTitle: 'Information', prefixes: ['51'] },
  { sectorCode: '52', sectorTitle: 'Finance and Insurance', prefixes: ['52'] },
  { sectorCode: '53', sectorTitle: 'Real Estate and Rental and Leasing', prefixes: ['53'] },
  { sectorCode: '54', sectorTitle: 'Professional, Scientific, and Technical Services', prefixes: ['54'] },
  { sectorCode: '55', sectorTitle: 'Management of Companies and Enterprises', prefixes: ['55'] },
  {
    sectorCode: '56',
    sectorTitle: 'Administrative and Support and Waste Management and Remediation Services',
    prefixes: ['56'],
  },
  { sectorCode: '61', sectorTitle: 'Educational Services', prefixes: ['61'] },
  { sectorCode: '62', sectorTitle: 'Health Care and Social Assistance', prefixes: ['62'] },
  { sectorCode: '71', sectorTitle: 'Arts, Entertainment, and Recreation', prefixes: ['71'] },
  { sectorCode: '72', sectorTitle: 'Accommodation and Food Services', prefixes: ['72'] },
  { sectorCode: '81', sectorTitle: 'Other Services (except Public Administration)', prefixes: ['81'] },
  { sectorCode: '92', sectorTitle: 'Public Administration', prefixes: ['92'] },
];

/** Prefix (2-digit) → sector, materialized once for O(1) lookup. */
const SECTOR_BY_PREFIX: ReadonlyMap<string, NaicsSector> = new Map(
  NAICS_SECTORS.flatMap((s) => s.prefixes.map((p) => [p, s] as const)),
);

export interface SectorResolution {
  readonly sectorCode: string;
  readonly sectorTitle: string;
}

/** True when the value is a 6-digit NAICS code string. */
export function isNaicsCode6(code: string): boolean {
  // Guard the type: a numeric NAICS (e.g. 123456) would pass the regex via coercion but then
  // throw on `.slice()` in sectorForCode. Reject anything that is not actually a string.
  return typeof code === 'string' && /^[0-9]{6}$/.test(code);
}

/**
 * Resolve the 2-digit sector for a 6-digit NAICS code. Returns null for anything
 * that is not a valid 6-digit code whose prefix maps to a known sector (honest
 * unknown — never a fabricated sector).
 */
export function sectorForCode(code6: string): SectorResolution | null {
  if (!isNaicsCode6(code6)) return null;
  const sector = SECTOR_BY_PREFIX.get(code6.slice(0, 2));
  if (!sector) return null;
  return { sectorCode: sector.sectorCode, sectorTitle: sector.sectorTitle };
}

/** All valid 2-digit prefixes (used by the seed validator). */
export const NAICS_VALID_PREFIXES: ReadonlySet<string> = new Set(SECTOR_BY_PREFIX.keys());

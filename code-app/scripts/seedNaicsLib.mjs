// @ts-check
/**
 * NAICS seed — pure, import-safe helpers.
 *
 * Shared by the maker CLI (scripts/seed-naics.mjs) and its unit tests
 * (src/crm/naics/seedNaics.test.ts). This module is deliberately free of a
 * shebang, argv parsing, fs I/O, and any top-level CLI entrypoint, so it imports
 * cleanly under vitest's transform (the `#!/usr/bin/env node` shebang on the CLI
 * wrapper is what vitest cannot parse). The wrapper owns the side effects; this
 * module owns the deterministic, fail-closed validation/normalization logic.
 */

/**
 * Two-digit prefix → { sectorCode, sectorTitle }. MIRRORS src/crm/naics/naicsSectorMap.ts
 * (a test pins that they stay in sync). Ranged sectors expand to multiple prefixes.
 */
export const SECTOR_BY_PREFIX = Object.freeze({
  '11': { sectorCode: '11', sectorTitle: 'Agriculture, Forestry, Fishing and Hunting' },
  '21': { sectorCode: '21', sectorTitle: 'Mining, Quarrying, and Oil and Gas Extraction' },
  '22': { sectorCode: '22', sectorTitle: 'Utilities' },
  '23': { sectorCode: '23', sectorTitle: 'Construction' },
  '31': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '32': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '33': { sectorCode: '31-33', sectorTitle: 'Manufacturing' },
  '42': { sectorCode: '42', sectorTitle: 'Wholesale Trade' },
  '44': { sectorCode: '44-45', sectorTitle: 'Retail Trade' },
  '45': { sectorCode: '44-45', sectorTitle: 'Retail Trade' },
  '48': { sectorCode: '48-49', sectorTitle: 'Transportation and Warehousing' },
  '49': { sectorCode: '48-49', sectorTitle: 'Transportation and Warehousing' },
  '51': { sectorCode: '51', sectorTitle: 'Information' },
  '52': { sectorCode: '52', sectorTitle: 'Finance and Insurance' },
  '53': { sectorCode: '53', sectorTitle: 'Real Estate and Rental and Leasing' },
  '54': { sectorCode: '54', sectorTitle: 'Professional, Scientific, and Technical Services' },
  '55': { sectorCode: '55', sectorTitle: 'Management of Companies and Enterprises' },
  '56': { sectorCode: '56', sectorTitle: 'Administrative and Support and Waste Management and Remediation Services' },
  '61': { sectorCode: '61', sectorTitle: 'Educational Services' },
  '62': { sectorCode: '62', sectorTitle: 'Health Care and Social Assistance' },
  '71': { sectorCode: '71', sectorTitle: 'Arts, Entertainment, and Recreation' },
  '72': { sectorCode: '72', sectorTitle: 'Accommodation and Food Services' },
  '81': { sectorCode: '81', sectorTitle: 'Other Services (except Public Administration)' },
  '92': { sectorCode: '92', sectorTitle: 'Public Administration' },
});

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas). */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Validate + normalize raw [code, title] pairs into seed records. Fail-closed:
 * a 6-digit code whose prefix is not a known sector is an ERROR, never coerced.
 * Returns { records, errors, skipped }.
 */
export function buildNaicsSeed(pairs, version) {
  const records = [];
  const errors = [];
  let skipped = 0;
  const seen = new Set();
  for (const [rawCode, rawTitle] of pairs) {
    const code = String(rawCode ?? '').trim();
    const title = String(rawTitle ?? '').trim();
    if (!/^[0-9]{6}$/.test(code)) { skipped++; continue; } // not a 6-digit detail code
    if (seen.has(code)) continue; // idempotent dedupe
    seen.add(code);
    if (title.length === 0) { errors.push(`${code}: missing title`); continue; }
    const sector = SECTOR_BY_PREFIX[code.slice(0, 2)];
    if (!sector) { errors.push(`${code}: prefix ${code.slice(0, 2)} maps to no NAICS sector`); continue; }
    records.push({
      cr664_code: code,
      cr664_title: title,
      cr664_sectorcode: sector.sectorCode,
      cr664_sectortitle: sector.sectorTitle,
      cr664_naicsversion: version,
    });
  }
  records.sort((a, b) => a.cr664_code.localeCompare(b.cr664_code)); // deterministic
  return { records, errors, skipped };
}

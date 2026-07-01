import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// The seed script is a maker-run CLI (shebang + argv); its pure functions live in
// an import-safe library so vitest can unit-test them without parsing the CLI shebang.
import { parseCsv, buildNaicsSeed, SECTOR_BY_PREFIX } from '../../../scripts/seedNaicsLib.mjs';
import { NAICS_SECTORS, NAICS_VALID_PREFIXES } from './naicsSectorMap';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

describe('seed-naics — sector map mirrors naicsSectorMap.ts', () => {
  it('every prefix in the script map matches the TS sector map', () => {
    for (const [prefix, entry] of Object.entries(SECTOR_BY_PREFIX)) {
      const tsSector = NAICS_SECTORS.find((s) => s.prefixes.includes(prefix));
      expect(tsSector, `prefix ${prefix} missing from TS map`).toBeTruthy();
      expect(entry.sectorCode).toBe(tsSector!.sectorCode);
      expect(entry.sectorTitle).toBe(tsSector!.sectorTitle);
    }
  });
  it('covers the same prefix set as the TS map', () => {
    expect(new Set(Object.keys(SECTOR_BY_PREFIX))).toEqual(NAICS_VALID_PREFIXES);
  });
});

describe('seed-naics — parseCsv tolerates real-world exports', () => {
  it('strips a leading UTF-8 BOM so the first code is not silently corrupted', () => {
    const withBom = String.fromCharCode(0xfeff) + 'code,title\n722511,Full-Service Restaurants\n';
    const rows = parseCsv(withBom);
    expect(rows[0][0]).toBe('code'); // header cell is clean, not BOM-prefixed
    expect(rows[1]).toEqual(['722511', 'Full-Service Restaurants']);
    // And it actually builds (the first detail row maps to its sector).
    const { records } = buildNaicsSeed(rows.slice(1).map((r) => [r[0], r[1]]), '2022');
    expect(records[0]).toMatchObject({ cr664_code: '722511', cr664_sectorcode: '72' });
  });
});

describe('seed-naics — buildNaicsSeed', () => {
  function pairsFromSample() {
    const csv = readFileSync(resolve(REPO_ROOT, 'scripts/data/naics-sample.csv'), 'utf8');
    const rows = parseCsv(csv).slice(1); // drop header
    return rows.map((r) => [r[0], r[1]] as [string, string]);
  }

  it('keeps only 6-digit detail rows and derives sectors (incl. ranges)', () => {
    const { records, errors, skipped } = buildNaicsSeed(pairsFromSample(), '2022');
    expect(errors).toEqual([]);
    expect(skipped).toBe(1); // the 2-digit "11" aggregate row
    const byCode = Object.fromEntries(records.map((r) => [r.cr664_code, r]));
    expect(byCode['311111'].cr664_sectorcode).toBe('31-33');
    expect(byCode['454110'].cr664_sectorcode).toBe('44-45');
    expect(byCode['493110'].cr664_sectorcode).toBe('48-49');
    expect(byCode['722511']).toMatchObject({
      cr664_title: 'Full-Service Restaurants',
      cr664_sectorcode: '72',
      cr664_sectortitle: 'Accommodation and Food Services',
      cr664_naicsversion: '2022',
    });
  });

  it('is deterministic + idempotent (sorted, deduped)', () => {
    const pairs = pairsFromSample();
    const a = buildNaicsSeed(pairs, '2022').records;
    const b = buildNaicsSeed([...pairs, ...pairs], '2022').records; // duplicates
    expect(a).toEqual(b); // dedupe → identical
    const codes = a.map((r) => r.cr664_code);
    expect([...codes]).toEqual([...codes].sort());
  });

  it('fails closed on a 6-digit code with an unknown prefix (never fabricates a sector)', () => {
    const { records, errors } = buildNaicsSeed([['990000', 'Bogus Sector']], '2022');
    expect(records).toEqual([]);
    expect(errors[0]).toMatch(/990000/);
  });

  it('flags a missing title rather than seeding a blank', () => {
    const { errors } = buildNaicsSeed([['722511', '']], '2022');
    expect(errors[0]).toMatch(/missing title/);
  });
});

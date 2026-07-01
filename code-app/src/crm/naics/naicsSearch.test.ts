import { describe, it, expect, vi } from 'vitest';
// Pin the fail-closed contract deterministically: with the generated service stubbed to throw
// (as it would when the table/SDK is absent), loadNaicsRowsLive must resolve to "unavailable".
// This also keeps the file independent of the real @microsoft/power-apps SDK at load time.
vi.mock('../../generated/services/Cr664_naicscodesService', () => ({
  Cr664_naicscodesService: {
    getAll: vi.fn(async () => {
      throw new Error('NAICS service not generated');
    }),
  },
}));
import { filterNaicsHits, loadNaicsRowsLive, type NaicsRow } from './naicsSearch';

const ROWS: NaicsRow[] = [
  { cr664_code: '722511', cr664_title: 'Full-Service Restaurants' },
  { cr664_code: '811111', cr664_title: 'General Automotive Repair' },
  { cr664_code: '311111', cr664_title: 'Dog and Cat Food Manufacturing' },
  { cr664_code: '72', cr664_title: 'Accommodation and Food Services' }, // aggregate (not 6-digit)
  { cr664_code: '990000', cr664_title: 'Bogus' }, // unknown sector prefix
];

describe('filterNaicsHits', () => {
  it('matches by title substring and derives the sector', () => {
    const hits = filterNaicsHits(ROWS, 'restaurant');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({
      code: '722511',
      title: 'Full-Service Restaurants',
      sectorCode: '72',
      sectorTitle: 'Accommodation and Food Services',
    });
  });

  it('matches plain language ("auto") via the title', () => {
    expect(filterNaicsHits(ROWS, 'auto').map((h) => h.code)).toEqual(['811111']);
  });

  it('matches by code prefix', () => {
    expect(filterNaicsHits(ROWS, '3111').map((h) => h.code)).toEqual(['311111']);
    expect(filterNaicsHits(ROWS, '311111')[0].sectorCode).toBe('31-33');
  });

  it('returns nothing for an empty query', () => {
    expect(filterNaicsHits(ROWS, '   ')).toEqual([]);
  });

  it('drops non-6-digit rows and rows with no derivable sector (honest)', () => {
    const hits = filterNaicsHits(ROWS, 'a'); // broad
    expect(hits.some((h) => h.code === '72')).toBe(false);
    expect(hits.some((h) => h.code === '990000')).toBe(false);
  });

  it('caps results at the limit', () => {
    const many: NaicsRow[] = Array.from({ length: 50 }, (_, i) => ({
      cr664_code: `5411${String(10 + i).padStart(2, '0')}`,
      cr664_title: `Legal Service ${i}`,
    }));
    expect(filterNaicsHits(many, 'legal', 30)).toHaveLength(30);
  });
});

describe('loadNaicsRowsLive', () => {
  it('fails closed to "unavailable" when the generated service is absent', async () => {
    const result = await loadNaicsRowsLive();
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/not provisioned|not generated/i);
  });
});

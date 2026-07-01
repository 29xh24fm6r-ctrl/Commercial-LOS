import { describe, it, expect, vi, beforeEach } from 'vitest';
// Controllable stub for the generated Dataverse service so these unit tests never load the real
// @microsoft/power-apps SDK and can drive each getAll outcome deterministically.
const { getAllMock } = vi.hoisted(() => ({ getAllMock: vi.fn() }));
vi.mock('../../generated/services/Cr664_naicscodesService', () => ({
  Cr664_naicscodesService: { getAll: getAllMock },
}));
import { filterNaicsHits, loadNaicsRowsLive, findNaicsByCode, type NaicsRow } from './naicsSearch';

beforeEach(() => {
  getAllMock.mockReset();
  // Default baseline: behave as if the table/SDK is absent (throws) — the fail-closed posture.
  getAllMock.mockRejectedValue(new Error('NAICS service not generated'));
});

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

describe('findNaicsByCode — exact server-side lookup (the deployed-bug fix)', () => {
  it('queries by exact cr664_code and returns the record', async () => {
    getAllMock.mockResolvedValueOnce({
      data: [{ cr664_code: '561422', cr664_title: 'Telemarketing Bureaus and Other Contact Centers' }],
    });
    const rec = await findNaicsByCode('561422');
    expect(rec).toEqual({ cr664_code: '561422', cr664_title: 'Telemarketing Bureaus and Other Contact Centers' });
    // Server-side exact filter — never relies on a paginated "get all" set.
    expect(getAllMock).toHaveBeenCalledWith(expect.objectContaining({ filter: "cr664_code eq '561422'" }));
  });

  it('returns null when the code is not in the table', async () => {
    getAllMock.mockResolvedValueOnce({ data: [] });
    expect(await findNaicsByCode('999999')).toBeNull();
  });

  it('never fabricates a title — an empty title resolves to null', async () => {
    getAllMock.mockResolvedValueOnce({ data: [{ cr664_code: '561422', cr664_title: '' }] });
    expect(await findNaicsByCode('561422')).toBeNull();
  });

  it('does not query (and returns null) for a non-six-digit input — also blocks OData injection', async () => {
    expect(await findNaicsByCode('5614')).toBeNull();
    expect(await findNaicsByCode("561422' or '1' eq '1")).toBeNull();
    expect(getAllMock).not.toHaveBeenCalled();
  });

  it('fails closed to null when the service throws (table/SDK absent)', async () => {
    getAllMock.mockRejectedValueOnce(new Error('boom'));
    expect(await findNaicsByCode('561422')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { deriveSectorConcentration } from './concentrationViewModel';

describe('deriveSectorConcentration', () => {
  it('groups by 2-digit sector (incl. ranged) with % of book', () => {
    const model = deriveSectorConcentration([
      { naicsCode: '722511' }, // 72
      { naicsCode: '722513' }, // 72
      { naicsCode: '311111' }, // 31-33
      { naicsCode: '236220' }, // 23
    ]);
    expect(model.total).toBe(4);
    expect(model.classified).toBe(4);
    expect(model.unclassified).toBe(0);
    const food = model.rows.find((r) => r.sectorCode === '72')!;
    expect(food.count).toBe(2);
    expect(food.pctOfBook).toBe(50);
    expect(model.rows[0].sectorCode).toBe('72'); // sorted by count desc
    expect(model.rows.some((r) => r.sectorCode === '31-33')).toBe(true);
  });

  it('puts companies with no / invalid NAICS into an honest unclassified bucket', () => {
    const model = deriveSectorConcentration([
      { naicsCode: '722511' },
      { naicsCode: '99' }, // invalid (not 6-digit)
      {}, // none
    ]);
    expect(model.classified).toBe(1);
    expect(model.unclassified).toBe(2);
    expect(model.rows).toHaveLength(1);
  });

  it('reports exposure only when supplied (honest "not linked" otherwise)', () => {
    const noExp = deriveSectorConcentration([{ naicsCode: '722511' }]);
    expect(noExp.hasExposure).toBe(false);
    expect(noExp.exposureTotal).toBe(0);

    const withExp = deriveSectorConcentration([
      { naicsCode: '722511', exposure: 1_000_000 },
      { naicsCode: '722513', exposure: 500_000 },
    ]);
    expect(withExp.hasExposure).toBe(true);
    expect(withExp.exposureTotal).toBe(1_500_000);
    expect(withExp.rows[0].exposure).toBe(1_500_000);
  });

  it('is empty-safe', () => {
    const model = deriveSectorConcentration([]);
    expect(model.total).toBe(0);
    expect(model.rows).toEqual([]);
  });
});

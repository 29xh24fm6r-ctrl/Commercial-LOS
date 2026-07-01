import { describe, it, expect } from 'vitest';
import {
  deriveDualRiskRating,
  deriveFacilityGrade,
  blendGrades,
  appendRatingHistory,
  dualRatingToRiskInputs,
  derivePortfolioClassification,
  type DualRatingInput,
  type DualRatingRecord,
} from './dualRiskRating';

/**
 * PE-5 — dual risk rating goldens: obligor→classification, facility LGD bands,
 * blended grade (criticized floor), override control, and migration events.
 */

function rate(over: Partial<DualRatingInput> = {}): DualRatingRecord {
  const out = deriveDualRiskRating({ effectiveDate: '2026-06-30', obligorGrade: 3, ...over });
  if (out.kind !== 'rated') throw new Error('expected rated');
  return out.record;
}

describe('facility grade (LGD band) from collateral coverage / lien / structure', () => {
  it('strongly secured when collateral covers ≥ 125% of exposure', () => {
    const f = deriveFacilityGrade({ collateralValue: 1_300_000, exposure: 1_000_000, lienPosition: 'first' }, undefined);
    expect(f.band).toBe('strongly_secured');
    expect(f.lgd).toBe(0.15);
  });

  it('unsecured (or unknown) defaults to the worst band', () => {
    expect(deriveFacilityGrade(undefined, 1_000_000).band).toBe('unsecured');
    expect(deriveFacilityGrade({ secured: false }, 1_000_000).band).toBe('unsecured');
  });

  it('a junior lien worsens the band by one notch', () => {
    const first = deriveFacilityGrade({ collateralValue: 1_100_000, exposure: 1_000_000, lienPosition: 'first' }, undefined);
    const junior = deriveFacilityGrade({ collateralValue: 1_100_000, exposure: 1_000_000, lienPosition: 'junior' }, undefined);
    expect(first.band).toBe('well_secured');
    expect(junior.band).toBe('partially_secured');
  });
});

describe('obligor grade → PD + regulatory classification', () => {
  it('grades 1–4 are Pass', () => {
    expect(rate({ obligorGrade: 1 }).classification).toBe('Pass');
    expect(rate({ obligorGrade: 4 }).classification).toBe('Pass');
  });

  it('grade 5 is Special Mention (criticized, not classified)', () => {
    const r = rate({ obligorGrade: 5 });
    expect(r.classification).toBe('Special Mention');
    expect(r.criticized).toBe(true);
    expect(r.classified).toBe(false);
  });

  it('grades 6/7/8 map to Substandard / Doubtful / Loss (classified)', () => {
    expect(rate({ obligorGrade: 6 }).classification).toBe('Substandard');
    expect(rate({ obligorGrade: 7 }).classification).toBe('Doubtful');
    expect(rate({ obligorGrade: 8 }).classification).toBe('Loss');
    expect(rate({ obligorGrade: 6 }).classified).toBe(true);
  });
});

describe('blended grade', () => {
  it('strong collateral improves a pass obligor by one notch', () => {
    expect(blendGrades(4, 'strongly_secured')).toBe(3);
    expect(blendGrades(3, 'unsecured')).toBe(4);
  });

  it('collateral never un-criticizes a weak obligor (criticized floor)', () => {
    // Grade-5 obligor with strong collateral stays ≥ 5.
    expect(blendGrades(5, 'strongly_secured')).toBe(5);
    expect(rate({ obligorGrade: 6, facility: { collateralValue: 5_000_000, exposure: 1_000_000, lienPosition: 'first' } }).blendedGrade).toBeGreaterThanOrEqual(5);
  });
});

describe('override control', () => {
  it('rejects an override with no justification', () => {
    const out = deriveDualRiskRating({ effectiveDate: '2026-06-30', obligorGrade: 4, override: { blendedGrade: 2 } });
    expect(out.kind).toBe('override-rejected');
  });

  it('applies an override with a written justification and flags it', () => {
    const out = deriveDualRiskRating({
      effectiveDate: '2026-06-30',
      obligorGrade: 4,
      override: { blendedGrade: 2, justification: 'Sponsor guaranty + audited financials support an upgrade.' },
    });
    expect(out.kind).toBe('rated');
    if (out.kind !== 'rated') return;
    expect(out.record.blendedGrade).toBe(2);
    expect(out.record.overridden).toBe(true);
    expect(out.record.overrideJustification).toMatch(/guaranty/i);
  });
});

describe('migration tracking', () => {
  const prior = rate({ obligorGrade: 3, effectiveDate: '2026-01-01' }); // blended 3, Pass

  it('emits a downgrade migration event when the grade worsens', () => {
    const out = deriveDualRiskRating({ effectiveDate: '2026-06-30', obligorGrade: 6, prior });
    expect(out.kind).toBe('rated');
    if (out.kind !== 'rated') return;
    expect(out.migrationEvent).toBeDefined();
    expect(out.record.migration?.direction).toBe('downgrade');
    expect(out.record.migration?.notches).toBe(3); // 3 → 6
    expect(out.record.migration?.classificationChanged).toBe(true);
    expect(out.record.migration?.fromDate).toBe('2026-01-01');
  });

  it('affirms with no migration event when grade and classification are unchanged', () => {
    const out = deriveDualRiskRating({ effectiveDate: '2026-06-30', obligorGrade: 3, prior });
    if (out.kind !== 'rated') throw new Error('rated');
    expect(out.record.migration?.direction).toBe('affirmed');
    expect(out.migrationEvent).toBeUndefined();
  });
});

describe('history + PE-4 bridge', () => {
  it('appends to effective-dated history in chronological order', () => {
    const a = rate({ effectiveDate: '2026-01-01' });
    const b = rate({ effectiveDate: '2026-06-30', obligorGrade: 5 });
    const hist = appendRatingHistory(appendRatingHistory([], b), a);
    expect(hist.map((r) => r.effectiveDate)).toEqual(['2026-01-01', '2026-06-30']);
  });

  it('bridges PD/LGD into PE-4 profitability risk inputs', () => {
    const r = rate({ obligorGrade: 6, facility: { collateralValue: 500_000, exposure: 1_000_000 } });
    const risk = dualRatingToRiskInputs(r, 1_000_000);
    expect(risk.pd).toBe(0.15); // grade 6
    expect(risk.lgd).toBe(0.5); // partially secured
    expect(risk.ead).toBe(1_000_000);
  });
});

describe('portfolio classification distribution', () => {
  it('counts by classification and reports criticized / classified totals', () => {
    const records = [
      rate({ obligorGrade: 2 }), // Pass
      rate({ obligorGrade: 3 }), // Pass
      rate({ obligorGrade: 5 }), // Special Mention → criticized
      rate({ obligorGrade: 6 }), // Substandard → criticized + classified
      rate({ obligorGrade: 8 }), // Loss → criticized + classified
    ];
    const d = derivePortfolioClassification(records);
    expect(d.total).toBe(5);
    expect(d.criticizedCount).toBe(3); // grades 5,6,8
    expect(d.classifiedCount).toBe(2); // grades 6,8
    const byClass = Object.fromEntries(d.distribution.map((x) => [x.classification, x.count]));
    expect(byClass['Pass']).toBe(2);
    expect(byClass['Special Mention']).toBe(1);
    expect(byClass['Loss']).toBe(1);
  });
});

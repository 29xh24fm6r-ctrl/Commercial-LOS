import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deriveStressTestSnapshot, type StressScenarioInput, type StressTestLoanInput } from './stressTesting';

function scenario(over: Partial<StressScenarioInput> = {}): StressScenarioInput {
  return { scenarioName: 'Base case', interestRateShockBps: 200, collateralValueShockPct: -20, ...over };
}

function loan(over: Partial<StressTestLoanInput> & { loanId: string }): StressTestLoanInput {
  return {
    borrowerName: undefined,
    exposure: 100,
    interestRateType: undefined,
    currentSpreadPct: undefined,
    collateralValue: undefined,
    ...over,
  };
}

describe('Phase 264 (P3) — deriveStressTestSnapshot — collateral-band sensitivity', () => {
  it('flags high sensitivity when a variable-rate loan crosses a facility-band boundary under the collateral shock', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ collateralValueShockPct: -20 }),
      [loan({ loanId: 'L1', borrowerName: 'Acme LLC', exposure: 100, interestRateType: 'Variable', collateralValue: 125 })],
    );
    const r = snap.loanResults[0];
    expect(r.collateralCoverageBefore).toBeCloseTo(1.25);
    expect(r.collateralCoverageAfter).toBeCloseTo(1.0);
    expect(r.facilityBandBefore).toBe('strongly_secured');
    expect(r.facilityBandAfter).toBe('well_secured');
    expect(r.facilityBandWorsened).toBe(true);
    expect(r.sensitivity).toBe('high');
  });

  it('flags moderate sensitivity for a coverage-ratio drop of >= 10 percentage points that does not cross a band boundary', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 0, collateralValueShockPct: -20 }),
      [loan({ loanId: 'L2', exposure: 100, interestRateType: 'Fixed', collateralValue: 300 })],
    );
    const r = snap.loanResults[0];
    // coverage 3.0 -> 2.4, both strongly_secured, drop = 60pp
    expect(r.facilityBandBefore).toBe('strongly_secured');
    expect(r.facilityBandAfter).toBe('strongly_secured');
    expect(r.facilityBandWorsened).toBe(false);
    expect(r.sensitivity).toBe('moderate');
  });

  it('flags low sensitivity for a shallow coverage decline with no band change and no material rate shock', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 0, collateralValueShockPct: -2 }),
      [loan({ loanId: 'L3', exposure: 100, interestRateType: 'Fixed', collateralValue: 300 })],
    );
    const r = snap.loanResults[0];
    expect(r.facilityBandWorsened).toBe(false);
    expect(r.sensitivity).toBe('low');
  });
});

describe('Phase 264 (P3) — rate-shock sensitivity', () => {
  it('flags moderate sensitivity for a variable-rate loan under a materially large rate shock with no facility-band worsening', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 250, collateralValueShockPct: 0 }),
      [loan({ loanId: 'L4', exposure: 100, interestRateType: 'Variable', collateralValue: undefined })],
    );
    const r = snap.loanResults[0];
    expect(r.rateExposed).toBe(true);
    expect(r.facilityBandWorsened).toBe(false);
    expect(r.sensitivity).toBe('moderate');
  });

  it('is honest about rateExposed: only a recognized "Variable" (case-insensitive) string counts, never guessed', () => {
    const variable = deriveStressTestSnapshot(scenario(), [loan({ loanId: 'A', interestRateType: 'variable' })]).loanResults[0];
    const fixed = deriveStressTestSnapshot(scenario(), [loan({ loanId: 'B', interestRateType: 'Fixed' })]).loanResults[0];
    const unknown = deriveStressTestSnapshot(scenario(), [loan({ loanId: 'C', interestRateType: undefined })]).loanResults[0];
    const other = deriveStressTestSnapshot(scenario(), [loan({ loanId: 'D', interestRateType: 'ARM-adjacent' })]).loanResults[0];
    expect(variable.rateExposed).toBe(true);
    expect(fixed.rateExposed).toBe(false);
    expect(unknown.rateExposed).toBe(false);
    expect(other.rateExposed).toBe(false);
  });
});

describe('Phase 264 (P3) — honest absence: no fabricated collateral/DSCR data', () => {
  it('a fixed-rate loan with no collateral data and a 0% shock is low sensitivity with a notComputableReasons entry', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 0, collateralValueShockPct: 0 }),
      [loan({ loanId: 'L5', interestRateType: 'Fixed', collateralValue: undefined })],
    );
    const r = snap.loanResults[0];
    expect(r.sensitivity).toBe('low');
    expect(r.collateralCoverageBefore).toBeUndefined();
    expect(r.collateralCoverageAfter).toBeUndefined();
    expect(r.facilityBandBefore).toBeUndefined();
    expect(r.facilityBandAfter).toBeUndefined();
    expect(r.notComputableReasons.some((reason) => /collateral value not available/i.test(reason))).toBe(true);
  });

  it('never returns high/moderate sensitivity without a concrete, named reason', () => {
    const results = [
      loan({ loanId: 'A', interestRateType: 'Fixed', collateralValue: undefined }),
      loan({ loanId: 'B', interestRateType: undefined, collateralValue: undefined }),
    ];
    const snap = deriveStressTestSnapshot(scenario({ interestRateShockBps: 0, collateralValueShockPct: 0 }), results);
    for (const r of snap.loanResults) {
      expect(r.sensitivity).toBe('low');
    }
  });
});

describe('Phase 264 (P3) — exposure exclusion and portfolio rollups', () => {
  it('excludes non-finite/non-positive-exposure loans from sums and counts them in excludedLoanCount', () => {
    const snap = deriveStressTestSnapshot(scenario(), [
      loan({ loanId: 'zero', exposure: 0 }),
      loan({ loanId: 'negative', exposure: -50 }),
      loan({ loanId: 'nan', exposure: NaN }),
      loan({ loanId: 'good', exposure: 100 }),
    ]);
    expect(snap.excludedLoanCount).toBe(3);
    expect(snap.loanResults).toHaveLength(1);
    expect(snap.loanResults[0].loanId).toBe('good');
    expect(snap.totalExposure).toBe(100);
  });

  it('sums exposureBySensitivity and loanCountBySensitivity correctly across a multi-loan fixture', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 250, collateralValueShockPct: -20 }),
      [
        // high: band worsens
        loan({ loanId: 'H1', exposure: 100, interestRateType: 'Variable', collateralValue: 125 }),
        // moderate: variable rate, large shock, no collateral data
        loan({ loanId: 'M1', exposure: 200, interestRateType: 'Variable', collateralValue: undefined }),
        // low: fixed, no collateral
        loan({ loanId: 'L1', exposure: 300, interestRateType: 'Fixed', collateralValue: undefined }),
      ],
    );
    expect(snap.loanCountBySensitivity).toEqual({ low: 1, moderate: 1, high: 1 });
    expect(snap.exposureBySensitivity).toEqual({ low: 300, moderate: 200, high: 100 });
    expect(snap.totalExposure).toBe(600);
  });

  it('sorts by sensitivity (high first) then by exposure descending within a tier — a high-sensitivity, lower-exposure loan ranks before a low-sensitivity, higher-exposure loan', () => {
    const snap = deriveStressTestSnapshot(
      scenario({ interestRateShockBps: 0, collateralValueShockPct: -20 }),
      [
        loan({ loanId: 'big-low', exposure: 10_000_000, interestRateType: 'Fixed', collateralValue: undefined }),
        loan({ loanId: 'small-high', exposure: 100, interestRateType: 'Variable', collateralValue: 125 }),
      ],
    );
    expect(snap.loanResults.map((r) => r.loanId)).toEqual(['small-high', 'big-low']);
  });
});

describe('Phase 264 (P3) — empty portfolio', () => {
  it('returns an honest empty snapshot: isEmpty true, all sums zero, loanResults an empty array', () => {
    const snap = deriveStressTestSnapshot(scenario(), []);
    expect(snap.isEmpty).toBe(true);
    expect(snap.loanResults).toEqual([]);
    expect(snap.totalExposure).toBe(0);
    expect(snap.excludedLoanCount).toBe(0);
    expect(snap.exposureBySensitivity).toEqual({ low: 0, moderate: 0, high: 0 });
    expect(snap.loanCountBySensitivity).toEqual({ low: 0, moderate: 0, high: 0 });
  });
});

describe('Phase 264 (P3) — engine states its NOI/DSCR limitation (no fabrication)', () => {
  const src = readFileSync(resolve(__dirname, 'stressTesting.ts'), 'utf8');

  it('names the NOI/DSCR gap explicitly, verbatim, rather than fabricating an income-shock figure', () => {
    expect(src).toMatch(/No NOI\/DSCR\/cash-flow field exists in the boarded-loan schema today/);
  });

  it('does not reference the dead cr664_StressTestScenario / cr664_StressTestResult entities', () => {
    expect(src).not.toMatch(/cr664_StressTestScenario/);
    expect(src).not.toMatch(/cr664_StressTestResult/);
  });
});

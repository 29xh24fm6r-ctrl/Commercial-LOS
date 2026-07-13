import { deriveFacilityGrade, FACILITY_SCALE, type FacilityBand } from '../riskRating/dualRiskRating';
import type { StressSensitivity } from '../earlyWarning/earlyWarning';

/**
 * Phase 264 (P3) — portfolio-level stress-testing engine.
 *
 * A PURE, deterministic, EPHEMERAL what-if tool. It runs a simple, transparent
 * rate-shock / collateral-value-shock scenario against the REAL boarded-loan
 * book and reports which loans are most sensitive. Nothing here is written to
 * Dataverse and nothing here is persisted — a scenario exists only for the
 * duration of one `deriveStressTestSnapshot` call; re-running with different
 * inputs simply discards the prior result. This replaces the dead legacy
 * Dataverse stress-test entities (zero references anywhere in this codebase)
 * with a live client-side engine — no legacy stress-test table is read,
 * written, or referenced here in any way.
 *
 * What this engine DOES model, honestly:
 *   - Collateral-value shock: the shocked collateral value is run back through
 *     `deriveFacilityGrade` (imported, not reimplemented) to see whether the
 *     loan's facility band (strongly_secured / well_secured / partially_secured
 *     / unsecured) would worsen. A real band downgrade under the scenario is
 *     the strongest, most concrete signal this engine has.
 *   - Interest-rate shock: whether a loan is rate-exposed at all (a real,
 *     honestly-derived `Variable` vs `Fixed`/unknown rate type) and whether the
 *     shock is large.
 *
 * What this engine explicitly does NOT and CANNOT model:
 *   - There is no NOI / DSCR / cash-flow field anywhere in the boarded-loan
 *     schema (`BoardedLoanRow`) today. A pure income-shock impact on
 *     debt-service coverage is therefore NOT COMPUTABLE from this schema, full
 *     stop — this engine never fabricates a DSCR or NOI figure to fake that
 *     analysis. Every loan result carries a `notComputableReasons` list that
 *     names this gap explicitly whenever it applies, rather than silently
 *     omitting the limitation.
 *
 * Discipline:
 *   - Pure. No IO, no `Date.now()`, no `Math.random()`. Deterministic for a
 *     given (scenario, loans) pair.
 *   - Undefined inputs (collateral value, rate type) are treated as genuinely
 *     unknown and reported as such — never defaulted to a fabricated number.
 *   - A loan with non-finite or non-positive exposure is excluded from all
 *     portfolio sums (but counted honestly in `excludedLoanCount`), since a
 *     stress "sensitivity" figure computed against zero/negative/NaN exposure
 *     would be meaningless.
 */

export interface StressScenarioInput {
  readonly scenarioName: string;
  /** Interest-rate shock in basis points, e.g. 200 for +200bps. May be negative. */
  readonly interestRateShockBps: number;
  /** Collateral value shock as a percentage, e.g. -20 for a 20% value decline. May be positive. */
  readonly collateralValueShockPct: number;
}

export interface StressTestLoanInput {
  readonly loanId: string;
  readonly borrowerName: string | undefined;
  /** Outstanding principal (current exposure). Must be > 0 and finite to be counted. */
  readonly exposure: number;
  /** e.g. 'Variable' | 'Fixed' | undefined. */
  readonly interestRateType: string | undefined;
  /** Rate spread, if known. Not currently used to size the rate shock (no NOI/DSCR to size it against) but captured for future traceability. */
  readonly currentSpreadPct: number | undefined;
  /** Undefined means genuinely unknown — never fabricated. */
  readonly collateralValue: number | undefined;
}

export interface LoanStressResult {
  readonly loanId: string;
  readonly borrowerName: string | undefined;
  readonly exposure: number;
  /** True only when `interestRateType` is a recognized variable-rate indicator — never guessed. */
  readonly rateExposed: boolean;
  /** `collateralValue / exposure`; undefined if `collateralValue` is unknown. */
  readonly collateralCoverageBefore: number | undefined;
  /** `(collateralValue * (1 + shockPct/100)) / exposure`; undefined if unknown. */
  readonly collateralCoverageAfter: number | undefined;
  /** Via `deriveFacilityGrade`; undefined if not computable (no collateral data). */
  readonly facilityBandBefore: FacilityBand | undefined;
  readonly facilityBandAfter: FacilityBand | undefined;
  /** True only when before/after are both known AND after is strictly worse. */
  readonly facilityBandWorsened: boolean;
  readonly sensitivity: StressSensitivity;
  readonly notComputableReasons: readonly string[];
}

export interface PortfolioStressTestSnapshot {
  readonly scenario: StressScenarioInput;
  /** Sorted by sensitivity (high first), then by exposure descending within each tier. */
  readonly loanResults: readonly LoanStressResult[];
  readonly totalExposure: number;
  readonly exposureBySensitivity: { readonly low: number; readonly moderate: number; readonly high: number };
  readonly loanCountBySensitivity: { readonly low: number; readonly moderate: number; readonly high: number };
  /** Loans excluded from all sums for non-finite/non-positive exposure — counted, never silently dropped. */
  readonly excludedLoanCount: number;
  readonly isEmpty: boolean;
}

const RATE_SHOCK_MATERIAL_BPS = 200;
const COVERAGE_DROP_MATERIAL_PP = 10; // percentage points, expressed as a 0-1 fraction delta of 0.10

const NOI_DSCR_LIMITATION =
  'No NOI/DSCR/cash-flow field exists in the boarded-loan schema today — income-shock impact on debt-service coverage is not computable for this loan.';

/** True only for a recognized, case-insensitive "variable" rate-type string. Never guessed. */
function isRateExposed(interestRateType: string | undefined): boolean {
  if (typeof interestRateType !== 'string') return false;
  return interestRateType.trim().toLowerCase() === 'variable';
}

function facilityBandIndex(band: FacilityBand): number {
  return FACILITY_SCALE.findIndex((r) => r.band === band);
}

/**
 * Sensitivity classification (deterministic; every branch traces to a named,
 * concrete reason captured in the result):
 *
 *   1. `facilityBandWorsened === true` → at least 'high'. A real collateral-
 *      driven facility-band downgrade under the scenario is the strongest,
 *      most concrete signal this engine has.
 *   2. Otherwise, a variable-rate loan (`rateExposed === true`) hit with a
 *      materially large rate shock (|bps| >= 200) → 'moderate'.
 *   3. Otherwise, a coverage-ratio decline of >= 10 percentage points (0.10)
 *      that does not cross a facility-band boundary → 'moderate'.
 *   4. Otherwise, a variable-rate loan with a smaller shock, or a fixed-rate
 *      loan with a shallower coverage decline → 'low'.
 *   5. No computable signal at all (fixed-rate, no collateral data, small/no
 *      shock) → 'low'. Never 'high'/'moderate' without a concrete reason
 *      (`facilityBandWorsened`, `rateExposed`, or a named coverage-drop
 *      figure) captured in the result.
 */
function classifySensitivity(args: {
  facilityBandWorsened: boolean;
  rateExposed: boolean;
  interestRateShockBps: number;
  collateralCoverageBefore: number | undefined;
  collateralCoverageAfter: number | undefined;
}): StressSensitivity {
  const { facilityBandWorsened, rateExposed, interestRateShockBps, collateralCoverageBefore, collateralCoverageAfter } = args;

  if (facilityBandWorsened) return 'high';

  if (rateExposed && Math.abs(interestRateShockBps) >= RATE_SHOCK_MATERIAL_BPS) return 'moderate';

  if (collateralCoverageBefore !== undefined && collateralCoverageAfter !== undefined) {
    const dropPp = (collateralCoverageBefore - collateralCoverageAfter) * 100;
    if (dropPp >= COVERAGE_DROP_MATERIAL_PP) return 'moderate';
  }

  if (rateExposed && interestRateShockBps !== 0) return 'low';

  return 'low';
}

function deriveLoanStressResult(scenario: StressScenarioInput, loan: StressTestLoanInput): LoanStressResult {
  const rateExposed = isRateExposed(loan.interestRateType);
  const notComputableReasons: string[] = [];

  const hasCollateral = typeof loan.collateralValue === 'number' && Number.isFinite(loan.collateralValue) && loan.collateralValue >= 0;
  const hasExposure = Number.isFinite(loan.exposure) && loan.exposure > 0;

  let collateralCoverageBefore: number | undefined;
  let collateralCoverageAfter: number | undefined;
  let facilityBandBefore: FacilityBand | undefined;
  let facilityBandAfter: FacilityBand | undefined;
  let facilityBandWorsened = false;

  if (!hasCollateral) {
    notComputableReasons.push('Collateral value not available — collateral-shock impact not computable for this loan.');
  } else if (hasExposure) {
    const collateralValue = loan.collateralValue as number;
    collateralCoverageBefore = collateralValue / loan.exposure;
    const shockedCollateralValue = collateralValue * (1 + scenario.collateralValueShockPct / 100);
    collateralCoverageAfter = shockedCollateralValue / loan.exposure;

    facilityBandBefore = deriveFacilityGrade({ collateralValue, exposure: loan.exposure }, loan.exposure).band;
    facilityBandAfter = deriveFacilityGrade({ collateralValue: shockedCollateralValue, exposure: loan.exposure }, loan.exposure).band;
    facilityBandWorsened = facilityBandIndex(facilityBandAfter) > facilityBandIndex(facilityBandBefore);
  }

  if (!rateExposed) {
    notComputableReasons.push('Loan is not on a recognized variable-rate structure — rate-shock impact does not apply.');
  }

  notComputableReasons.push(NOI_DSCR_LIMITATION);

  const sensitivity = hasExposure
    ? classifySensitivity({
        facilityBandWorsened,
        rateExposed,
        interestRateShockBps: scenario.interestRateShockBps,
        collateralCoverageBefore,
        collateralCoverageAfter,
      })
    : 'low';

  return {
    loanId: loan.loanId,
    borrowerName: loan.borrowerName,
    exposure: loan.exposure,
    rateExposed,
    collateralCoverageBefore,
    collateralCoverageAfter,
    facilityBandBefore,
    facilityBandAfter,
    facilityBandWorsened,
    sensitivity,
    notComputableReasons,
  };
}

const SENSITIVITY_RANK: Record<StressSensitivity, number> = { high: 0, moderate: 1, low: 2 };

/** Derive a full portfolio stress-test snapshot for one scenario against the real boarded-loan book. */
export function deriveStressTestSnapshot(
  scenario: StressScenarioInput,
  loans: readonly StressTestLoanInput[],
): PortfolioStressTestSnapshot {
  let excludedLoanCount = 0;
  const countable: StressTestLoanInput[] = [];
  for (const loan of loans) {
    if (Number.isFinite(loan.exposure) && loan.exposure > 0) countable.push(loan);
    else excludedLoanCount += 1;
  }

  const loanResults = countable
    .map((loan) => deriveLoanStressResult(scenario, loan))
    .sort((a, b) => {
      const rankDiff = SENSITIVITY_RANK[a.sensitivity] - SENSITIVITY_RANK[b.sensitivity];
      if (rankDiff !== 0) return rankDiff;
      return b.exposure - a.exposure;
    });

  const totalExposure = loanResults.reduce((sum, r) => sum + r.exposure, 0);

  const exposureBySensitivity = { low: 0, moderate: 0, high: 0 };
  const loanCountBySensitivity = { low: 0, moderate: 0, high: 0 };
  for (const r of loanResults) {
    exposureBySensitivity[r.sensitivity] += r.exposure;
    loanCountBySensitivity[r.sensitivity] += 1;
  }

  return {
    scenario,
    loanResults,
    totalExposure,
    exposureBySensitivity,
    loanCountBySensitivity,
    excludedLoanCount,
    isEmpty: loanResults.length === 0,
  };
}

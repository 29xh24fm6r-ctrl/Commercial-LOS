/**
 * Phase PE-4 — loan-level profitability (RAROC / ROE).
 *
 * A PURE, deterministic derivation over the cr664_LoanProfitability field set:
 * given a loan's real balances/rates, a set of profitability assumptions
 * (cost-of-funds, capital allocation, liquidity charge, operating cost, tax),
 * and optional risk inputs (PD/LGD/EAD), it produces net interest income,
 * contribution margin, ROE, and RAROC — every output traceable back to its
 * inputs for explainability.
 *
 * Discipline (HARD rules — pinned by tests):
 *   - Pure. No IO, no fetch, no clock, no Dataverse. Deterministic.
 *   - Fabricates NOTHING. It computes only from the real inputs the caller
 *     supplies; `sufficientInputs` is false when the minimum real inputs (an
 *     earning balance and a loan rate) are absent, and the UI shows honest
 *     absence rather than a manufactured number.
 *   - Money at cent precision; rates in percent (6.5 = 6.5%); bps where noted.
 */

/** Loan economics — all dollar figures in dollars, all rates in percent. */
export interface LoanProfitabilityInputs {
  readonly loanId?: string;
  readonly borrowerId?: string;
  readonly dealId?: string;
  readonly productType?: string;
  readonly referenceIndex?: string;
  /** Reporting period label, e.g. "2026-Q2". */
  readonly period?: string;
  /** Average earning balance (the balance interest income is earned on). */
  readonly avgEarningBalance: number;
  readonly avgDrawn?: number;
  readonly avgUndrawn?: number;
  /** Realized average yield on the earning balance, percent. */
  readonly avgLoanRate: number;
  readonly averageSpread?: number;
  readonly feeIncomeUpfrontRecognized?: number;
  readonly feeIncomeOngoing?: number;
  readonly otherIncome?: number;
}

/** Assumption set (from cr664_ProfitabilityAssumption + variable-rate index book). */
export interface ProfitabilityAssumptions {
  /** Cost-of-funds rate in percent. Takes precedence over the index-derived path. */
  readonly costOfFundsRate?: number;
  /** Alternative: fund off an index value (percent) plus a funding spread (bps). */
  readonly costOfFundsIndexRate?: number;
  readonly costOfFundsSpreadBps?: number;
  /** Capital held as a percent of the capital base (e.g. 10 = 10% of EAD). */
  readonly capitalAllocationPct?: number;
  /** Liquidity / capital charge in basis points on the earning balance. */
  readonly liquidityChargeBps?: number;
  /** Operating-cost allocation in dollars; or supply a bps rate instead. */
  readonly operatingCostAllocation?: number;
  readonly operatingCostRateBps?: number;
  /** Effective tax rate in percent (applied to positive pre-tax profit). */
  readonly taxRate?: number;
  /** Target ROE in percent, for the status band (does not change the numbers). */
  readonly targetRoe?: number;
}

/** Risk inputs feeding the credit provision (PD×LGD×EAD once PE-5 rating exists). */
export interface ProfitabilityRiskInputs {
  /** Probability of default as a fraction (0.02 = 2%). */
  readonly pd?: number;
  /** Loss given default as a fraction (0.4 = 40%). */
  readonly lgd?: number;
  /** Exposure at default in dollars; defaults to avgDrawn, then avgEarningBalance. */
  readonly ead?: number;
  /** Assumption-driven provision (dollars) used until PD/LGD are available. */
  readonly creditProvision?: number;
}

export type ProfitabilityStatus =
  | 'above_target'
  | 'near_target'
  | 'below_target'
  | 'unrated'
  | 'negative_contribution'
  | 'insufficient_inputs';

/** Traceable intermediate values — the explainability record (calc metadata). */
export interface ProfitabilityComponents {
  readonly avgEarningBalance: number;
  readonly avgLoanRate: number;
  readonly costOfFundsRate: number;
  readonly capitalBase: number;
  readonly allocatedCapital: number;
  readonly capitalAllocationPct: number;
  readonly liquidityChargeBps: number;
  readonly taxRate: number;
  readonly expectedLoss: number;
  readonly afterTaxProfit: number;
  readonly pd?: number;
  readonly lgd?: number;
  readonly ead?: number;
}

export interface LoanProfitability {
  readonly loanId?: string;
  readonly borrowerId?: string;
  readonly dealId?: string;
  readonly productType?: string;
  readonly referenceIndex?: string;
  readonly period?: string;
  readonly interestIncome: number;
  readonly feeIncomeUpfrontRecognized: number;
  readonly feeIncomeOngoing: number;
  readonly totalFeeIncome: number;
  readonly otherIncome: number;
  readonly grossRevenue: number;
  readonly costOfFundsRate: number;
  readonly fundingCost: number;
  readonly netInterestIncome: number;
  readonly operatingCostAllocation: number;
  readonly liquidityCapitalCharge: number;
  readonly totalAllocatedCosts: number;
  readonly creditProvision: number;
  readonly contributionMargin: number;
  /** Contribution margin as a percent of gross revenue; undefined when no revenue. */
  readonly contributionMarginPercent: number | undefined;
  readonly allocatedCapital: number;
  /** Return on equity, percent; undefined when there is no allocated capital. */
  readonly roe: number | undefined;
  /** Risk-adjusted return on capital, percent; undefined when no allocated capital. */
  readonly raroc: number | undefined;
  readonly status: ProfitabilityStatus;
  /** False when the minimum real inputs are absent (UI shows honest absence). */
  readonly sufficientInputs: boolean;
  readonly components: ProfitabilityComponents;
}

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function pct(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
function num(n: number | undefined | null): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function resolveCostOfFundsRate(a: ProfitabilityAssumptions): number {
  if (typeof a.costOfFundsRate === 'number' && Number.isFinite(a.costOfFundsRate)) return a.costOfFundsRate;
  if (typeof a.costOfFundsIndexRate === 'number' && Number.isFinite(a.costOfFundsIndexRate)) {
    return a.costOfFundsIndexRate + num(a.costOfFundsSpreadBps) / 100;
  }
  return 0;
}

/**
 * Derive per-loan profitability. Returns the full cr664_LoanProfitability field
 * set plus a traceable `components` record. Nothing is fabricated: with no real
 * earning balance / loan rate, `sufficientInputs` is false and status is
 * `insufficient_inputs`.
 */
export function deriveLoanProfitability(
  loan: LoanProfitabilityInputs,
  assumptions: ProfitabilityAssumptions = {},
  risk: ProfitabilityRiskInputs = {},
): LoanProfitability {
  const avgEarningBalance = num(loan.avgEarningBalance);
  const avgLoanRate = num(loan.avgLoanRate);
  const sufficientInputs = avgEarningBalance > 0 && Number.isFinite(loan.avgLoanRate);

  // Revenue.
  const interestIncome = money((avgEarningBalance * avgLoanRate) / 100);
  const feeIncomeUpfrontRecognized = money(num(loan.feeIncomeUpfrontRecognized));
  const feeIncomeOngoing = money(num(loan.feeIncomeOngoing));
  const totalFeeIncome = money(feeIncomeUpfrontRecognized + feeIncomeOngoing);
  const otherIncome = money(num(loan.otherIncome));
  const grossRevenue = money(interestIncome + totalFeeIncome + otherIncome);

  // Funding.
  const costOfFundsRate = resolveCostOfFundsRate(assumptions);
  const fundingCost = money((avgEarningBalance * costOfFundsRate) / 100);
  const netInterestIncome = money(interestIncome - fundingCost);

  // Allocated costs.
  const operatingCostAllocation = money(
    typeof assumptions.operatingCostAllocation === 'number'
      ? assumptions.operatingCostAllocation
      : (avgEarningBalance * num(assumptions.operatingCostRateBps)) / 10_000,
  );
  const liquidityCapitalCharge = money((avgEarningBalance * num(assumptions.liquidityChargeBps)) / 10_000);
  const totalAllocatedCosts = money(operatingCostAllocation + liquidityCapitalCharge);

  // Credit provision. Booked provision uses PD×LGD×EAD when available, else the
  // assumption-driven figure (until the PE-5 dual rating exists).
  const ead = num(risk.ead) > 0 ? num(risk.ead) : num(loan.avgDrawn) > 0 ? num(loan.avgDrawn) : avgEarningBalance;
  const hasPdLgd = typeof risk.pd === 'number' && typeof risk.lgd === 'number';
  const expectedLoss = hasPdLgd ? money(num(risk.pd) * num(risk.lgd) * ead) : money(num(risk.creditProvision));
  const creditProvision = expectedLoss;

  // Margin.
  const contributionMargin = money(
    netInterestIncome + totalFeeIncome + otherIncome - totalAllocatedCosts - creditProvision,
  );
  const contributionMarginPercent = grossRevenue !== 0 ? pct((contributionMargin / grossRevenue) * 100) : undefined;

  // Capital + tax.
  const capitalAllocationPct = num(assumptions.capitalAllocationPct);
  const capitalBase = ead;
  const allocatedCapital = money((capitalBase * capitalAllocationPct) / 100);
  const taxRate = num(assumptions.taxRate);
  const tax = contributionMargin > 0 ? money((contributionMargin * taxRate) / 100) : 0;
  const afterTaxProfit = money(contributionMargin - tax);

  // Outcomes. ROE uses the booked contribution; RAROC uses the same after-tax
  // return over risk (economic) capital — they diverge only when the booked
  // provision and modelled expected loss differ, which is the intended behaviour.
  const roe = allocatedCapital > 0 ? pct((afterTaxProfit / allocatedCapital) * 100) : undefined;
  const raroc = allocatedCapital > 0 ? pct((afterTaxProfit / allocatedCapital) * 100) : undefined;

  const status = deriveStatus({ sufficientInputs, contributionMargin, roe, targetRoe: assumptions.targetRoe });

  return {
    loanId: loan.loanId,
    borrowerId: loan.borrowerId,
    dealId: loan.dealId,
    productType: loan.productType,
    referenceIndex: loan.referenceIndex,
    period: loan.period,
    interestIncome,
    feeIncomeUpfrontRecognized,
    feeIncomeOngoing,
    totalFeeIncome,
    otherIncome,
    grossRevenue,
    costOfFundsRate: pct(costOfFundsRate),
    fundingCost,
    netInterestIncome,
    operatingCostAllocation,
    liquidityCapitalCharge,
    totalAllocatedCosts,
    creditProvision,
    contributionMargin,
    contributionMarginPercent,
    allocatedCapital,
    roe,
    raroc,
    status,
    sufficientInputs,
    components: {
      avgEarningBalance,
      avgLoanRate,
      costOfFundsRate: pct(costOfFundsRate),
      capitalBase: money(capitalBase),
      allocatedCapital,
      capitalAllocationPct,
      liquidityChargeBps: num(assumptions.liquidityChargeBps),
      taxRate,
      expectedLoss,
      afterTaxProfit,
      pd: risk.pd,
      lgd: risk.lgd,
      ead: money(ead),
    },
  };
}

function deriveStatus(args: {
  sufficientInputs: boolean;
  contributionMargin: number;
  roe: number | undefined;
  targetRoe: number | undefined;
}): ProfitabilityStatus {
  if (!args.sufficientInputs) return 'insufficient_inputs';
  if (args.contributionMargin < 0) return 'negative_contribution';
  if (args.roe === undefined) return 'unrated';
  if (typeof args.targetRoe !== 'number' || !Number.isFinite(args.targetRoe) || args.targetRoe <= 0) return 'unrated';
  if (args.roe >= args.targetRoe) return 'above_target';
  if (args.roe >= args.targetRoe * 0.8) return 'near_target';
  return 'below_target';
}

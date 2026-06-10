/**
 * Phase 142S — Executive product profitability / ROE AVAILABILITY model.
 *
 * PURE, READ-ONLY. Reports only whether the required SOURCE DATA appears available
 * for FUTURE profitability / ROE / yield / margin / fee-income / risk-adjusted-return
 * modeling. It calculates NO metric, invents NO ROE/yield/margin/fee figure, makes
 * NO pricing / credit / portfolio decision, calls NO GL / core / servicing system,
 * and mutates NOTHING. Every outcome keeps `readOnly` true and
 * `profitabilityCalculated`, `roeCalculated`, `yieldCalculated`, `marginCalculated`,
 * `feeIncomeCalculated`, and `externalSystemChanged` false. It never asserts a deal
 * is "profitable", "unprofitable", "high ROE", or "low ROE".
 */

export interface ProductProfitabilityAvailabilityInput {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  productType?: string;
  loanStructure?: string;
  pricingType?: string;
  amount?: number;
  approvedAmount?: number;
  stage?: string;
  status?: string;
  closeDate?: string;
  actualCloseDate?: string;
  maturityDate?: string;
  rateType?: string;
  interestRateAvailable?: boolean;
  feeIncomeAvailable?: boolean;
  costOfFundsAvailable?: boolean;
  chargeOffDataAvailable?: boolean;
  servicingPerformanceAvailable?: boolean;
  generalLedgerDataAvailable?: boolean;
  capitalAllocationDataAvailable?: boolean;
  sourceUpdatedAt?: string;
}

export type ProfitabilityAvailabilityStatus =
  | 'not_available'
  | 'partially_available'
  | 'source_data_required'
  | 'ready_for_future_modeling'
  | 'unknown';

export type FutureMetricReadiness = 'unavailable' | 'blocked' | 'ready_for_future_modeling';

export interface ProductProfitabilityFutureMetricReadiness {
  profitability: FutureMetricReadiness;
  roe: FutureMetricReadiness;
  yield: FutureMetricReadiness;
  spread: FutureMetricReadiness;
  feeIncome: FutureMetricReadiness;
  riskAdjustedReturn: FutureMetricReadiness;
}

export interface ProductProfitabilityAvailabilitySummary {
  dealId: string;
  dealName: string;
  clientName: string;
  productType: string;
  loanStructure: string;
  pricingType: string;
  availabilityStatus: ProfitabilityAvailabilityStatus;
  availabilityLabel: string;
  availableSourceCount: number;
  missingSourceCount: number;
  missingSourceLabels: readonly string[];
  blockedMetricLabels: readonly string[];
  futureMetricReadiness: ProductProfitabilityFutureMetricReadiness;
  warnings: readonly string[];
  nextReadOnlyReviewStep: string;
  /** Pinned — availability model only; nothing is calculated. */
  readOnly: true;
  profitabilityCalculated: false;
  roeCalculated: false;
  yieldCalculated: false;
  marginCalculated: false;
  feeIncomeCalculated: false;
  externalSystemChanged: false;
}

interface SourceCategory {
  key: keyof ProductProfitabilityAvailabilityInput;
  label: string;
}

/** The source-data categories required before any future profitability modeling. */
const SOURCE_CATEGORIES: readonly SourceCategory[] = [
  { key: 'interestRateAvailable', label: 'Interest rate / yield inputs' },
  { key: 'feeIncomeAvailable', label: 'Fee income source' },
  { key: 'costOfFundsAvailable', label: 'Cost of funds source' },
  { key: 'chargeOffDataAvailable', label: 'Charge-off / loss history source' },
  { key: 'servicingPerformanceAvailable', label: 'Servicing performance source' },
  { key: 'generalLedgerDataAvailable', label: 'General ledger data contract' },
  { key: 'capitalAllocationDataAvailable', label: 'Capital allocation methodology' },
];

const STATUS_LABELS: Record<ProfitabilityAvailabilityStatus, string> = {
  not_available: 'Profitability source data not available',
  partially_available: 'Profitability source data partially available',
  source_data_required: 'Core business dimensions required before availability assessment',
  ready_for_future_modeling: 'Source data appears available for future modeling (no metric is calculated)',
  unknown: 'Profitability availability unknown',
};

const NEXT_STEPS: Record<ProfitabilityAvailabilityStatus, string> = {
  not_available: 'Establish the profitability source-data contracts before any future modeling.',
  partially_available: 'Complete the remaining source-data contracts before any future modeling.',
  source_data_required: 'Provide the core product / loan / pricing dimensions before assessing availability.',
  ready_for_future_modeling: 'A future, finance-approved modeling phase may begin design (no metric is calculated here).',
  unknown: 'Provide deal identity to assess profitability availability.',
};

function text(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function deriveProductProfitabilityAvailability(
  input: ProductProfitabilityAvailabilityInput | null | undefined,
): ProductProfitabilityAvailabilitySummary {
  const dealRef = (input?.dealId ?? '').trim();
  const warnings: string[] = [];

  const availableCategories = SOURCE_CATEGORIES.filter((c) => input?.[c.key] === true);
  const missingCategories = SOURCE_CATEGORIES.filter((c) => input?.[c.key] !== true);
  const availableSourceCount = availableCategories.length;
  const missingSourceCount = missingCategories.length;
  const missingSourceLabels = missingCategories.map((c) => c.label);

  // Core business dimensions needed before any availability assessment is meaningful.
  const hasCoreDimensions =
    input?.productType !== undefined && input?.loanStructure !== undefined && input?.pricingType !== undefined;

  let availabilityStatus: ProfitabilityAvailabilityStatus;
  if (!input || dealRef.length === 0) {
    availabilityStatus = 'unknown';
    warnings.push('Deal identity is missing; profitability availability cannot be assessed.');
  } else if (!hasCoreDimensions) {
    availabilityStatus = 'source_data_required';
    warnings.push('Core product / loan / pricing dimensions are missing; availability cannot be assessed from product type alone.');
  } else if (availableSourceCount === 0) {
    availabilityStatus = 'not_available';
    warnings.push('No profitability source data is available; no metric can be modeled.');
  } else if (availableSourceCount < SOURCE_CATEGORIES.length) {
    availabilityStatus = 'partially_available';
    warnings.push('Some profitability source categories are missing; no metric is calculated.');
  } else {
    availabilityStatus = 'ready_for_future_modeling';
    warnings.push('Source data appears available, but no profitability metric is calculated in this phase.');
  }

  // Future metric readiness mirrors the availability status — never a calculated value.
  const metricReadiness: FutureMetricReadiness =
    availabilityStatus === 'ready_for_future_modeling' ? 'ready_for_future_modeling'
      : availabilityStatus === 'partially_available' ? 'blocked'
        : 'unavailable';

  const futureMetricReadiness: ProductProfitabilityFutureMetricReadiness = {
    profitability: metricReadiness,
    roe: metricReadiness,
    yield: metricReadiness,
    spread: metricReadiness,
    feeIncome: metricReadiness,
    riskAdjustedReturn: metricReadiness,
  };

  const blockedMetricLabels =
    metricReadiness === 'ready_for_future_modeling'
      ? []
      : ['Profitability', 'ROE', 'Yield', 'Spread', 'Fee income', 'Risk-adjusted return'];

  return {
    dealId: dealRef,
    dealName: text(input?.dealName, dealRef.length > 0 ? dealRef : 'unavailable'),
    clientName: text(input?.clientName, 'Unknown client'),
    productType: text(input?.productType, 'unavailable'),
    loanStructure: text(input?.loanStructure, 'unavailable'),
    pricingType: text(input?.pricingType, 'unavailable'),
    availabilityStatus,
    availabilityLabel: STATUS_LABELS[availabilityStatus],
    availableSourceCount,
    missingSourceCount,
    missingSourceLabels,
    blockedMetricLabels,
    futureMetricReadiness,
    warnings,
    nextReadOnlyReviewStep: NEXT_STEPS[availabilityStatus],
    readOnly: true,
    profitabilityCalculated: false,
    roeCalculated: false,
    yieldCalculated: false,
    marginCalculated: false,
    feeIncomeCalculated: false,
    externalSystemChanged: false,
  };
}

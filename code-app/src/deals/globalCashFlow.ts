/**
 * PR 105 -- Global Cash Flow (GCF) analysis: the standard commercial credit
 * underwriting method for sizing a borrower's (and its guarantors')
 * capacity to service debt. Nothing in this codebase computed this before
 * (see FACTORY_ARC_BASELINE.md #9 -- "financial spreading and global cash
 * flow engine: DOES NOT EXIST").
 *
 * Methodology (documented so a credit officer can audit the formula, not
 * just trust a number):
 *
 *   Business Cash Flow (pre-debt-service) =
 *     Net Income + Interest Expense + Income Taxes + Depreciation +
 *     Amortization (= EBITDA) + Non-Recurring Addbacks − Non-Recurring
 *     Income − Unfinanced CapEx
 *
 *   Personal Cash Flow (pre-debt-service), per guarantor =
 *     Gross Personal Income + Non-Cash Addbacks − Personal Living Expenses
 *
 *   Global Cash Flow = Business Cash Flow + sum(Personal Cash Flow)
 *
 *   Global Debt Service = Proposed New Debt Service + Other Business Debt
 *     Service + sum(Other Personal Debt Service, per guarantor)
 *
 *   Global DSCR = Global Cash Flow / Global Debt Service
 *
 * Both sides are computed BEFORE any debt service is netted out of either
 * the business or personal cash-flow figures, and the denominator counts
 * every obligation (business + personal + the proposed loan) once. This
 * avoids the double-counting ambiguity of methods that net some debt into
 * the numerator and some into the denominator.
 *
 * Pure: no IO, no service import. Never fabricates a DSCR from incomplete
 * inputs -- a required figure missing produces an 'insufficient-data'
 * outcome naming exactly what's missing, not a silently-substituted zero.
 */

export interface BusinessCashFlowInput {
  readonly netIncome?: number;
  readonly interestExpense?: number;
  readonly incomeTaxes?: number;
  readonly depreciation?: number;
  readonly amortization?: number;
  readonly nonRecurringAddbacks?: number;
  readonly nonRecurringIncome?: number;
  readonly unfinancedCapEx?: number;
}

export interface PersonalCashFlowInput {
  readonly guarantorName: string;
  readonly grossPersonalIncome?: number;
  readonly nonCashAddbacks?: number;
  readonly personalLivingExpenses?: number;
  /** This guarantor's debt service on obligations OTHER than the subject loan. */
  readonly otherPersonalDebtService?: number;
}

export interface GlobalDebtServiceInput {
  readonly proposedNewDebtService: number;
  readonly otherBusinessDebtService?: number;
}

export interface GlobalCashFlowInput {
  readonly business: BusinessCashFlowInput;
  readonly guarantors: readonly PersonalCashFlowInput[];
  readonly debtService: GlobalDebtServiceInput;
}

export interface CashFlowLineItem {
  readonly label: string;
  readonly amount: number;
}

export interface BusinessCashFlowResult {
  readonly ebitda: number;
  readonly adjustedCashFlow: number;
  readonly lineItems: readonly CashFlowLineItem[];
}

export interface PersonalCashFlowResult {
  readonly guarantorName: string;
  readonly cashFlow: number;
  readonly otherPersonalDebtService: number;
  readonly lineItems: readonly CashFlowLineItem[];
}

export type GlobalCashFlowOutcome =
  | {
      readonly kind: 'computed';
      readonly business: BusinessCashFlowResult;
      readonly guarantors: readonly PersonalCashFlowResult[];
      readonly globalCashFlow: number;
      readonly globalDebtService: number;
      readonly dscr: number;
    }
  | {
      readonly kind: 'insufficient-data';
      /** Exactly what's missing, e.g. "Business: net income", "Guarantor Jane Doe: gross personal income". */
      readonly missingInputs: readonly string[];
    };

function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function computeBusinessCashFlow(b: BusinessCashFlowInput): BusinessCashFlowResult {
  const ebitda = num(b.netIncome) + num(b.interestExpense) + num(b.incomeTaxes) + num(b.depreciation) + num(b.amortization);
  const adjustedCashFlow = ebitda + num(b.nonRecurringAddbacks) - num(b.nonRecurringIncome) - num(b.unfinancedCapEx);
  return {
    ebitda,
    adjustedCashFlow,
    lineItems: [
      { label: 'Net Income', amount: num(b.netIncome) },
      { label: '+ Interest Expense', amount: num(b.interestExpense) },
      { label: '+ Income Taxes', amount: num(b.incomeTaxes) },
      { label: '+ Depreciation', amount: num(b.depreciation) },
      { label: '+ Amortization', amount: num(b.amortization) },
      { label: '= EBITDA', amount: ebitda },
      { label: '+ Non-Recurring Addbacks', amount: num(b.nonRecurringAddbacks) },
      { label: '− Non-Recurring Income', amount: -num(b.nonRecurringIncome) },
      { label: '− Unfinanced CapEx', amount: -num(b.unfinancedCapEx) },
      { label: '= Business Cash Flow (pre-debt-service)', amount: adjustedCashFlow },
    ],
  };
}

function computePersonalCashFlow(g: PersonalCashFlowInput): PersonalCashFlowResult {
  const cashFlow = num(g.grossPersonalIncome) + num(g.nonCashAddbacks) - num(g.personalLivingExpenses);
  return {
    guarantorName: g.guarantorName,
    cashFlow,
    otherPersonalDebtService: num(g.otherPersonalDebtService),
    lineItems: [
      { label: 'Gross Personal Income', amount: num(g.grossPersonalIncome) },
      { label: '+ Non-Cash Addbacks', amount: num(g.nonCashAddbacks) },
      { label: '− Personal Living Expenses', amount: -num(g.personalLivingExpenses) },
      { label: '= Personal Cash Flow (pre-debt-service)', amount: cashFlow },
    ],
  };
}

function findMissingInputs(input: GlobalCashFlowInput): string[] {
  const missing: string[] = [];
  if (typeof input.business.netIncome !== 'number') missing.push('Business: net income');
  if (input.guarantors.length === 0) missing.push('At least one guarantor’s personal cash flow');
  for (const g of input.guarantors) {
    if (typeof g.grossPersonalIncome !== 'number') missing.push(`Guarantor ${g.guarantorName}: gross personal income`);
  }
  if (!(input.debtService.proposedNewDebtService > 0)) missing.push('Proposed new debt service (must be greater than zero)');
  return missing;
}

/** Compute the Global Cash Flow / DSCR outcome. Never fabricates a number from incomplete inputs. */
export function computeGlobalCashFlow(input: GlobalCashFlowInput): GlobalCashFlowOutcome {
  const missingInputs = findMissingInputs(input);
  if (missingInputs.length > 0) {
    return { kind: 'insufficient-data', missingInputs };
  }

  const business = computeBusinessCashFlow(input.business);
  const guarantors = input.guarantors.map(computePersonalCashFlow);

  const globalCashFlow = business.adjustedCashFlow + guarantors.reduce((sum, g) => sum + g.cashFlow, 0);
  const globalDebtService =
    input.debtService.proposedNewDebtService +
    num(input.debtService.otherBusinessDebtService) +
    guarantors.reduce((sum, g) => sum + g.otherPersonalDebtService, 0);

  const dscr = globalDebtService > 0 ? globalCashFlow / globalDebtService : 0;

  return { kind: 'computed', business, guarantors, globalCashFlow, globalDebtService, dscr };
}

/** Standard credit-policy DSCR bands, for a plain-language read of a computed ratio. */
export type DscrBand = 'strong' | 'acceptable' | 'marginal' | 'insufficient';

export function classifyDscr(dscr: number): DscrBand {
  if (dscr >= 1.5) return 'strong';
  if (dscr >= 1.25) return 'acceptable';
  if (dscr >= 1.0) return 'marginal';
  return 'insufficient';
}

/**
 * Factory Arc Phase 4 — the banker-entered raw string form state persisted as JSON into
 * cr664_financialspreadinputs (a Memo column, see
 * scripts/schema-migrations/pr105-loan-structure/columns.mjs). Kept as raw strings (not the
 * parsed GlobalCashFlowInput) so a reload restores exactly what was typed, including a blank
 * field, rather than re-stringifying already-parsed numbers.
 */
export interface GlobalCashFlowFormGuarantor {
  readonly guarantorName: string;
  readonly grossPersonalIncome: string;
  readonly nonCashAddbacks: string;
  readonly personalLivingExpenses: string;
  readonly otherPersonalDebtService: string;
}

export interface GlobalCashFlowFormState {
  readonly netIncome: string;
  readonly interestExpense: string;
  readonly incomeTaxes: string;
  readonly depreciation: string;
  readonly amortization: string;
  readonly nonRecurringAddbacks: string;
  readonly nonRecurringIncome: string;
  readonly unfinancedCapEx: string;
  readonly proposedNewDebtService: string;
  readonly otherBusinessDebtService: string;
  readonly guarantors: readonly GlobalCashFlowFormGuarantor[];
}

export const EMPTY_GLOBAL_CASH_FLOW_FORM_STATE: GlobalCashFlowFormState = {
  netIncome: '',
  interestExpense: '',
  incomeTaxes: '',
  depreciation: '',
  amortization: '',
  nonRecurringAddbacks: '',
  nonRecurringIncome: '',
  unfinancedCapEx: '',
  proposedNewDebtService: '',
  otherBusinessDebtService: '',
  guarantors: [],
};

export function serializeGlobalCashFlowFormState(state: GlobalCashFlowFormState): string {
  return JSON.stringify(state);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Fail-closed parse: any missing, corrupt, or unexpectedly-shaped JSON returns the empty form
 * state rather than throwing — a banker sees a blank panel, never a crash, if a live value is
 * ever malformed.
 */
export function parseGlobalCashFlowFormState(json: string | undefined): GlobalCashFlowFormState {
  if (!json || json.trim().length === 0) return EMPTY_GLOBAL_CASH_FLOW_FORM_STATE;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return EMPTY_GLOBAL_CASH_FLOW_FORM_STATE;
    const p = parsed as Partial<GlobalCashFlowFormState>;
    const guarantors: GlobalCashFlowFormGuarantor[] = Array.isArray(p.guarantors)
      ? p.guarantors.map((g) => {
          const gg = (g ?? {}) as Partial<GlobalCashFlowFormGuarantor>;
          return {
            guarantorName: str(gg.guarantorName),
            grossPersonalIncome: str(gg.grossPersonalIncome),
            nonCashAddbacks: str(gg.nonCashAddbacks),
            personalLivingExpenses: str(gg.personalLivingExpenses),
            otherPersonalDebtService: str(gg.otherPersonalDebtService),
          };
        })
      : [];
    return {
      netIncome: str(p.netIncome),
      interestExpense: str(p.interestExpense),
      incomeTaxes: str(p.incomeTaxes),
      depreciation: str(p.depreciation),
      amortization: str(p.amortization),
      nonRecurringAddbacks: str(p.nonRecurringAddbacks),
      nonRecurringIncome: str(p.nonRecurringIncome),
      unfinancedCapEx: str(p.unfinancedCapEx),
      proposedNewDebtService: str(p.proposedNewDebtService),
      otherBusinessDebtService: str(p.otherBusinessDebtService),
      guarantors,
    };
  } catch {
    return EMPTY_GLOBAL_CASH_FLOW_FORM_STATE;
  }
}

import { describe, it, expect } from 'vitest';
import {
  computeGlobalCashFlow,
  classifyDscr,
  serializeGlobalCashFlowFormState,
  parseGlobalCashFlowFormState,
  EMPTY_GLOBAL_CASH_FLOW_FORM_STATE,
  type GlobalCashFlowInput,
  type GlobalCashFlowFormState,
} from './globalCashFlow';

function baseInput(overrides: Partial<GlobalCashFlowInput> = {}): GlobalCashFlowInput {
  return {
    business: {
      netIncome: 200_000,
      interestExpense: 30_000,
      incomeTaxes: 40_000,
      depreciation: 50_000,
      amortization: 10_000,
      nonRecurringAddbacks: 0,
      nonRecurringIncome: 0,
      unfinancedCapEx: 20_000,
    },
    guarantors: [
      {
        guarantorName: 'Jane Doe',
        grossPersonalIncome: 120_000,
        nonCashAddbacks: 0,
        personalLivingExpenses: 60_000,
        otherPersonalDebtService: 12_000,
      },
    ],
    debtService: {
      proposedNewDebtService: 250_000,
      otherBusinessDebtService: 30_000,
    },
    ...overrides,
  };
}

describe('computeGlobalCashFlow', () => {
  it('computes EBITDA, business cash flow, personal cash flow, and global DSCR from complete inputs', () => {
    const outcome = computeGlobalCashFlow(baseInput());
    expect(outcome.kind).toBe('computed');
    if (outcome.kind !== 'computed') throw new Error('expected computed');

    // EBITDA = 200,000 + 30,000 + 40,000 + 50,000 + 10,000 = 330,000
    expect(outcome.business.ebitda).toBe(330_000);
    // Business CF = 330,000 + 0 - 0 - 20,000 = 310,000
    expect(outcome.business.adjustedCashFlow).toBe(310_000);
    // Personal CF = 120,000 + 0 - 60,000 = 60,000
    expect(outcome.guarantors[0]!.cashFlow).toBe(60_000);
    // Global CF = 310,000 + 60,000 = 370,000
    expect(outcome.globalCashFlow).toBe(370_000);
    // Global debt service = 250,000 (proposed) + 30,000 (other business) + 12,000 (other personal) = 292,000
    expect(outcome.globalDebtService).toBe(292_000);
    // DSCR = 370,000 / 292,000
    expect(outcome.dscr).toBeCloseTo(370_000 / 292_000, 6);
  });

  it('supports multiple guarantors, summing each one’s cash flow and other debt service', () => {
    const outcome = computeGlobalCashFlow(
      baseInput({
        guarantors: [
          { guarantorName: 'Jane Doe', grossPersonalIncome: 120_000, personalLivingExpenses: 60_000, otherPersonalDebtService: 12_000 },
          { guarantorName: 'John Doe', grossPersonalIncome: 90_000, personalLivingExpenses: 40_000, otherPersonalDebtService: 5_000 },
        ],
      }),
    );
    expect(outcome.kind).toBe('computed');
    if (outcome.kind !== 'computed') throw new Error('expected computed');
    // Personal CF: Jane 60,000 + John 50,000 = 110,000
    expect(outcome.globalCashFlow).toBe(310_000 + 110_000);
    expect(outcome.globalDebtService).toBe(250_000 + 30_000 + 12_000 + 5_000);
  });

  it('never fabricates a DSCR when the business net income is missing', () => {
    const outcome = computeGlobalCashFlow(baseInput({ business: { ...baseInput().business, netIncome: undefined } }));
    expect(outcome.kind).toBe('insufficient-data');
    if (outcome.kind !== 'insufficient-data') throw new Error('expected insufficient-data');
    expect(outcome.missingInputs).toContain('Business: net income');
  });

  it('never fabricates a DSCR when there are no guarantors', () => {
    const outcome = computeGlobalCashFlow(baseInput({ guarantors: [] }));
    expect(outcome.kind).toBe('insufficient-data');
    if (outcome.kind !== 'insufficient-data') throw new Error('expected insufficient-data');
    expect(outcome.missingInputs.some((m) => m.includes('guarantor'))).toBe(true);
  });

  it('never fabricates a DSCR when a guarantor is missing gross personal income', () => {
    const outcome = computeGlobalCashFlow(
      baseInput({ guarantors: [{ guarantorName: 'Jane Doe', personalLivingExpenses: 60_000 }] }),
    );
    expect(outcome.kind).toBe('insufficient-data');
    if (outcome.kind !== 'insufficient-data') throw new Error('expected insufficient-data');
    expect(outcome.missingInputs).toContain('Guarantor Jane Doe: gross personal income');
  });

  it('never fabricates a DSCR when the proposed debt service is zero or missing', () => {
    const outcome = computeGlobalCashFlow(baseInput({ debtService: { proposedNewDebtService: 0 } }));
    expect(outcome.kind).toBe('insufficient-data');
    if (outcome.kind !== 'insufficient-data') throw new Error('expected insufficient-data');
    expect(outcome.missingInputs.some((m) => m.includes('debt service'))).toBe(true);
  });
});

describe('classifyDscr', () => {
  it('classifies standard credit-policy bands', () => {
    expect(classifyDscr(1.6)).toBe('strong');
    expect(classifyDscr(1.5)).toBe('strong');
    expect(classifyDscr(1.3)).toBe('acceptable');
    expect(classifyDscr(1.25)).toBe('acceptable');
    expect(classifyDscr(1.1)).toBe('marginal');
    expect(classifyDscr(1.0)).toBe('marginal');
    expect(classifyDscr(0.9)).toBe('insufficient');
  });
});

describe('GlobalCashFlowFormState serialize / parse (Factory Arc Phase 4)', () => {
  const filled: GlobalCashFlowFormState = {
    netIncome: '200000',
    interestExpense: '30000',
    incomeTaxes: '40000',
    depreciation: '50000',
    amortization: '10000',
    nonRecurringAddbacks: '5000',
    nonRecurringIncome: '2000',
    unfinancedCapEx: '15000',
    proposedNewDebtService: '250000',
    otherBusinessDebtService: '10000',
    guarantors: [
      { guarantorName: 'Jane Doe', grossPersonalIncome: '120000', nonCashAddbacks: '0', personalLivingExpenses: '60000', otherPersonalDebtService: '5000' },
      { guarantorName: 'John Roe', grossPersonalIncome: '90000', nonCashAddbacks: '', personalLivingExpenses: '40000', otherPersonalDebtService: '' },
    ],
  };

  it('round-trips a fully populated form state exactly', () => {
    const json = serializeGlobalCashFlowFormState(filled);
    expect(parseGlobalCashFlowFormState(json)).toEqual(filled);
  });

  it('round-trips the empty state', () => {
    const json = serializeGlobalCashFlowFormState(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
    expect(parseGlobalCashFlowFormState(json)).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
  });

  it('parses undefined / empty-string input as the empty state (no saved value yet)', () => {
    expect(parseGlobalCashFlowFormState(undefined)).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
    expect(parseGlobalCashFlowFormState('')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
    expect(parseGlobalCashFlowFormState('   ')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
  });

  it('fails closed on corrupt JSON — returns the empty state, never throws', () => {
    expect(() => parseGlobalCashFlowFormState('{not valid json')).not.toThrow();
    expect(parseGlobalCashFlowFormState('{not valid json')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
  });

  it('fails closed on valid JSON of the wrong shape (array, primitive, null-ish object)', () => {
    expect(parseGlobalCashFlowFormState('[1,2,3]')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
    expect(parseGlobalCashFlowFormState('"just a string"')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
    expect(parseGlobalCashFlowFormState('null')).toEqual(EMPTY_GLOBAL_CASH_FLOW_FORM_STATE);
  });

  it('drops non-string junk on individual fields rather than propagating it', () => {
    const json = JSON.stringify({ netIncome: 12345, guarantors: [{ guarantorName: 'X', grossPersonalIncome: null }] });
    const parsed = parseGlobalCashFlowFormState(json);
    expect(parsed.netIncome).toBe('');
    expect(parsed.guarantors).toEqual([
      { guarantorName: 'X', grossPersonalIncome: '', nonCashAddbacks: '', personalLivingExpenses: '', otherPersonalDebtService: '' },
    ]);
  });
});

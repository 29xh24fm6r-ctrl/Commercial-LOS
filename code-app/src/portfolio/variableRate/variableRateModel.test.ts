import { describe, it, expect } from 'vitest';
import {
  buildRateIndexBook,
  normalizeIndexType,
  type RateIndexValue,
} from './rateIndexModel';
import {
  computeFullyIndexedRate,
  deriveVariableRateRow,
  deriveVariableRateRows,
  deriveRateAlerts,
  isVariableRate,
  PAYMENT_61_PRESET,
  type VariableRateLoanInput,
} from './variableRateModel';

/**
 * Phase 262 (D/F/G) — variable-rate derivation + alerts + payment-61 preset.
 */

const NOW = new Date('2026-06-26T00:00:00Z');

function indexBook(values: Partial<Record<string, number>>): ReturnType<typeof buildRateIndexBook> {
  const list: RateIndexValue[] = [];
  if (values.Prime !== undefined) list.push({ indexType: 'Prime', value: values.Prime, effectiveDate: '2026-06-20', source: 'WSJ' });
  if (values.SOFR !== undefined) list.push({ indexType: 'SOFR', value: values.SOFR, effectiveDate: '2026-06-20', source: 'FRED' });
  return buildRateIndexBook(list);
}

function loan(over: Partial<VariableRateLoanInput> = {}): VariableRateLoanInput {
  return {
    loanNumber: 'L-1', borrower: 'Acme', interestRateType: 'Variable',
    index: 'Prime', spread: 1.5, currentNoteRate: null, floor: null, ceiling: null,
    nextRateChangeDate: null, ...over,
  };
}

describe('normalizeIndexType', () => {
  it('maps free text to known indexes', () => {
    expect(normalizeIndexType('Prime')).toBe('Prime');
    expect(normalizeIndexType('1-mo SOFR')).toBe('SOFR');
    expect(normalizeIndexType('5 Year Treasury CMT')).toBe('5-Year Treasury');
    expect(normalizeIndexType('LIBOR-ish')).toBe('Other');
    expect(normalizeIndexType('')).toBeUndefined();
  });
});

describe('isVariableRate', () => {
  it('treats Variable and Adjustable as variable; Fixed as not', () => {
    expect(isVariableRate('Variable')).toBe(true);
    expect(isVariableRate('Adjustable')).toBe(true);
    expect(isVariableRate('Fixed')).toBe(false);
    expect(isVariableRate(undefined)).toBe(false);
  });
});

describe('computeFullyIndexedRate', () => {
  it('is index + spread, clamped to floor/ceiling', () => {
    expect(computeFullyIndexedRate(5.5, 1.5, undefined, undefined)).toBe(7);
    expect(computeFullyIndexedRate(5.5, 1.5, 8, undefined)).toBe(8); // floor lifts it
    expect(computeFullyIndexedRate(5.5, 1.5, undefined, 6.5)).toBe(6.5); // ceiling caps it
    expect(computeFullyIndexedRate(undefined, 1.5, undefined, undefined)).toBeUndefined();
    expect(computeFullyIndexedRate(5.5, undefined, undefined, undefined)).toBeUndefined();
  });
});

describe('deriveVariableRateRow', () => {
  it('computes the fully-indexed rate from the operator-entered index value', () => {
    const r = deriveVariableRateRow(loan({ currentNoteRate: 7 }), indexBook({ Prime: 5.5 }), NOW);
    expect(r.indexType).toBe('Prime');
    expect(r.indexValue).toBe(5.5);
    expect(r.fullyIndexedRate).toBe(7);
    expect(r.difference).toBe(0);
    expect(r.rateActionRequired).toBe(false);
  });

  it('leaves fully-indexed rate undefined when the index value is not entered (no fabrication)', () => {
    const r = deriveVariableRateRow(loan(), indexBook({}), NOW);
    expect(r.indexValue).toBeUndefined();
    expect(r.fullyIndexedRate).toBeUndefined();
  });

  it('flags a rate mismatch and floor/ceiling status', () => {
    const r = deriveVariableRateRow(loan({ currentNoteRate: 6.0, ceiling: 6.5 }), indexBook({ Prime: 5.5 }), NOW);
    expect(r.fullyIndexedRate).toBe(6.5); // 7 capped to ceiling 6.5
    expect(r.floorCeilingStatus).toBe('at-ceiling');
    expect(r.difference).toBeCloseTo(-0.5);
    expect(r.rateActionRequired).toBe(true);
  });

  it('computes reset buckets from the next rate change date', () => {
    const due20 = new Date(NOW.getTime() + 20 * 86_400_000).toISOString();
    const overdue = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    expect(deriveVariableRateRow(loan({ nextRateChangeDate: due20 }), indexBook({ Prime: 5 }), NOW).resetBucket).toBe('due-30');
    expect(deriveVariableRateRow(loan({ nextRateChangeDate: overdue }), indexBook({ Prime: 5 }), NOW).resetBucket).toBe('overdue');
  });

  it('filters out fixed-rate loans in deriveVariableRateRows', () => {
    const rows = deriveVariableRateRows(
      [loan({ loanNumber: 'V-1' }), loan({ loanNumber: 'F-1', interestRateType: 'Fixed' })],
      indexBook({ Prime: 5 }),
      NOW,
    );
    expect(rows.map((r) => r.loanNumber)).toEqual(['V-1']);
  });
});

describe('deriveRateAlerts', () => {
  it('emits missing-index-spread when a variable loan lacks index or spread', () => {
    const rows = deriveVariableRateRows([loan({ spread: null })], indexBook({ Prime: 5 }), NOW);
    const alerts = deriveRateAlerts(rows);
    expect(alerts.some((a) => a.type === 'missing-index-spread')).toBe(true);
  });

  it('emits reset-overdue and payment-61-approaching', () => {
    const due20 = new Date(NOW.getTime() + 20 * 86_400_000).toISOString();
    const overdue = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    const rows = deriveVariableRateRows(
      [
        loan({ loanNumber: 'OD', nextRateChangeDate: overdue }),
        loan({ loanNumber: 'P61', nextRateChangeDate: due20, payment61Reset: true }),
      ],
      indexBook({ Prime: 5 }),
      NOW,
    );
    const alerts = deriveRateAlerts(rows);
    expect(alerts.some((a) => a.loanNumber === 'OD' && a.type === 'reset-overdue' && a.severity === 'critical')).toBe(true);
    expect(alerts.some((a) => a.loanNumber === 'P61' && a.type === 'payment-61-approaching')).toBe(true);
  });

  it('emits rate-mismatch when note rate differs from fully-indexed', () => {
    const rows = deriveVariableRateRows([loan({ currentNoteRate: 6.0 })], indexBook({ Prime: 5.5 }), NOW); // FI=7, note=6 → -1
    const alerts = deriveRateAlerts(rows);
    expect(alerts.some((a) => a.type === 'rate-mismatch')).toBe(true);
  });
});

describe('PAYMENT_61_PRESET', () => {
  it('is 10-year term / 5-year reset / payment 61', () => {
    expect(PAYMENT_61_PRESET).toEqual({ termMonths: 120, initialFixedPeriodMonths: 60, firstResetPaymentNumber: 61, payment61Reset: true });
  });
});

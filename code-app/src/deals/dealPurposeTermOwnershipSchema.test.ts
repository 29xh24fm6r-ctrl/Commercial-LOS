import { describe, it, expect } from 'vitest';
import {
  LOAN_PURPOSE_OPTIONS,
  OWNERSHIP_STATUS_OPTIONS,
  PROPOSED_LOAN_TERM_MAX_MONTHS,
  LOAN_TERM_MIN_MONTHS,
  isValidLoanTermMonths,
  isValidLoanPurpose,
  isValidOwnershipStatus,
} from './dealPurposeTermOwnershipSchema';

/**
 * final-seven-workstreams Workstream 5A — this module is prepared, NOT-YET-LIVE schema shape (the
 * Dataverse columns it mirrors do not exist). These tests pin the pure logic only (option
 * membership, term-range validation); there is no live read/write path to test since none exists.
 */
describe('dealPurposeTermOwnershipSchema (prepared, not yet wired)', () => {
  it('names exactly 9 loan purpose options with distinct, non-overlapping option-set values', () => {
    expect(LOAN_PURPOSE_OPTIONS).toHaveLength(9);
    const values = LOAN_PURPOSE_OPTIONS.map((o) => o.optionSetValue);
    expect(new Set(values).size).toBe(values.length);
  });

  it('names exactly 5 ownership status options with distinct, non-overlapping option-set values', () => {
    expect(OWNERSHIP_STATUS_OPTIONS).toHaveLength(5);
    const values = OWNERSHIP_STATUS_OPTIONS.map((o) => o.optionSetValue);
    expect(new Set(values).size).toBe(values.length);
  });

  it('isValidLoanTermMonths accepts the proposed [1, 480] range, integers only', () => {
    expect(LOAN_TERM_MIN_MONTHS).toBe(1);
    expect(PROPOSED_LOAN_TERM_MAX_MONTHS).toBe(480);
    expect(isValidLoanTermMonths(1)).toBe(true);
    expect(isValidLoanTermMonths(480)).toBe(true);
    expect(isValidLoanTermMonths(240)).toBe(true);
    expect(isValidLoanTermMonths(0)).toBe(false);
    expect(isValidLoanTermMonths(481)).toBe(false);
    expect(isValidLoanTermMonths(-5)).toBe(false);
    expect(isValidLoanTermMonths(36.5)).toBe(false);
  });

  it('isValidLoanPurpose recognizes exactly the 9 canonical values and nothing else', () => {
    for (const opt of LOAN_PURPOSE_OPTIONS) expect(isValidLoanPurpose(opt.value)).toBe(true);
    expect(isValidLoanPurpose('SomethingElse')).toBe(false);
    expect(isValidLoanPurpose(undefined)).toBe(false);
    expect(isValidLoanPurpose(null)).toBe(false);
  });

  it('isValidOwnershipStatus recognizes exactly the 5 canonical values and nothing else', () => {
    for (const opt of OWNERSHIP_STATUS_OPTIONS) expect(isValidOwnershipStatus(opt.value)).toBe(true);
    expect(isValidOwnershipStatus('SomethingElse')).toBe(false);
    expect(isValidOwnershipStatus(undefined)).toBe(false);
  });
});

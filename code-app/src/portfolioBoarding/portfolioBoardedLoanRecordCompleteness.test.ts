import { describe, it, expect } from 'vitest';
import { deriveBoardedLoanRecordCompleteness, CHILD_GROUP_LABELS } from './portfolioBoardedLoanRecordCompleteness';
import { EXISTING_LOAN_CHILD_KEYS } from './existingLoanEntryAdapter';

describe('Factory Arc Phase 9 — deriveBoardedLoanRecordCompleteness', () => {
  it('covers exactly the ten real child groups the governed write path can create', () => {
    const c = deriveBoardedLoanRecordCompleteness({});
    expect(c.groups.map((g) => g.key)).toEqual([...EXISTING_LOAN_CHILD_KEYS]);
    for (const g of c.groups) {
      expect(g.label).toBe(CHILD_GROUP_LABELS[g.key]);
    }
  });

  it('a missing count reads as null (failed read), never a fabricated zero', () => {
    const c = deriveBoardedLoanRecordCompleteness({});
    expect(c.groups.every((g) => g.count === null)).toBe(true);
    expect(c.groupsFailedToLoad).toBe(EXISTING_LOAN_CHILD_KEYS.length);
    expect(c.totalRecords).toBe(0);
    expect(c.groupsWithRecords).toBe(0);
    expect(c.groupsWithNoRecords).toBe(0);
  });

  it('sums real counts and classifies groups correctly', () => {
    // Every key not supplied defaults to null (failed-to-load), not zero — only
    // `insurance: 0` is an explicit, confirmed-empty read.
    const c = deriveBoardedLoanRecordCompleteness({
      collateral: 2,
      guarantors: 1,
      insurance: 0,
      ticklers: null,
    });
    expect(c.totalRecords).toBe(3);
    expect(c.groupsWithRecords).toBe(2); // collateral, guarantors
    expect(c.groupsWithNoRecords).toBe(1); // insurance only (an explicit, confirmed 0)
    expect(c.groupsFailedToLoad).toBe(7); // ticklers + the six unspecified groups
  });

  it('is deterministic: identical input yields identical output', () => {
    const input = { collateral: 2, guarantors: 1 };
    expect(deriveBoardedLoanRecordCompleteness(input)).toEqual(deriveBoardedLoanRecordCompleteness(input));
  });
});

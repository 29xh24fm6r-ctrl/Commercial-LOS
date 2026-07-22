import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// bucketByMonth is a pure function, but importing it also pulls in ClosingForecast.tsx's other
// imports (useManagerData), which otherwise chain into the real generated Dataverse SDK. Mock the
// provider so this stays a pure unit test.
vi.mock('./ManagerDataProvider', () => ({
  useManagerData: vi.fn(),
}));

import { bucketByMonth } from './ClosingForecast';
import type { TeamDeal } from './managerQueries';

/**
 * Remediation 2026-07-22 (Workstream H) — pins the date-shift fix: targetCloseDate is a date-only
 * field. Before this fix, a raw `new Date(targetCloseDate)` parsed it as UTC midnight, which for
 * any timezone west of UTC lands on the PRIOR calendar day -- bucketing a deal into the wrong
 * month, or wrongly flagging it "past target close" for a same-day/next-day close. This sandbox's
 * runner is UTC by default (no visible drift), so these tests force America/New_York for the
 * duration of the assertion -- otherwise the bug and the fix are indistinguishable here.
 */

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function deal(over: Partial<TeamDeal> = {}): TeamDeal {
  return {
    id: 'd-1',
    name: 'Acme Term Loan',
    clientName: 'Acme',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    targetCloseDate: undefined,
    stageEntryDate: undefined,
    modifiedOn: undefined,
    assignedBankerId: undefined,
    assignedBankerName: undefined,
    collateralSummary: undefined,
    productType: undefined,
    loanStructure: undefined,
    pricingType: undefined,
    ...over,
  };
}

describe('ClosingForecast.bucketByMonth', () => {
  it('buckets a date-only close date into its real calendar month, not the PRIOR UTC day/month', () => {
    // "now" is mid-July Eastern; the deal closes on the first of next month (August 1).
    const now = new Date(2026, 6, 15); // July 15, 2026, local (Eastern)
    const buckets = bucketByMonth([deal({ targetCloseDate: '2026-08-01' })], now);
    expect(buckets).toHaveLength(1);
    // Before the fix this bucketed to '2026-07' (July 31 Eastern) -- one day/month early.
    expect(buckets[0]!.key).toBe('2026-08');
    expect(buckets[0]!.past).toBe(false);
  });

  it('a close date on the first of the current month is NOT misbucketed into "past"', () => {
    const now = new Date(2026, 6, 15); // July 15, 2026, local (Eastern)
    const buckets = bucketByMonth([deal({ targetCloseDate: '2026-07-01' })], now);
    // Before the fix, UTC midnight July 1 rendered as June 30 Eastern -- before monthStart --
    // and this deal wrongly landed in the "Past target close" bucket.
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.past).toBe(false);
    expect(buckets[0]!.key).toBe('2026-07');
  });

  it('honestly buckets a missing target close date, not fabricated', () => {
    const buckets = bucketByMonth([deal({ targetCloseDate: undefined })]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.label).toBe('No target close date');
  });
});

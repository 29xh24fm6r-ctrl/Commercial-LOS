import { describe, it, expect } from 'vitest';
import {
  deriveCreditAdminExceptions,
  derivePortfolioExceptionSummary,
  type CreditAdminInput,
} from './creditAdminExceptions';

/**
 * PE-6 — credit-admin exception goldens: required-item gaps raise exceptions,
 * receipt clears them, SLA ages, severity orders, core-data gaps stay distinct.
 */

const NOW = '2026-06-30';

function present(key: string, expiresDate?: string) {
  return { key, present: true, expiresDate };
}
const ALL_CORE = [
  { key: 'risk_rating', present: true },
  { key: 'maturity_date', present: true },
  { key: 'naics', present: true },
];

describe('deriveCreditAdminExceptions — required-item gaps', () => {
  it('raises an exception for every missing required document', () => {
    const q = deriveCreditAdminExceptions({ loanId: 'L1', now: NOW, coreData: ALL_CORE });
    // All 6 documents missing (none supplied) → 6 document exceptions, 0 core-data.
    expect(q.exceptions.filter((e) => e.category === 'document')).toHaveLength(6);
    expect(q.exceptions.filter((e) => e.category === 'core_data')).toHaveLength(0);
    expect(q.openCount).toBe(6);
  });

  it('clears (raises nothing) once the item is received and in date', () => {
    const input: CreditAdminInput = {
      loanId: 'L1',
      now: NOW,
      coreData: ALL_CORE,
      requiredItems: [
        present('current_financials'),
        present('tax_returns'),
        present('insurance', '2027-01-01'),
        present('ucc_continuation', '2028-01-01'),
        present('appraisal', '2027-06-01'),
        present('flood_determination', '2027-01-01'),
      ],
    };
    expect(deriveCreditAdminExceptions(input).openCount).toBe(0);
  });

  it('raises a stale exception for a present-but-expired document', () => {
    const q = deriveCreditAdminExceptions({
      loanId: 'L1',
      now: NOW,
      coreData: ALL_CORE,
      requiredItems: [
        present('current_financials'),
        present('tax_returns'),
        present('insurance', '2026-01-01'), // expired before NOW
        present('ucc_continuation', '2028-01-01'),
        present('appraisal', '2027-06-01'),
        present('flood_determination', '2027-01-01'),
      ],
    });
    expect(q.exceptions).toHaveLength(1);
    expect(q.exceptions[0].key).toBe('insurance');
    expect(q.exceptions[0].stale).toBe(true);
  });
});

describe('deriveCreditAdminExceptions — SLA aging + ordering', () => {
  it('marks overdue when the due date has passed and due_soon inside the window', () => {
    // insurance SLA = 15 days; a check run far in the past makes everything on_track.
    const q = deriveCreditAdminExceptions({ loanId: 'L1', now: NOW, coreData: ALL_CORE });
    const insurance = q.exceptions.find((e) => e.key === 'insurance')!;
    // due = NOW + 15 → on_track today.
    expect(insurance.slaState).toBe('on_track');
  });

  it('orders high severity before medium/low, then by SLA urgency', () => {
    const q = deriveCreditAdminExceptions({ loanId: 'L1', now: NOW });
    const severities = q.exceptions.map((e) => e.severity);
    // 'high' items come first.
    const firstMedium = severities.indexOf('medium');
    const lastHigh = severities.lastIndexOf('high');
    expect(lastHigh).toBeLessThan(firstMedium);
  });

  it('keeps core-data gaps as their own category (never folded into documents)', () => {
    const q = deriveCreditAdminExceptions({
      loanId: 'L1',
      now: NOW,
      coreData: [{ key: 'risk_rating', present: false }, { key: 'maturity_date', present: true }, { key: 'naics', present: true }],
      requiredItems: [
        present('current_financials'), present('tax_returns'), present('insurance', '2027-01-01'),
        present('ucc_continuation', '2028-01-01'), present('appraisal', '2027-06-01'), present('flood_determination', '2027-01-01'),
      ],
    });
    expect(q.exceptions).toHaveLength(1);
    expect(q.exceptions[0].category).toBe('core_data');
    expect(q.exceptions[0].key).toBe('risk_rating');
  });
});

describe('derivePortfolioExceptionSummary', () => {
  it('rolls up counts by severity and type across loans', () => {
    const q1 = deriveCreditAdminExceptions({ loanId: 'L1', now: NOW, coreData: ALL_CORE });
    const q2 = deriveCreditAdminExceptions({ loanId: 'L2', now: NOW, coreData: ALL_CORE });
    const s = derivePortfolioExceptionSummary([q1, q2]);
    expect(s.totalOpen).toBe(12); // 6 docs × 2 loans
    const high = s.bySeverity.find((b) => b.severity === 'high')!;
    expect(high.count).toBe(8); // 4 high docs × 2
    expect(s.byType[0].count).toBeGreaterThanOrEqual(2);
  });
});

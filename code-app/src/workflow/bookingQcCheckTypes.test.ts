import { describe, it, expect } from 'vitest';
import { evaluateBookingQcReadiness, type BookingQcCheckRecord } from './bookingQcCheckTypes';

function record(overrides: Partial<BookingQcCheckRecord> = {}): BookingQcCheckRecord {
  return {
    checkId: 'qc-1',
    dealId: 'deal-1',
    status: 'PASSED',
    notes: 'Booking package reviewed; all fields match executed documents.',
    reviewedByActorEmail: 'loanops@bank.test',
    reviewedAtIso: '2026-07-24T10:00:00.000Z',
    correlationId: 'qc-corr-1',
    supersedesCheckId: undefined,
    ...overrides,
  };
}

describe('evaluateBookingQcReadiness', () => {
  it('fails closed (not met) when there are no checks at all', () => {
    const r = evaluateBookingQcReadiness(undefined, 'deal-1');
    expect(r.bookingQcComplete.met).toBe(false);
    expect(r.currentCheck).toBeUndefined();
  });

  it('fails closed when the only check is for a DIFFERENT deal', () => {
    const r = evaluateBookingQcReadiness([record({ dealId: 'other-deal' })], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(false);
  });

  it('is met when PASSED', () => {
    const r = evaluateBookingQcReadiness([record()], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(true);
    expect(r.currentCheck?.checkId).toBe('qc-1');
  });

  it('is met when WAIVED', () => {
    const r = evaluateBookingQcReadiness([record({ status: 'WAIVED', notes: 'Waived per manager approval.' })], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(true);
  });

  it('is NOT met when FAILED', () => {
    const r = evaluateBookingQcReadiness([record({ status: 'FAILED', notes: 'Mismatch found in booking amount.' })], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(false);
  });

  it('resolves the head of the chain via supersedesCheckId, not timestamp, when a re-check supersedes a FAILED record', () => {
    const failed = record({ checkId: 'qc-1', status: 'FAILED', notes: 'Mismatch found.' });
    const passed = record({
      checkId: 'qc-2',
      status: 'PASSED',
      notes: 'Corrected and re-reviewed.',
      supersedesCheckId: 'qc-1',
      reviewedAtIso: failed.reviewedAtIso,
    });
    const r = evaluateBookingQcReadiness([failed, passed], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(true);
    expect(r.currentCheck?.checkId).toBe('qc-2');
  });

  it('never fabricates a met result from a check belonging to a different deal mixed into the same list', () => {
    const wrongDeal = record({ dealId: 'deal-2' });
    const rightDeal = record({ dealId: 'deal-1', status: 'FAILED' });
    const r = evaluateBookingQcReadiness([wrongDeal, rightDeal], 'deal-1');
    expect(r.bookingQcComplete.met).toBe(false);
  });
});

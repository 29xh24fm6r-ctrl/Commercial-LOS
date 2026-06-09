import { describe, it, expect } from 'vitest';
import { deriveServicingInsuranceTicklerStatus } from './deriveServicingInsuranceTicklerStatus';

/**
 * Phase 142E — insurance / tickler status pins.
 */

const AS_OF = '2026-06-09';

describe('Phase 142E — insurance / tickler status', () => {
  it('accepted unexpired insurance is complete', () => {
    const r = deriveServicingInsuranceTicklerStatus({ insurance: { accepted: true, evidencePresent: true, expirationDate: '2027-01-01' }, asOfDate: AS_OF });
    expect(r.insuranceStatus.status).toBe('complete');
  });

  it('expired insurance is a blocker', () => {
    const r = deriveServicingInsuranceTicklerStatus({ insurance: { accepted: true, evidencePresent: true, expirationDate: '2025-01-01' }, asOfDate: AS_OF });
    expect(r.insuranceStatus.status).toBe('expired');
    expect(r.insuranceStatus.blockers.length).toBeGreaterThan(0);
  });

  it('missing insurance evidence is a blocker', () => {
    const r = deriveServicingInsuranceTicklerStatus({ insurance: { evidencePresent: false }, asOfDate: AS_OF });
    expect(r.insuranceStatus.status).toBe('missing_evidence');
  });

  it('an overdue tickler is attention_required', () => {
    const r = deriveServicingInsuranceTicklerStatus({ ticklers: [{ ticklerId: 'T1', dueDate: '2020-01-01' }], asOfDate: AS_OF });
    expect(r.ticklerStatus.status).toBe('attention_required');
    expect(r.ticklerStatus.overdueTicklers).toContain('T1');
  });

  it('unknown expiration is review_required', () => {
    const r = deriveServicingInsuranceTicklerStatus({ insurance: { accepted: true, evidencePresent: true }, asOfDate: AS_OF });
    expect(r.insuranceStatus.status).toBe('review_required');
  });

  it('creates no task / write / outreach', () => {
    const r = deriveServicingInsuranceTicklerStatus({ ticklers: [{ ticklerId: 'T1', dueDate: '2020-01-01' }], asOfDate: AS_OF });
    expect(JSON.stringify(r)).not.toMatch(/createTask|updateTickler|sendEmail|createRecord/);
  });
});

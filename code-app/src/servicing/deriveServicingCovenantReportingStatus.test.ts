import { describe, it, expect } from 'vitest';
import { deriveServicingCovenantReportingStatus } from './deriveServicingCovenantReportingStatus';

/**
 * Phase 142E — covenant / reporting status pins.
 */

describe('Phase 142E — covenant / reporting status', () => {
  it('passing covenants are healthy', () => {
    expect(deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }] }).status).toBe('healthy');
  });

  it('a failed covenant is exception_active', () => {
    const r = deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'fail' }] });
    expect(r.status).toBe('exception_active');
    expect(r.failingCovenants).toContain('C1');
  });

  it('an unknown covenant is review_required', () => {
    expect(deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'unknown_missing_data' }] }).status).toBe('review_required');
  });

  it('missing reporting docs are missing_evidence', () => {
    expect(deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }], reportingDocsMissing: true }).status).toBe('missing_evidence');
  });

  it('a blocked borrower request is surfaced (no outreach)', () => {
    const r = deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'pass' }], borrowerRequestBlocked: true, borrowerRequestBlockReason: 'do_not_contact' });
    expect(r.blockers.some((b) => b.code === 'borrower_request_blocked')).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/sendEmail|mailto:|sendSms/);
  });

  it('uses no waiver / approval language', () => {
    const r = deriveServicingCovenantReportingStatus({ covenantResults: [{ covenantId: 'C1', status: 'fail' }] });
    expect(JSON.stringify(r)).not.toMatch(/\bwaive\b|grantWaiver|\bapprove\b/i);
  });
});

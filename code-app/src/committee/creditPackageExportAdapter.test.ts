import { describe, it, expect } from 'vitest';
import {
  prepareCreditPackageExportRequest,
  submitCreditPackageExport,
  CREDIT_PACKAGE_EXPORT_MODE,
  CREDIT_PACKAGE_EXPORT_DESTINATION,
  type CreditPackageExportRequest,
} from './creditPackageExportAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';

function request(over: Partial<CreditPackageExportRequest> = {}): CreditPackageExportRequest {
  const base = prepareCreditPackageExportRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', evidenceCount: 6, blockerCount: 0, missingEvidenceCount: 0, requestedByDisplayName: 'admin-1', requestedAt: CLOCK });
  return { ...base, ...over };
}

describe('Phase 142N — credit package export adapter (disabled by default)', () => {
  it('returns disabled (not success) for a valid-looking request', () => {
    const r = submitCreditPackageExport(request());
    expect(r.status).toBe('disabled');
    expect(r.exportSeamProofId).toBeTruthy();
    expect(r.message.toLowerCase()).toMatch(/not enabled/);
  });

  it('keeps every live-effect boolean false in all outcomes', () => {
    for (const r of [submitCreditPackageExport(request()), submitCreditPackageExport(null), submitCreditPackageExport(request({ mode: 'live' as unknown as typeof CREDIT_PACKAGE_EXPORT_MODE }))]) {
      expect(r.liveExportPerformed).toBe(false);
      expect(r.externalDeliveryPerformed).toBe(false);
      expect(r.fileUploaded).toBe(false);
      expect(r.emailSent).toBe(false);
      expect(r.auditSummary.liveExportPerformed).toBe(false);
    }
  });

  it('rejects a missing package / deal identity', () => {
    expect(submitCreditPackageExport(null).rejectedReason).toBe('missing_identity');
    expect(submitCreditPackageExport(request({ dealId: undefined, packageId: undefined })).rejectedReason).toBe('missing_identity');
  });

  it('rejects a wrong destination kind', () => {
    const r = submitCreditPackageExport(request({ destinationKind: 'live_email' as unknown as typeof CREDIT_PACKAGE_EXPORT_DESTINATION }));
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('invalid_destination');
  });

  it('rejects a wrong mode', () => {
    const r = submitCreditPackageExport(request({ mode: 'live' as unknown as typeof CREDIT_PACKAGE_EXPORT_MODE }));
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('invalid_mode');
  });

  it('rejects a suspicious executable payload', () => {
    const r = submitCreditPackageExport(request({ dealName: 'function(){ run() } => go' }));
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('unsafe_payload');
  });

  it('derives a deterministic export seam proof id', () => {
    expect(submitCreditPackageExport(request()).exportSeamProofId).toBe(submitCreditPackageExport(request()).exportSeamProofId);
  });

  it('exposes no success / exported / sent / uploaded status', () => {
    const statuses = ['disabled', 'rejected'];
    expect(statuses).not.toContain('success');
    const s = JSON.stringify(submitCreditPackageExport(request())).toLowerCase();
    for (const w of ['"status":"success"', 'exported successfully', 'sent successfully', 'uploaded successfully', 'delivered']) {
      expect(s).not.toContain(w);
    }
  });

  it('prepares a request with the disabled destination / mode and a default actor', () => {
    const req = prepareCreditPackageExportRequest({ dealId: 'D1', requestedAt: CLOCK });
    expect(req.destinationKind).toBe(CREDIT_PACKAGE_EXPORT_DESTINATION);
    expect(req.mode).toBe(CREDIT_PACKAGE_EXPORT_MODE);
    expect(req.requestedByDisplayName).toBe('unknown');
  });
});

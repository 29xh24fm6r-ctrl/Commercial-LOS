import { describe, it, expect } from 'vitest';
import {
  prepareESignEnvelopeRequest,
  submitESignEnvelope,
  ESIGN_PROVIDER,
  ESIGN_ENVELOPE_MODE,
  ESIGN_ENVELOPE_DESTINATION,
  type ESignEnvelopeRequest,
} from './eSignEnvelopeAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';

function request(over: Partial<ESignEnvelopeRequest> = {}): ESignEnvelopeRequest {
  const base = prepareESignEnvelopeRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', documentLabel: 'Credit package', signerCount: 2, signerLabels: ['Borrower', 'Guarantor'], requestedByDisplayName: 'admin-1', requestedAt: CLOCK });
  return { ...base, ...over };
}

describe('Phase 142O — PandaDoc e-sign envelope adapter (disabled by default)', () => {
  it('returns disabled (not success) for a valid-looking request', () => {
    const r = submitESignEnvelope(request());
    expect(r.status).toBe('disabled');
    expect(r.provider).toBe('pandadoc');
    expect(r.envelopeSeamProofId).toBeTruthy();
    expect(r.message.toLowerCase()).toMatch(/not enabled/);
  });

  it('keeps every live-effect boolean false in all outcomes', () => {
    for (const r of [submitESignEnvelope(request()), submitESignEnvelope(null), submitESignEnvelope(request({ provider: 'docusign' as unknown as typeof ESIGN_PROVIDER }))]) {
      expect(r.liveEnvelopeCreated).toBe(false);
      expect(r.documentUploaded).toBe(false);
      expect(r.recipientEmailSent).toBe(false);
      expect(r.webhookRegistered).toBe(false);
      expect(r.externalDeliveryPerformed).toBe(false);
    }
  });

  it('rejects a missing deal / package identity', () => {
    expect(submitESignEnvelope(null).rejectedReason).toBe('missing_identity');
    expect(submitESignEnvelope(request({ dealId: undefined, packageId: undefined })).rejectedReason).toBe('missing_identity');
  });

  it('rejects a wrong provider', () => {
    const r = submitESignEnvelope(request({ provider: 'docusign' as unknown as typeof ESIGN_PROVIDER }));
    expect(r.status).toBe('rejected');
    expect(r.rejectedReason).toBe('invalid_provider');
  });

  it('rejects a wrong mode', () => {
    expect(submitESignEnvelope(request({ mode: 'live' as unknown as typeof ESIGN_ENVELOPE_MODE })).rejectedReason).toBe('invalid_mode');
  });

  it('rejects a wrong destination kind', () => {
    expect(submitESignEnvelope(request({ destinationKind: 'live_pandadoc' as unknown as typeof ESIGN_ENVELOPE_DESTINATION })).rejectedReason).toBe('invalid_destination');
  });

  it('rejects a suspicious executable payload or raw email address', () => {
    expect(submitESignEnvelope(request({ dealName: 'function(){ run() } => go' })).rejectedReason).toBe('unsafe_payload');
    expect(submitESignEnvelope(request({ signerLabels: ['borrower@example.com'] })).rejectedReason).toBe('unsafe_payload');
  });

  it('derives a deterministic envelope seam proof id that is not a real PandaDoc id', () => {
    const id = submitESignEnvelope(request()).envelopeSeamProofId;
    expect(id).toBe(submitESignEnvelope(request()).envelopeSeamProofId);
    expect(id).toMatch(/^esign_seam_disabled_/);
  });

  it('exposes no success / sent / created / uploaded / delivered status', () => {
    expect(['disabled', 'rejected']).not.toContain('success');
    const s = JSON.stringify(submitESignEnvelope(request())).toLowerCase();
    for (const w of ['"status":"sent"', '"status":"created"', 'sent for signature', 'envelope created successfully', 'delivered successfully']) {
      expect(s).not.toContain(w);
    }
  });

  it('represents PandaDoc only as disabled provider metadata, with fixed mode/destination', () => {
    const req = prepareESignEnvelopeRequest({ dealId: 'D1', requestedAt: CLOCK });
    expect(req.provider).toBe(ESIGN_PROVIDER);
    expect(req.mode).toBe(ESIGN_ENVELOPE_MODE);
    expect(req.destinationKind).toBe(ESIGN_ENVELOPE_DESTINATION);
    expect(req.requestedByDisplayName).toBe('unknown');
  });
});

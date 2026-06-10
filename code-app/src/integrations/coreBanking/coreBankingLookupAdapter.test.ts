import { describe, it, expect } from 'vitest';
import {
  prepareCoreBankingLookupRequest,
  submitCoreBankingLookup,
  CORE_BANKING_PROVIDER,
  CORE_BANKING_LOOKUP_MODE,
  type CoreBankingLookupRequest,
} from './coreBankingLookupAdapter';

const CLOCK = '2026-06-10T00:00:00.000Z';

function request(over: Partial<CoreBankingLookupRequest> = {}): CoreBankingLookupRequest {
  const base = prepareCoreBankingLookupRequest({ dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower', lookupKind: 'borrower_relationship', requestedByDisplayName: 'admin-1', requestedAt: CLOCK });
  return { ...base, ...over };
}

describe('Phase 142P — core banking read-only lookup adapter (disabled by default)', () => {
  it('returns disabled (not success) for a valid-looking request', () => {
    const r = submitCoreBankingLookup(request());
    expect(r.status).toBe('disabled');
    expect(r.provider).toBe('core_banking');
    expect(r.lookupSeamProofId).toBeTruthy();
    expect(r.message.toLowerCase()).toMatch(/not enabled/);
  });

  it('keeps every retrieval boolean false in all outcomes', () => {
    for (const r of [submitCoreBankingLookup(request()), submitCoreBankingLookup(null), submitCoreBankingLookup(request({ provider: 'fiserv' as unknown as typeof CORE_BANKING_PROVIDER }))]) {
      expect(r.liveLookupPerformed).toBe(false);
      expect(r.customerDataRetrieved).toBe(false);
      expect(r.accountDataRetrieved).toBe(false);
      expect(r.balanceDataRetrieved).toBe(false);
      expect(r.transactionDataRetrieved).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
    }
  });

  it('rejects a missing deal identity', () => {
    expect(submitCoreBankingLookup(null).rejectedReason).toBe('missing_identity');
    expect(submitCoreBankingLookup(request({ dealId: undefined })).rejectedReason).toBe('missing_identity');
  });

  it('rejects a wrong provider', () => {
    expect(submitCoreBankingLookup(request({ provider: 'fiserv' as unknown as typeof CORE_BANKING_PROVIDER })).rejectedReason).toBe('invalid_provider');
  });

  it('rejects a wrong mode', () => {
    expect(submitCoreBankingLookup(request({ mode: 'live' as unknown as typeof CORE_BANKING_LOOKUP_MODE })).rejectedReason).toBe('invalid_mode');
  });

  it('rejects an unsupported lookup kind', () => {
    expect(submitCoreBankingLookup(request({ lookupKind: 'wire_transfer' as unknown as CoreBankingLookupRequest['lookupKind'] })).rejectedReason).toBe('unsupported_lookup_kind');
  });

  it('rejects a request carrying a sensitive identifier field', () => {
    const withSsn = { ...request(), ssn: '000-00-0000' } as unknown as CoreBankingLookupRequest;
    expect(submitCoreBankingLookup(withSsn).rejectedReason).toBe('sensitive_identifier_present');
    const withAccount = { ...request(), accountNumber: '12345678' } as unknown as CoreBankingLookupRequest;
    expect(submitCoreBankingLookup(withAccount).rejectedReason).toBe('sensitive_identifier_present');
  });

  it('rejects a suspicious executable payload', () => {
    expect(submitCoreBankingLookup(request({ dealName: 'function(){ run() } => go' })).rejectedReason).toBe('unsafe_payload');
  });

  it('derives a deterministic lookup seam proof id that is not a real core id', () => {
    const id = submitCoreBankingLookup(request()).lookupSeamProofId;
    expect(id).toBe(submitCoreBankingLookup(request()).lookupSeamProofId);
    expect(id).toMatch(/^core_lookup_seam_disabled_/);
  });

  it('exposes no success / found / matched / retrieved / verified status', () => {
    expect(['disabled', 'rejected']).not.toContain('success');
    const s = JSON.stringify(submitCoreBankingLookup(request())).toLowerCase();
    for (const w of ['"status":"found"', '"status":"matched"', 'core match found', 'customer retrieved', 'verified successfully']) {
      expect(s).not.toContain(w);
    }
  });

  it('represents core banking only as disabled provider metadata with fixed mode', () => {
    const req = prepareCoreBankingLookupRequest({ dealId: 'D1', requestedAt: CLOCK });
    expect(req.provider).toBe(CORE_BANKING_PROVIDER);
    expect(req.mode).toBe(CORE_BANKING_LOOKUP_MODE);
    expect(req.lookupKind).toBe('disabled_placeholder');
    expect(req.requestedByDisplayName).toBe('unknown');
  });
});

import { describe, it, expect } from 'vitest';
import {
  evaluateAmlKycCreditBureauPolicyGate,
  POLICY_GATE_LIVE_PULL_MODE,
  type AmlKycCreditBureauPolicyGateInput,
  type PolicyGateDomain,
} from './amlKycCreditBureauPolicyGate';

const CLOCK = '2026-06-10T00:00:00.000Z';

function input(over: Partial<AmlKycCreditBureauPolicyGateInput> = {}): AmlKycCreditBureauPolicyGateInput {
  return {
    dealId: 'D1', dealName: 'Deal One', clientName: 'Client A', borrowerLabel: 'Primary borrower',
    requestedByDisplayName: 'admin-1', requestedAt: CLOCK,
    requestedPolicyDomains: ['aml_kyc'], purposeLabel: 'credit_package_review',
    livePullMode: POLICY_GATE_LIVE_PULL_MODE, ...over,
  };
}

describe('Phase 142Q — AML/KYC and credit bureau policy gate (no live pull)', () => {
  it('blocks (no live pull) when the provider is not configured', () => {
    const r = evaluateAmlKycCreditBureauPolicyGate(input({ providerConfigured: false }));
    expect(r.status).toBe('blocked_no_live_pull');
    expect(r.allowedForLivePullNow).toBe(false);
    expect(r.policyGateProofId).toBeTruthy();
  });

  it('keeps every provider/retrieval/change flag false in all outcomes', () => {
    for (const r of [evaluateAmlKycCreditBureauPolicyGate(input()), evaluateAmlKycCreditBureauPolicyGate(null), evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: ['credit_bureau'] }))]) {
      expect(r.livePullPerformed).toBe(false);
      expect(r.amlKycProviderCalled).toBe(false);
      expect(r.ofacProviderCalled).toBe(false);
      expect(r.fraudIdentityProviderCalled).toBe(false);
      expect(r.creditBureauProviderCalled).toBe(false);
      expect(r.reportRetrieved).toBe(false);
      expect(r.scoreRetrieved).toBe(false);
      expect(r.externalSystemChanged).toBe(false);
      expect(r.allowedForLivePullNow).toBe(false);
    }
  });

  it('rejects a missing deal identity', () => {
    expect(evaluateAmlKycCreditBureauPolicyGate(null).rejectedReason).toBe('missing_identity');
    expect(evaluateAmlKycCreditBureauPolicyGate(input({ dealId: undefined })).rejectedReason).toBe('missing_identity');
  });

  it('rejects an unsupported or empty domain set', () => {
    expect(evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: [] })).rejectedReason).toBe('unsupported_domain');
    expect(evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: ['payday_lookup' as unknown as PolicyGateDomain] })).rejectedReason).toBe('unsupported_domain');
  });

  it('rejects a wrong live pull mode', () => {
    expect(evaluateAmlKycCreditBureauPolicyGate(input({ livePullMode: 'live' as unknown as typeof POLICY_GATE_LIVE_PULL_MODE })).rejectedReason).toBe('invalid_live_pull_mode');
  });

  it('rejects a request carrying a sensitive identifier field', () => {
    const withSsn = { ...input(), ssn: '000-00-0000' } as unknown as AmlKycCreditBureauPolicyGateInput;
    expect(evaluateAmlKycCreditBureauPolicyGate(withSsn).rejectedReason).toBe('sensitive_identifier_present');
    const withScore = { ...input(), creditScore: 720 } as unknown as AmlKycCreditBureauPolicyGateInput;
    expect(evaluateAmlKycCreditBureauPolicyGate(withScore).rejectedReason).toBe('sensitive_identifier_present');
  });

  it('rejects a suspicious executable payload', () => {
    expect(evaluateAmlKycCreditBureauPolicyGate(input({ dealName: 'function(){ run() } => go' })).rejectedReason).toBe('unsafe_payload');
  });

  it('keeps live pull disallowed even when the provider is configured', () => {
    const r = evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: ['disabled_placeholder'], providerConfigured: true }));
    expect(r.allowedForLivePullNow).toBe(false);
    expect(r.livePullPerformed).toBe(false);
  });

  it('adds blockers/warnings for a credit bureau request missing consent / permissible purpose', () => {
    const r = evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: ['credit_bureau'], consentStatus: 'not_collected', permissiblePurposeStatus: 'not_documented' }));
    expect(r.blockers.some((b) => b.code === 'permissible_purpose_not_documented')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'borrower_consent_missing')).toBe(true);
    expect(r.creditBureauProviderCalled).toBe(false);
  });

  it('can be ready_for_future_configuration with documented prerequisites but still no live pull', () => {
    const r = evaluateAmlKycCreditBureauPolicyGate(input({ requestedPolicyDomains: ['disabled_placeholder'], providerConfigured: true }));
    expect(r.status).toBe('ready_for_future_configuration');
    expect(r.allowedForLivePullNow).toBe(false);
    expect(r.livePullPerformed).toBe(false);
  });

  it('derives a deterministic policy gate proof id that is not a provider report id', () => {
    const id = evaluateAmlKycCreditBureauPolicyGate(input()).policyGateProofId;
    expect(id).toBe(evaluateAmlKycCreditBureauPolicyGate(input()).policyGateProofId);
    expect(id).toMatch(/^policy_gate_no_live_pull_/);
  });

  it('exposes no success / clear / verified / no_match / score_found status', () => {
    expect(['blocked_no_live_pull', 'ready_for_future_configuration', 'rejected']).not.toContain('clear');
    const s = JSON.stringify(evaluateAmlKycCreditBureauPolicyGate(input())).toLowerCase();
    for (const w of ['"status":"clear"', '"status":"verified"', 'ofac no match', 'bureau score found', 'aml clear', 'kyc approved']) {
      expect(s).not.toContain(w);
    }
  });
});

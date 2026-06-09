import { describe, it, expect } from 'vitest';
import {
  createDisabledIntegrationAdapter,
  createDisabledAmlKycAdapter,
  createDisabledCreditBureauAdapter,
  createDisabledCreditScoringAdapter,
  createDisabledCoreBankingAdapter,
  createDisabledServicingSystemAdapter,
  createDisabledDocumentProviderAdapter,
  createDisabledESignatureAdapter,
  createDisabledVendorStatusAdapter,
} from './createDisabledIntegrationAdapters';
import { INTEGRATION_PROVIDER_REGISTRY, getIntegrationProvider } from './integrationProviderRegistry';
import type { IntegrationAdapterDefinition } from './integrationAdapterTypes';

const bureau = getIntegrationProvider('credit_bureau_provider') as IntegrationAdapterDefinition;
const core = getIntegrationProvider('core_banking_provider') as IntegrationAdapterDefinition;
const scoring = getIntegrationProvider('credit_scoring_provider') as IntegrationAdapterDefinition;
const aml = getIntegrationProvider('aml_kyc_provider') as IntegrationAdapterDefinition;
const esign = getIntegrationProvider('e_signature_provider') as IntegrationAdapterDefinition;

const FORBIDDEN_METHODS = ['approveCredit', 'declineCredit', 'waiveCovenant', 'postPayment', 'disburseFunds', 'createCoreAccount', 'sendEnvelope', 'submitEnvelope', 'pullCredit'];

describe('Phase 142F — disabled integration adapter factory', () => {
  it('every registry provider yields a disabled adapter that blocks attemptRequest', () => {
    for (const def of INTEGRATION_PROVIDER_REGISTRY) {
      const adapter = createDisabledIntegrationAdapter(def);
      expect(adapter.getStatus().status).toBe('disabled');
      expect(adapter.getStatus().live).toBe(false);
      const result = adapter.attemptRequest({ providerKey: def.providerKey, capability: def.capabilities[0].capability });
      expect(result.outcome).toBe('blocked');
      expect(result.allowed).toBe(false);
    }
  });

  it('every typed factory returns a disabled adapter', () => {
    expect(createDisabledAmlKycAdapter(aml).getStatus().status).toBe('disabled');
    expect(createDisabledCreditBureauAdapter(bureau).getStatus().status).toBe('disabled');
    expect(createDisabledCreditScoringAdapter(scoring).getStatus().status).toBe('disabled');
    expect(createDisabledCoreBankingAdapter(core).getStatus().status).toBe('disabled');
    expect(createDisabledServicingSystemAdapter(getIntegrationProvider('servicing_system_provider') as IntegrationAdapterDefinition).getStatus().status).toBe('disabled');
    expect(createDisabledDocumentProviderAdapter(getIntegrationProvider('document_provider') as IntegrationAdapterDefinition).getStatus().status).toBe('disabled');
    expect(createDisabledESignatureAdapter(esign).getStatus().status).toBe('disabled');
    expect(createDisabledVendorStatusAdapter(getIntegrationProvider('title_provider') as IntegrationAdapterDefinition).getStatus().status).toBe('disabled');
  });

  it('previewRequest returns a safe, PII-free preview', () => {
    const adapter = createDisabledIntegrationAdapter(bureau);
    const preview = adapter.previewRequest({ providerKey: bureau.providerKey, capability: 'retrieve_credit_report_summary', subjectRef: 'deal-123' });
    expect(preview.outcome).toBe('preview_only');
    expect(preview.safeRequestSummary?.containsPii).toBe(false);
    expect(preview.safeRequestSummary?.subjectRefPresent).toBe(true);
    // The raw subjectRef is never echoed into the preview.
    expect(JSON.stringify(preview)).not.toContain('deal-123');
  });

  it('exposes none of the forbidden execution methods', () => {
    const adapter = createDisabledIntegrationAdapter(core);
    for (const m of FORBIDDEN_METHODS) {
      expect((adapter as unknown as Record<string, unknown>)[m]).toBeUndefined();
    }
  });

  it('blocks the credit bureau without approval / permissible purpose', () => {
    const result = createDisabledCreditBureauAdapter(bureau).attemptRequest({ providerKey: bureau.providerKey, capability: 'request_business_credit_report' });
    expect(result.allowed).toBe(false);
    expect(result.outcome).toBe('blocked');
  });

  it('keeps scoring from producing an approval / decline', () => {
    const result = createDisabledCreditScoringAdapter(scoring).attemptRequest({ providerKey: scoring.providerKey, capability: 'score_deal' });
    expect(result.allowed).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/approved|declined|finalDecision/i);
  });

  it('keeps core banking from writing / posting / disbursing', () => {
    const adapter = createDisabledCoreBankingAdapter(core);
    const result = adapter.attemptRequest({ providerKey: core.providerKey, capability: 'lookup_balance' });
    expect(result.auditSummary.containsWrite).toBe(false);
    expect(result.auditSummary.containsLiveCall).toBe(false);
  });

  it('puts no PII / live-call flags into any audit summary', () => {
    for (const def of INTEGRATION_PROVIDER_REGISTRY) {
      const adapter = createDisabledIntegrationAdapter(def);
      const r = adapter.attemptRequest({ providerKey: def.providerKey, capability: def.capabilities[0].capability });
      expect(r.auditSummary.containsPiiTransmission).toBe(false);
      expect(r.auditSummary.containsCreditPull).toBe(false);
      expect(r.readOnly).toBe(true);
    }
  });
});

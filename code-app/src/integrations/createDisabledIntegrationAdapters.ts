/**
 * Phase 142F — Disabled integration adapter factory.
 *
 * Produces honest, DISABLED adapters. There is NO fetch, NO network, NO SDK, NO
 * write, NO PII transmission. `getStatus`/`getReadiness` report disabled truth;
 * `previewRequest` returns a safe, redacted metadata preview (no PII);
 * `attemptRequest` ALWAYS blocks — no external call is ever made.
 */

import type {
  AmlKycAdapter,
  CoreBankingAdapter,
  CreditBureauAdapter,
  CreditScoringAdapter,
  DocumentProviderAdapter,
  ESignatureAdapter,
  IntegrationAdapter,
  ServicingSystemAdapter,
  VendorStatusAdapter,
} from './integrationAdapterContracts';
import type {
  IntegrationAdapterDefinition,
  IntegrationAdapterRequest,
  IntegrationAdapterResult,
  IntegrationAdapterStatus,
} from './integrationAdapterTypes';
import { validateIntegrationRequest } from './validateIntegrationRequest';

function disabledStatus(def: IntegrationAdapterDefinition): IntegrationAdapterStatus {
  return {
    providerKey: def.providerKey,
    category: def.category,
    mode: 'disabled',
    status: 'disabled',
    enabled: false,
    live: false,
    message: `${def.displayName} is disabled — no external transport is configured and no call occurs.`,
  };
}

function safePreview(def: IntegrationAdapterDefinition, request: IntegrationAdapterRequest): IntegrationAdapterResult {
  const capability = def.capabilities.find((c) => c.capability === request.capability);
  return {
    providerKey: def.providerKey,
    capability: request.capability,
    outcome: 'preview_only',
    allowed: false,
    blockers: [{ code: 'integration_disabled', message: `${def.displayName} is disabled; this is a preview only.` }],
    warnings: [],
    safeRequestSummary: {
      providerKey: def.providerKey,
      capability: request.capability,
      dataSensitivity: capability?.dataSensitivity,
      subjectRefPresent: request.subjectRef !== undefined,
      purposePresent: request.purpose !== undefined,
      containsPii: false,
    },
    auditSummary: {
      providerKey: def.providerKey,
      capability: request.capability,
      outcome: 'preview_only',
      containsLiveCall: false,
      containsPiiTransmission: false,
      containsCreditPull: false,
      containsWrite: false,
      readOnly: true,
    },
    readOnly: true,
  };
}

function blockedAttempt(def: IntegrationAdapterDefinition, request: IntegrationAdapterRequest): IntegrationAdapterResult {
  const readiness = validateIntegrationRequest({ provider: def, request, mode: 'disabled' });
  return {
    providerKey: def.providerKey,
    capability: request.capability,
    outcome: 'blocked',
    allowed: false,
    errorCode: readiness.blockers[0]?.code ?? 'integration_disabled',
    blockers: readiness.blockers,
    warnings: readiness.warnings,
    auditSummary: {
      providerKey: def.providerKey,
      capability: request.capability,
      outcome: 'blocked',
      containsLiveCall: false,
      containsPiiTransmission: false,
      containsCreditPull: false,
      containsWrite: false,
      readOnly: true,
    },
    readOnly: true,
  };
}

export function createDisabledIntegrationAdapter(def: IntegrationAdapterDefinition): IntegrationAdapter {
  return {
    providerKey: def.providerKey,
    category: def.category,
    definition: def,
    getStatus: () => disabledStatus(def),
    getReadiness: (request) => validateIntegrationRequest({ provider: def, request, mode: 'disabled' }),
    previewRequest: (request) => safePreview(def, request),
    attemptRequest: (request) => blockedAttempt(def, request),
  };
}

// ── Category-typed convenience factories (all return disabled adapters) ──────
export function createDisabledAmlKycAdapter(def: IntegrationAdapterDefinition): AmlKycAdapter {
  return createDisabledIntegrationAdapter(def) as AmlKycAdapter;
}
export function createDisabledCreditBureauAdapter(def: IntegrationAdapterDefinition): CreditBureauAdapter {
  return createDisabledIntegrationAdapter(def) as CreditBureauAdapter;
}
export function createDisabledCreditScoringAdapter(def: IntegrationAdapterDefinition): CreditScoringAdapter {
  return createDisabledIntegrationAdapter(def) as CreditScoringAdapter;
}
export function createDisabledCoreBankingAdapter(def: IntegrationAdapterDefinition): CoreBankingAdapter {
  return createDisabledIntegrationAdapter(def) as CoreBankingAdapter;
}
export function createDisabledServicingSystemAdapter(def: IntegrationAdapterDefinition): ServicingSystemAdapter {
  return createDisabledIntegrationAdapter(def) as ServicingSystemAdapter;
}
export function createDisabledDocumentProviderAdapter(def: IntegrationAdapterDefinition): DocumentProviderAdapter {
  return createDisabledIntegrationAdapter(def) as DocumentProviderAdapter;
}
export function createDisabledESignatureAdapter(def: IntegrationAdapterDefinition): ESignatureAdapter {
  return createDisabledIntegrationAdapter(def) as ESignatureAdapter;
}
export function createDisabledVendorStatusAdapter(def: IntegrationAdapterDefinition): VendorStatusAdapter {
  return createDisabledIntegrationAdapter(def) as VendorStatusAdapter;
}

/**
 * Phase 142F — Integration adapter contracts (interfaces only).
 *
 * Generic + per-category adapter seams. Every adapter exposes exactly four
 * methods: getStatus / getReadiness / previewRequest / attemptRequest. There is
 * NO approveCredit, declineCredit, waiveCovenant, postPayment, disburseFunds,
 * createCoreAccount, sendEnvelope/submitEnvelope, or live pullCredit method —
 * any external attempt flows through the gated `attemptRequest`, which a disabled
 * adapter always blocks. No method performs a direct external provider call.
 */

import type {
  IntegrationAdapterDefinition,
  IntegrationAdapterReadiness,
  IntegrationAdapterRequest,
  IntegrationAdapterResult,
  IntegrationAdapterStatus,
  IntegrationCategory,
} from './integrationAdapterTypes';

/** Base contract shared by every integration adapter. */
export interface IntegrationAdapter {
  readonly providerKey: IntegrationAdapterDefinition['providerKey'];
  readonly category: IntegrationCategory;
  readonly definition: IntegrationAdapterDefinition;
  /** Current adapter status (disabled in this phase). */
  getStatus(): IntegrationAdapterStatus;
  /** Readiness evaluation for a given request (always blocked while disabled). */
  getReadiness(request: IntegrationAdapterRequest): IntegrationAdapterReadiness;
  /** Safe, redacted preview of what a future request would carry (no execution, no PII). */
  previewRequest(request: IntegrationAdapterRequest): IntegrationAdapterResult;
  /** Gated execution seam — a disabled adapter always blocks; no external call occurs. */
  attemptRequest(request: IntegrationAdapterRequest): IntegrationAdapterResult;
}

/** Category-branded contracts — identical surface, distinct type identity. */
export interface AmlKycAdapter extends IntegrationAdapter {
  readonly category: 'aml_kyc';
}
export interface SanctionsScreeningAdapter extends IntegrationAdapter {
  readonly category: 'sanctions_screening';
}
export interface CreditBureauAdapter extends IntegrationAdapter {
  readonly category: 'credit_bureau';
}
export interface CreditScoringAdapter extends IntegrationAdapter {
  readonly category: 'credit_scoring';
}
export interface CoreBankingAdapter extends IntegrationAdapter {
  readonly category: 'core_banking';
}
export interface ServicingSystemAdapter extends IntegrationAdapter {
  readonly category: 'servicing_system';
}
export interface DocumentProviderAdapter extends IntegrationAdapter {
  readonly category: 'document_provider';
}
export interface ESignatureAdapter extends IntegrationAdapter {
  readonly category: 'e_signature';
}
export interface CollateralVerificationAdapter extends IntegrationAdapter {
  readonly category: 'collateral_verification';
}
export interface InsuranceVerificationAdapter extends IntegrationAdapter {
  readonly category: 'insurance_verification';
}
/** Generic vendor-status adapter for appraisal / environmental / title / flood / UCC / tax / etc. */
export interface VendorStatusAdapter extends IntegrationAdapter {}

/**
 * Phase 142F — Integration provider registry (constants only).
 *
 * Registers provider CATEGORIES, not hardwired vendor implementations. Every
 * provider is `disabled` by default, declares its risk class, data sensitivity,
 * permission and human-approval requirements, and carries a read-only audit
 * summary. There are NO vendor SDK imports, NO external URLs, NO secrets/tokens,
 * NO fetch, NO live calls, and NO final credit decision.
 */

import type {
  IntegrationAdapterDefinition,
  IntegrationAdapterMode,
  IntegrationCapability,
  IntegrationCapabilityDefinition,
  IntegrationCategory,
  IntegrationDataSensitivity,
  IntegrationHumanApprovalRequirement,
  IntegrationPermissionRequirement,
  IntegrationProviderKey,
  IntegrationRiskClass,
} from './integrationAdapterTypes';
import { DEFAULT_INTEGRATION_ADAPTER_MODE } from './integrationAdapterTypes';

function cap(
  capability: IntegrationCapability,
  label: string,
  dataSensitivity: IntegrationDataSensitivity,
  externalTransmission = true,
): IntegrationCapabilityDefinition {
  return { capability, label, dataSensitivity, externalTransmission, writeCapable: false };
}

function perm(permissionKey: string, label: string): IntegrationPermissionRequirement {
  return { permissionKey, label };
}

function approval(required: boolean, label: string, approvalKey?: string): IntegrationHumanApprovalRequirement {
  return { required, approvalKey, label };
}

interface ProviderSpec {
  providerKey: IntegrationProviderKey;
  displayName: string;
  category: IntegrationCategory;
  riskClass: IntegrationRiskClass;
  dataSensitivities: readonly IntegrationDataSensitivity[];
  capabilities: readonly IntegrationCapabilityDefinition[];
  permissionRequirements: readonly IntegrationPermissionRequirement[];
  humanApproval: IntegrationHumanApprovalRequirement;
  requiresPermissiblePurpose?: boolean;
  caveats?: readonly string[];
}

function provider(spec: ProviderSpec): IntegrationAdapterDefinition {
  const mode: IntegrationAdapterMode = DEFAULT_INTEGRATION_ADAPTER_MODE; // 'disabled'
  return {
    providerKey: spec.providerKey,
    displayName: spec.displayName,
    category: spec.category,
    mode,
    riskClass: spec.riskClass,
    dataSensitivities: spec.dataSensitivities,
    capabilities: spec.capabilities,
    permissionRequirements: spec.permissionRequirements,
    humanApproval: spec.humanApproval,
    requiresPermissiblePurpose: spec.requiresPermissiblePurpose ?? false,
    canProduceCreditDecision: false,
    caveats: spec.caveats ?? ['Provider is disabled — no external call occurs in this phase.'],
    auditSummary: {
      providerKey: spec.providerKey,
      category: spec.category,
      mode,
      capabilityCount: spec.capabilities.length,
      containsLiveCall: false,
      containsPiiTransmission: false,
      containsCreditPull: false,
      containsWrite: false,
      readOnly: true,
    },
  };
}

export const INTEGRATION_PROVIDER_REGISTRY: readonly IntegrationAdapterDefinition[] = Object.freeze([
  provider({
    providerKey: 'aml_kyc_provider', displayName: 'AML / KYC Provider', category: 'aml_kyc', riskClass: 'high_pii_external',
    dataSensitivities: ['borrower_pii', 'business_financials', 'internal_bank_data'],
    capabilities: [
      cap('screen_business', 'Screen business entity', 'borrower_pii'),
      cap('screen_person', 'Screen person', 'borrower_pii'),
      cap('retrieve_screening_status', 'Retrieve screening status', 'internal_bank_data'),
      cap('attach_screening_evidence', 'Attach screening evidence', 'internal_bank_data', false),
    ],
    permissionRequirements: [perm('integration.aml.use', 'AML/KYC integration use')],
    humanApproval: approval(true, 'AML/KYC run requires explicit human approval', 'aml_run_approval'),
    caveats: ['Sends borrower/person/org PII only in a future, policy-gated mode.'],
  }),
  provider({
    providerKey: 'sanctions_screening_provider', displayName: 'Sanctions Screening Provider', category: 'sanctions_screening', riskClass: 'high_pii_external',
    dataSensitivities: ['borrower_pii', 'internal_bank_data'],
    capabilities: [
      cap('screen_against_sanctions', 'Screen against sanctions / watchlists', 'borrower_pii'),
      cap('retrieve_watchlist_result', 'Retrieve watchlist result', 'internal_bank_data'),
    ],
    permissionRequirements: [perm('integration.sanctions.use', 'Sanctions screening use')],
    humanApproval: approval(true, 'Sanctions screening requires explicit human approval', 'sanctions_run_approval'),
  }),
  provider({
    providerKey: 'credit_bureau_provider', displayName: 'Credit Bureau Provider', category: 'credit_bureau', riskClass: 'high_credit_report_external',
    dataSensitivities: ['borrower_pii', 'credit_report_data'],
    capabilities: [
      cap('request_business_credit_report', 'Request business credit report', 'credit_report_data'),
      cap('request_consumer_credit_report', 'Request consumer credit report', 'credit_report_data'),
      cap('retrieve_credit_report_summary', 'Retrieve credit report summary', 'credit_report_data'),
    ],
    permissionRequirements: [perm('integration.bureau.use', 'Credit bureau use')],
    humanApproval: approval(true, 'Credit bureau pull requires explicit human approval', 'bureau_pull_approval'),
    requiresPermissiblePurpose: true,
    caveats: ['Requires permissible purpose and human approval; no credit is pulled in this phase.'],
  }),
  provider({
    providerKey: 'credit_scoring_provider', displayName: 'Credit Scoring Provider', category: 'credit_scoring', riskClass: 'medium_read_only_external',
    dataSensitivities: ['business_financials', 'internal_bank_data'],
    capabilities: [
      cap('score_deal', 'Score deal (decision support only)', 'business_financials'),
      cap('score_borrower', 'Score borrower (decision support only)', 'business_financials'),
      cap('retrieve_score_explanation', 'Retrieve score explanation', 'internal_bank_data'),
    ],
    permissionRequirements: [perm('integration.scoring.use', 'Credit scoring use')],
    humanApproval: approval(false, 'Scoring is decision support only and cannot approve or decline credit'),
    caveats: ['Decision support only — cannot approve or decline credit.'],
  }),
  provider({
    providerKey: 'core_banking_provider', displayName: 'Core Banking Provider', category: 'core_banking', riskClass: 'high_core_banking_write',
    dataSensitivities: ['internal_bank_data', 'account_balance_data', 'payment_data'],
    capabilities: [
      cap('lookup_customer', 'Lookup customer', 'internal_bank_data'),
      cap('lookup_account', 'Lookup account', 'account_balance_data'),
      cap('lookup_balance', 'Lookup balance', 'account_balance_data'),
      cap('lookup_loan_account', 'Lookup loan account', 'account_balance_data'),
      cap('retrieve_payment_history', 'Retrieve payment history', 'payment_data'),
    ],
    permissionRequirements: [perm('integration.core.use', 'Core banking lookup use')],
    humanApproval: approval(false, 'Read-only metadata lookup only; no core write in this phase'),
    caveats: ['Read-only metadata only in this phase; no core write capability is enabled.'],
  }),
  provider({
    providerKey: 'servicing_system_provider', displayName: 'Servicing System Provider', category: 'servicing_system', riskClass: 'medium_read_only_external',
    dataSensitivities: ['internal_bank_data', 'payment_data'],
    capabilities: [
      cap('lookup_servicing_status', 'Lookup servicing status', 'internal_bank_data'),
      cap('lookup_maturity', 'Lookup maturity', 'internal_bank_data'),
      cap('lookup_ticklers', 'Lookup ticklers', 'internal_bank_data'),
      cap('retrieve_payment_history', 'Retrieve payment history', 'payment_data'),
    ],
    permissionRequirements: [perm('integration.servicing.use', 'Servicing lookup use')],
    humanApproval: approval(false, 'Read-only servicing lookup only'),
  }),
  provider({
    providerKey: 'payment_system_provider', displayName: 'Payment System Provider', category: 'payment_system', riskClass: 'medium_read_only_external',
    dataSensitivities: ['payment_data', 'internal_bank_data'],
    capabilities: [
      cap('payment_status_lookup', 'Payment status lookup', 'payment_data'),
    ],
    permissionRequirements: [perm('integration.payment.use', 'Payment status lookup use')],
    humanApproval: approval(false, 'Status lookup only; no payment posting capability in this phase'),
    caveats: ['No payment posting capability in this phase — status lookup only.'],
  }),
  provider({
    providerKey: 'document_provider', displayName: 'Document Provider', category: 'document_provider', riskClass: 'medium_read_only_external',
    dataSensitivities: ['internal_bank_data'],
    capabilities: [
      cap('retrieve_document_metadata', 'Retrieve document metadata', 'internal_bank_data'),
      cap('retrieve_document_status', 'Retrieve document status', 'internal_bank_data'),
    ],
    permissionRequirements: [perm('integration.document.use', 'Document provider use')],
    humanApproval: approval(false, 'Metadata/status lookup only; no upload link generation in this phase'),
    caveats: ['No upload-link generation in this phase — metadata/status lookup only.'],
  }),
  provider({
    providerKey: 'e_signature_provider', displayName: 'E-Sign Provider', category: 'e_signature', riskClass: 'medium_read_only_external',
    dataSensitivities: ['internal_bank_data', 'borrower_pii'],
    capabilities: [
      cap('prepare_signature_package_preview', 'Prepare signature package preview', 'internal_bank_data', false),
      cap('retrieve_signature_status', 'Retrieve signature status', 'internal_bank_data'),
    ],
    permissionRequirements: [perm('integration.esign.use', 'E-sign provider use')],
    humanApproval: approval(true, 'Envelope preparation requires human approval; no envelope is sent in this phase', 'esign_send_approval'),
    caveats: ['No envelope send in this phase — preview / status only.'],
  }),
  provider({
    providerKey: 'collateral_verification_provider', displayName: 'Collateral Verification Provider', category: 'collateral_verification', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_collateral_status', 'Retrieve collateral status', 'collateral_data')],
    permissionRequirements: [perm('integration.collateral.use', 'Collateral verification use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'insurance_verification_provider', displayName: 'Insurance Verification Provider', category: 'insurance_verification', riskClass: 'medium_read_only_external',
    dataSensitivities: ['insurance_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_insurance_status', 'Retrieve insurance status', 'insurance_data')],
    permissionRequirements: [perm('integration.insurance.use', 'Insurance verification use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'appraisal_provider', displayName: 'Appraisal Vendor', category: 'appraisal', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_appraisal_status', 'Retrieve appraisal status', 'collateral_data')],
    permissionRequirements: [perm('integration.appraisal.use', 'Appraisal vendor use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'environmental_provider', displayName: 'Environmental Vendor', category: 'environmental', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_environmental_status', 'Retrieve environmental status', 'collateral_data')],
    permissionRequirements: [perm('integration.environmental.use', 'Environmental vendor use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'title_provider', displayName: 'Title Vendor', category: 'title', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_title_status', 'Retrieve title status', 'collateral_data')],
    permissionRequirements: [perm('integration.title.use', 'Title vendor use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'flood_provider', displayName: 'Flood Determination Vendor', category: 'flood', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_flood_status', 'Retrieve flood determination status', 'collateral_data')],
    permissionRequirements: [perm('integration.flood.use', 'Flood vendor use')],
    humanApproval: approval(false, 'Status lookup only'),
  }),
  provider({
    providerKey: 'ucc_provider', displayName: 'UCC Search / Filing Vendor', category: 'ucc', riskClass: 'medium_read_only_external',
    dataSensitivities: ['collateral_data', 'internal_bank_data'],
    capabilities: [cap('retrieve_ucc_status', 'Retrieve UCC search status', 'collateral_data')],
    permissionRequirements: [perm('integration.ucc.use', 'UCC vendor use')],
    humanApproval: approval(false, 'Search status lookup only; no filing in this phase'),
    caveats: ['No UCC filing in this phase — search status lookup only.'],
  }),
  provider({
    providerKey: 'tax_transcript_provider', displayName: 'Tax Transcript Provider', category: 'tax_transcript', riskClass: 'high_pii_external',
    dataSensitivities: ['borrower_pii', 'tax_data'],
    capabilities: [cap('retrieve_tax_transcript_status', 'Retrieve tax transcript status', 'tax_data')],
    permissionRequirements: [perm('integration.tax.use', 'Tax transcript use')],
    humanApproval: approval(true, 'Tax transcript retrieval requires human approval and consent', 'tax_transcript_approval'),
    requiresPermissiblePurpose: true,
  }),
  provider({
    providerKey: 'fraud_identity_provider', displayName: 'Fraud / Identity Provider', category: 'fraud_identity', riskClass: 'high_pii_external',
    dataSensitivities: ['borrower_pii', 'internal_bank_data'],
    capabilities: [cap('retrieve_identity_verification_status', 'Retrieve identity verification status', 'internal_bank_data')],
    permissionRequirements: [perm('integration.identity.use', 'Identity verification use')],
    humanApproval: approval(true, 'Identity verification requires human approval', 'identity_verification_approval'),
  }),
  provider({
    providerKey: 'accounting_provider', displayName: 'Accounting Sync Provider', category: 'accounting', riskClass: 'medium_read_only_external',
    dataSensitivities: ['business_financials', 'internal_bank_data'],
    capabilities: [cap('retrieve_accounting_sync_status', 'Retrieve accounting sync status', 'business_financials')],
    permissionRequirements: [perm('integration.accounting.use', 'Accounting sync use')],
    humanApproval: approval(false, 'Read-only sync status only; no accounting entries are posted'),
    caveats: ['No accounting entries are posted in this phase — read-only status only.'],
  }),
  provider({
    providerKey: 'reporting_analytics_provider', displayName: 'Reporting / Analytics Provider', category: 'reporting_analytics', riskClass: 'low_metadata_only',
    dataSensitivities: ['internal_bank_data', 'public_metadata'],
    capabilities: [cap('retrieve_reporting_status', 'Retrieve reporting status', 'internal_bank_data', false)],
    permissionRequirements: [perm('integration.reporting.use', 'Reporting / analytics use')],
    humanApproval: approval(false, 'Read-only reporting status only'),
  }),
]);

export const ALL_INTEGRATION_PROVIDER_KEYS: readonly IntegrationProviderKey[] = Object.freeze(
  INTEGRATION_PROVIDER_REGISTRY.map((p) => p.providerKey),
);

export function getIntegrationProvider(providerKey: string): IntegrationAdapterDefinition | undefined {
  return INTEGRATION_PROVIDER_REGISTRY.find((p) => p.providerKey === providerKey);
}

export function getIntegrationProvidersByCategory(category: IntegrationCategory): readonly IntegrationAdapterDefinition[] {
  return INTEGRATION_PROVIDER_REGISTRY.filter((p) => p.category === category);
}

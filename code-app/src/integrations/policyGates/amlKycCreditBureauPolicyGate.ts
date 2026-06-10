/**
 * Phase 142Q — AML/KYC and credit bureau POLICY GATE (NO LIVE PULL).
 *
 * Defines the policy / readiness boundary that must be satisfied before any
 * FUTURE AML/KYC, OFAC/sanctions, fraud/identity, or credit bureau pull could
 * occur. It calls NO provider, pulls NO report, retrieves NO score/bureau data,
 * stores NO credential, makes NO eligibility/AML/KYC/OFAC/identity decision, and
 * mutates NO state. Every outcome keeps `livePullPerformed`, every
 * `*ProviderCalled`, `reportRetrieved`, `scoreRetrieved`, `externalSystemChanged`,
 * and `allowedForLivePullNow` false. The status union has only
 * `blocked_no_live_pull`, `ready_for_future_configuration`, and `rejected` —
 * there is no clear / verified / approved / no_match / score_found / report_found
 * status. No sensitive identifier (SSN/TIN/DOB/account/bureau report/score) is
 * accepted into this seam. Policy gate only — no live integration.
 */

export const POLICY_GATE_LIVE_PULL_MODE = 'disabled_by_default' as const;

export type PolicyGateDomain =
  | 'aml_kyc'
  | 'ofac_sanctions'
  | 'fraud_identity'
  | 'credit_bureau'
  | 'disabled_placeholder';

export const POLICY_GATE_DOMAINS: readonly PolicyGateDomain[] = Object.freeze([
  'aml_kyc', 'ofac_sanctions', 'fraud_identity', 'credit_bureau', 'disabled_placeholder',
]);

export type PolicyGateConsentStatus = 'not_collected' | 'collected' | 'not_required_for_gate' | 'unknown';
export type PolicyGatePermissiblePurposeStatus = 'not_documented' | 'documented' | 'not_required_for_gate' | 'unknown';

export interface AmlKycCreditBureauPolicyGateInput {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  requestedByDisplayName?: string;
  requestedAt: string;
  requestedPolicyDomains: readonly PolicyGateDomain[];
  purposeLabel?: string;
  consentStatus?: PolicyGateConsentStatus;
  permissiblePurposeStatus?: PolicyGatePermissiblePurposeStatus;
  /** Default false — even when true, no live pull is allowed in this phase. */
  providerConfigured?: boolean;
  livePullMode: typeof POLICY_GATE_LIVE_PULL_MODE;
}

export type PolicyGateStatus = 'blocked_no_live_pull' | 'ready_for_future_configuration' | 'rejected';

export type PolicyGateRejectedReason =
  | 'missing_identity'
  | 'unsupported_domain'
  | 'invalid_live_pull_mode'
  | 'sensitive_identifier_present'
  | 'unsafe_payload';

export interface PolicyGateBlocker {
  code: string;
  message: string;
}

export interface PolicyGateWarning {
  code: string;
  message: string;
}

export interface PolicyGateAuditSummary {
  dealRef: string;
  domainCount: number;
  blockerCount: number;
  warningCount: number;
  /** Pinned false — no live pull / provider call / retrieval / change ever occurs. */
  livePullPerformed: false;
  reportRetrieved: false;
  scoreRetrieved: false;
  externalSystemChanged: false;
  allowedForLivePullNow: false;
  readOnly: true;
}

export interface AmlKycCreditBureauPolicyGateResult {
  status: PolicyGateStatus;
  livePullMode: typeof POLICY_GATE_LIVE_PULL_MODE;
  livePullPerformed: false;
  amlKycProviderCalled: false;
  ofacProviderCalled: false;
  fraudIdentityProviderCalled: false;
  creditBureauProviderCalled: false;
  reportRetrieved: false;
  scoreRetrieved: false;
  externalSystemChanged: false;
  allowedForLivePullNow: false;
  message: string;
  blockers: readonly PolicyGateBlocker[];
  warnings: readonly PolicyGateWarning[];
  rejectedReason?: PolicyGateRejectedReason;
  policyGateProofId?: string;
  auditSummary: PolicyGateAuditSummary;
}

const NO_LIVE_PULL_MESSAGE =
  'AML/KYC, OFAC, fraud/identity, and credit bureau pulls are not enabled. No reports, scores, sanctions results, identity results, or external data are retrieved, and no external system is changed.';

/** Sensitive identifier field keys that must never enter this seam. */
const SENSITIVE_KEYS: readonly string[] = [
  'ssn', 'tin', 'taxid', 'dob', 'dateofbirth', 'accountnumber', 'routingnumber', 'cardnumber', 'fulladdress', 'bureaureportid', 'creditscore',
];

const UNSAFE_RX: readonly RegExp[] = [
  /\bfunction\s*\(|=>|\beval\s*\(|new\s+Function\b|\brequire\s*\(|\bimport\s*\(/,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b/i,
  /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

function isUnsafe(text: string): boolean {
  return UNSAFE_RX.some((rx) => rx.test(text));
}

function deterministicProofId(dealRef: string, domains: readonly PolicyGateDomain[]): string {
  const seed = `${dealRef}|${POLICY_GATE_LIVE_PULL_MODE}|${[...domains].sort().join(',')}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `policy_gate_no_live_pull_${hash.toString(16).padStart(8, '0')}`;
}

function audit(dealRef: string, domainCount: number, blockerCount: number, warningCount: number): PolicyGateAuditSummary {
  return {
    dealRef,
    domainCount,
    blockerCount,
    warningCount,
    livePullPerformed: false,
    reportRetrieved: false,
    scoreRetrieved: false,
    externalSystemChanged: false,
    allowedForLivePullNow: false,
    readOnly: true,
  };
}

function baseResult(
  status: PolicyGateStatus,
  dealRef: string,
  domains: readonly PolicyGateDomain[],
  blockers: readonly PolicyGateBlocker[],
  warnings: readonly PolicyGateWarning[],
  extra: { rejectedReason?: PolicyGateRejectedReason; message: string; withProof: boolean },
): AmlKycCreditBureauPolicyGateResult {
  return {
    status,
    livePullMode: POLICY_GATE_LIVE_PULL_MODE,
    livePullPerformed: false,
    amlKycProviderCalled: false,
    ofacProviderCalled: false,
    fraudIdentityProviderCalled: false,
    creditBureauProviderCalled: false,
    reportRetrieved: false,
    scoreRetrieved: false,
    externalSystemChanged: false,
    allowedForLivePullNow: false,
    message: extra.message,
    blockers,
    warnings,
    rejectedReason: extra.rejectedReason,
    policyGateProofId: extra.withProof ? deterministicProofId(dealRef, domains) : undefined,
    auditSummary: audit(dealRef, domains.length, blockers.length, warnings.length),
  };
}

function rejected(dealRef: string, domains: readonly PolicyGateDomain[], reason: PolicyGateRejectedReason, message: string): AmlKycCreditBureauPolicyGateResult {
  return baseResult('rejected', dealRef, domains, [], [], { rejectedReason: reason, message: `${message} ${NO_LIVE_PULL_MESSAGE}`, withProof: false });
}

export function evaluateAmlKycCreditBureauPolicyGate(
  input: AmlKycCreditBureauPolicyGateInput | null | undefined,
): AmlKycCreditBureauPolicyGateResult {
  const dealRef = (input?.dealId ?? '').trim();
  const domains = input?.requestedPolicyDomains ?? [];

  if (!input || dealRef.length === 0) {
    return rejected(dealRef, domains, 'missing_identity', 'Rejected: a deal identity is required.');
  }
  if (input.livePullMode !== POLICY_GATE_LIVE_PULL_MODE) {
    return rejected(dealRef, domains, 'invalid_live_pull_mode', 'Rejected: only the disabled-by-default live pull mode is accepted.');
  }
  if (domains.length === 0 || domains.some((d) => !POLICY_GATE_DOMAINS.includes(d))) {
    return rejected(dealRef, domains, 'unsupported_domain', 'Rejected: an unsupported or empty policy domain set was provided.');
  }

  const presentKeys = Object.keys(input as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
  if (SENSITIVE_KEYS.some((s) => presentKeys.includes(s))) {
    return rejected(dealRef, domains, 'sensitive_identifier_present', 'Rejected: sensitive identifiers are not accepted by this policy gate.');
  }

  const payloadText = [input.dealName, input.clientName, input.borrowerLabel, input.purposeLabel, input.requestedByDisplayName].filter((v): v is string => typeof v === 'string').join('\n');
  if (isUnsafe(payloadText)) {
    return rejected(dealRef, domains, 'unsafe_payload', 'Rejected: the request contains a suspicious executable / unsafe payload.');
  }

  // --- Policy prerequisite evaluation (no pull regardless) -------------------
  const blockers: PolicyGateBlocker[] = [];
  const warnings: PolicyGateWarning[] = [];

  const providerConfigured = input.providerConfigured === true;
  if (!providerConfigured) {
    blockers.push({ code: 'provider_not_configured', message: 'No approved provider is configured; live pull is disabled.' });
  }
  blockers.push({ code: 'live_pull_disabled_this_phase', message: 'Live AML/KYC and credit bureau pulls are disabled in this phase.' });

  const hasCreditBureau = domains.includes('credit_bureau');
  if (hasCreditBureau) {
    if (input.permissiblePurposeStatus !== 'documented' && input.permissiblePurposeStatus !== 'not_required_for_gate') {
      blockers.push({ code: 'permissible_purpose_not_documented', message: 'Credit bureau requires a documented permissible purpose (FCRA).' });
    }
    if (input.consentStatus !== 'collected' && input.consentStatus !== 'not_required_for_gate') {
      warnings.push({ code: 'borrower_consent_missing', message: 'Borrower consent for a credit bureau pull is not collected.' });
    }
  }

  if (domains.includes('aml_kyc') || domains.includes('ofac_sanctions') || domains.includes('fraud_identity')) {
    blockers.push({ code: 'aml_kyc_audit_model_required', message: 'AML/KYC/OFAC requires a provider configuration, audit model, and security/DLP review before any future pull.' });
  }

  // Ready only when every NON-LIVE prerequisite is documented — but the live pull
  // mode stays disabled, so `allowedForLivePullNow` remains false either way.
  const onlyNonLiveBlocker = blockers.length === 1 && blockers[0]?.code === 'live_pull_disabled_this_phase';
  const status: PolicyGateStatus = providerConfigured && onlyNonLiveBlocker
    ? 'ready_for_future_configuration'
    : 'blocked_no_live_pull';

  return baseResult(status, dealRef, domains, blockers, warnings, { message: NO_LIVE_PULL_MESSAGE, withProof: true });
}

/**
 * Phase 142P — Core banking read-only lookup adapter SEAM (DISABLED BY DEFAULT).
 *
 * Defines the boundary shape for a FUTURE read-only core banking relationship
 * lookup and proves the current default behavior is disabled / fail-closed. It
 * connects to NO core, calls NO API, reads NO live customer/account/balance/
 * transaction data, stores NO credential, mutates NOTHING, and moves NO money.
 * Every outcome keeps `liveLookupPerformed`, `customerDataRetrieved`,
 * `accountDataRetrieved`, `balanceDataRetrieved`, `transactionDataRetrieved`, and
 * `externalSystemChanged` false. The result union has only `disabled` and
 * `rejected` — there is no success / found / matched / retrieved / verified
 * status. No sensitive identifier (SSN/TIN/account/routing/DOB/address) is
 * accepted into this seam.
 */

export const CORE_BANKING_PROVIDER = 'core_banking' as const;
export const CORE_BANKING_LOOKUP_MODE = 'disabled_by_default' as const;

export type CoreBankingLookupKind =
  | 'borrower_relationship'
  | 'customer_profile'
  | 'deposit_relationship'
  | 'loan_relationship'
  | 'disabled_placeholder';

export const CORE_BANKING_LOOKUP_KINDS: readonly CoreBankingLookupKind[] = Object.freeze([
  'borrower_relationship', 'customer_profile', 'deposit_relationship', 'loan_relationship', 'disabled_placeholder',
]);

export interface CoreBankingLookupRequest {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  lookupKind: CoreBankingLookupKind;
  requestedByDisplayName: string;
  requestedAt: string;
  provider: typeof CORE_BANKING_PROVIDER;
  mode: typeof CORE_BANKING_LOOKUP_MODE;
}

export type CoreBankingLookupRejectedReason =
  | 'missing_identity'
  | 'invalid_provider'
  | 'invalid_mode'
  | 'unsupported_lookup_kind'
  | 'sensitive_identifier_present'
  | 'unsafe_payload';

export interface CoreBankingLookupAuditSummary {
  dealRef: string;
  provider: typeof CORE_BANKING_PROVIDER;
  lookupKind: CoreBankingLookupKind;
  /** Pinned false — no live lookup / retrieval / external change ever occurs. */
  liveLookupPerformed: false;
  customerDataRetrieved: false;
  accountDataRetrieved: false;
  balanceDataRetrieved: false;
  transactionDataRetrieved: false;
  externalSystemChanged: false;
  readOnly: true;
}

export interface CoreBankingLookupResult {
  status: 'disabled' | 'rejected';
  provider: typeof CORE_BANKING_PROVIDER;
  mode: typeof CORE_BANKING_LOOKUP_MODE;
  liveLookupPerformed: false;
  customerDataRetrieved: false;
  accountDataRetrieved: false;
  balanceDataRetrieved: false;
  transactionDataRetrieved: false;
  externalSystemChanged: false;
  message: string;
  rejectedReason?: CoreBankingLookupRejectedReason;
  lookupSeamProofId?: string;
  auditSummary: CoreBankingLookupAuditSummary;
}

export interface PrepareCoreBankingLookupInput {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  borrowerLabel?: string;
  lookupKind?: CoreBankingLookupKind;
  requestedByDisplayName?: string;
  requestedAt: string;
}

const DISABLED_MESSAGE =
  'Core banking read-only lookup is not enabled. No customer, account, balance, transaction, or relationship data is retrieved, and no external system is changed.';

/** Sensitive identifier field keys that must never enter this seam. */
const SENSITIVE_KEYS: readonly string[] = [
  'ssn', 'tin', 'taxid', 'dob', 'dateofbirth', 'accountnumber', 'routingnumber', 'cardnumber', 'fulladdress',
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

/** Deterministic, non-random id from stable local inputs (FNV-1a). NOT a real core/customer/account id. */
function deterministicProofId(dealRef: string, lookupKind: CoreBankingLookupKind): string {
  const seed = `${dealRef}|${CORE_BANKING_PROVIDER}|${CORE_BANKING_LOOKUP_MODE}|${lookupKind}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `core_lookup_seam_disabled_${hash.toString(16).padStart(8, '0')}`;
}

function audit(request: CoreBankingLookupRequest | null, dealRef: string): CoreBankingLookupAuditSummary {
  return {
    dealRef,
    provider: CORE_BANKING_PROVIDER,
    lookupKind: request?.lookupKind ?? 'disabled_placeholder',
    liveLookupPerformed: false,
    customerDataRetrieved: false,
    accountDataRetrieved: false,
    balanceDataRetrieved: false,
    transactionDataRetrieved: false,
    externalSystemChanged: false,
    readOnly: true,
  };
}

function rejected(
  request: CoreBankingLookupRequest | null,
  dealRef: string,
  reason: CoreBankingLookupRejectedReason,
  message: string,
): CoreBankingLookupResult {
  return {
    status: 'rejected',
    provider: CORE_BANKING_PROVIDER,
    mode: CORE_BANKING_LOOKUP_MODE,
    liveLookupPerformed: false,
    customerDataRetrieved: false,
    accountDataRetrieved: false,
    balanceDataRetrieved: false,
    transactionDataRetrieved: false,
    externalSystemChanged: false,
    message: `${message} ${DISABLED_MESSAGE}`,
    rejectedReason: reason,
    auditSummary: audit(request, dealRef),
  };
}

/** Build a disabled-by-default core banking lookup request from local deal identity. */
export function prepareCoreBankingLookupRequest(input: PrepareCoreBankingLookupInput): CoreBankingLookupRequest {
  return {
    dealId: input.dealId,
    dealName: input.dealName,
    clientName: input.clientName,
    borrowerLabel: input.borrowerLabel,
    lookupKind: input.lookupKind ?? 'disabled_placeholder',
    requestedByDisplayName: input.requestedByDisplayName ?? 'unknown',
    requestedAt: input.requestedAt,
    provider: CORE_BANKING_PROVIDER,
    mode: CORE_BANKING_LOOKUP_MODE,
  };
}

/**
 * Submit a core banking read-only lookup to the DISABLED seam. Synchronous, pure,
 * and offline. Always returns `disabled` (for a valid request) or `rejected` —
 * never a success / found / matched / retrieved / verified outcome. No live core
 * action ever occurs.
 */
export function submitCoreBankingLookup(
  request: CoreBankingLookupRequest | null | undefined,
): CoreBankingLookupResult {
  const dealRef = (request?.dealId ?? '').trim();

  if (!request || dealRef.length === 0) {
    return rejected(request ?? null, dealRef, 'missing_identity', 'Rejected: a deal identity is required.');
  }
  if (request.provider !== CORE_BANKING_PROVIDER) {
    return rejected(request, dealRef, 'invalid_provider', 'Rejected: only the disabled core banking provider is accepted.');
  }
  if (request.mode !== CORE_BANKING_LOOKUP_MODE) {
    return rejected(request, dealRef, 'invalid_mode', 'Rejected: only the disabled-by-default mode is accepted.');
  }
  if (!CORE_BANKING_LOOKUP_KINDS.includes(request.lookupKind)) {
    return rejected(request, dealRef, 'unsupported_lookup_kind', 'Rejected: the lookup kind is not supported.');
  }

  // Reject any sensitive identifier-like field key present on the request object.
  const presentKeys = Object.keys(request as unknown as Record<string, unknown>).map((k) => k.toLowerCase());
  if (SENSITIVE_KEYS.some((s) => presentKeys.includes(s))) {
    return rejected(request, dealRef, 'sensitive_identifier_present', 'Rejected: sensitive identifiers are not accepted by this seam.');
  }

  const payloadText = [request.dealName, request.clientName, request.borrowerLabel, request.requestedByDisplayName].filter((v): v is string => typeof v === 'string').join('\n');
  if (isUnsafe(payloadText)) {
    return rejected(request, dealRef, 'unsafe_payload', 'Rejected: the request contains a suspicious executable / unsafe payload.');
  }

  return {
    status: 'disabled',
    provider: CORE_BANKING_PROVIDER,
    mode: CORE_BANKING_LOOKUP_MODE,
    liveLookupPerformed: false,
    customerDataRetrieved: false,
    accountDataRetrieved: false,
    balanceDataRetrieved: false,
    transactionDataRetrieved: false,
    externalSystemChanged: false,
    message: DISABLED_MESSAGE,
    lookupSeamProofId: deterministicProofId(dealRef, request.lookupKind),
    auditSummary: audit(request, dealRef),
  };
}

/**
 * Phase 142O — E-sign envelope adapter SEAM (DISABLED BY DEFAULT).
 *
 * Defines the boundary shape for a FUTURE PandaDoc-based e-signature workflow and
 * proves that the current default behavior is disabled / fail-closed. PandaDoc is
 * named only as the intended future provider — this seam makes NO PandaDoc call,
 * stores NO token/credential, creates NO envelope, uploads NO document, looks up
 * NO template, sends NO recipient email, registers NO webhook, and performs NO
 * fetch / Dataverse / CRM write. Every outcome keeps `liveEnvelopeCreated`,
 * `documentUploaded`, `recipientEmailSent`, `webhookRegistered`, and
 * `externalDeliveryPerformed` false. The result union has only `disabled` and
 * `rejected` — there is no success / sent / created / uploaded / delivered status.
 */

export const ESIGN_PROVIDER = 'pandadoc' as const;
export const ESIGN_ENVELOPE_MODE = 'disabled_by_default' as const;
export const ESIGN_ENVELOPE_DESTINATION = 'disabled_pandadoc_placeholder' as const;

export interface ESignEnvelopeRequest {
  dealId?: string;
  packageId?: string;
  dealName?: string;
  clientName?: string;
  documentLabel?: string;
  packageLabel?: string;
  signerCount?: number;
  /** Signer LABELS only — never email addresses (no recipient identity is sent). */
  signerLabels?: readonly string[];
  packageGeneratedAt?: string;
  requestedByDisplayName: string;
  requestedAt: string;
  provider: typeof ESIGN_PROVIDER;
  mode: typeof ESIGN_ENVELOPE_MODE;
  destinationKind: typeof ESIGN_ENVELOPE_DESTINATION;
}

export type ESignEnvelopeRejectedReason =
  | 'missing_identity'
  | 'invalid_provider'
  | 'invalid_mode'
  | 'invalid_destination'
  | 'unsafe_payload';

export interface ESignEnvelopeAuditSummary {
  packageRef: string;
  provider: typeof ESIGN_PROVIDER;
  signerCount: number;
  documentLabelPresent: boolean;
  /** Pinned false — no live envelope / upload / email / webhook / delivery ever occurs. */
  liveEnvelopeCreated: false;
  documentUploaded: false;
  recipientEmailSent: false;
  webhookRegistered: false;
  externalDeliveryPerformed: false;
  readOnly: true;
}

export interface ESignEnvelopeResult {
  status: 'disabled' | 'rejected';
  provider: typeof ESIGN_PROVIDER;
  mode: typeof ESIGN_ENVELOPE_MODE;
  liveEnvelopeCreated: false;
  documentUploaded: false;
  recipientEmailSent: false;
  webhookRegistered: false;
  externalDeliveryPerformed: false;
  message: string;
  rejectedReason?: ESignEnvelopeRejectedReason;
  envelopeSeamProofId?: string;
  auditSummary: ESignEnvelopeAuditSummary;
}

export interface PrepareESignEnvelopeInput {
  dealId?: string;
  packageId?: string;
  dealName?: string;
  clientName?: string;
  documentLabel?: string;
  packageLabel?: string;
  signerCount?: number;
  signerLabels?: readonly string[];
  packageGeneratedAt?: string;
  requestedByDisplayName?: string;
  requestedAt: string;
}

const DISABLED_MESSAGE =
  'PandaDoc e-signature sending is not enabled. No envelopes are created, no documents are uploaded, no signer emails are sent, and no external system is changed.';

// Compact unsafe-payload scan (executable / SQL / secret / email) — keeps the
// seam self-contained and rejects anything that looks live or transmissible.
const UNSAFE_RX: readonly RegExp[] = [
  /\bfunction\s*\(|=>|\beval\s*\(|new\s+Function\b|\brequire\s*\(|\bimport\s*\(/,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b/i,
  /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
];

function isUnsafe(text: string): boolean {
  return UNSAFE_RX.some((rx) => rx.test(text));
}

/** Deterministic, non-random id from stable local inputs (FNV-1a). NOT a real PandaDoc envelope id. */
function deterministicProofId(packageRef: string): string {
  const seed = `${packageRef}|${ESIGN_PROVIDER}|${ESIGN_ENVELOPE_MODE}|${ESIGN_ENVELOPE_DESTINATION}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `esign_seam_disabled_${hash.toString(16).padStart(8, '0')}`;
}

function audit(request: ESignEnvelopeRequest | null, packageRef: string): ESignEnvelopeAuditSummary {
  return {
    packageRef,
    provider: ESIGN_PROVIDER,
    signerCount: request?.signerCount ?? request?.signerLabels?.length ?? 0,
    documentLabelPresent: (request?.documentLabel ?? request?.packageLabel) !== undefined,
    liveEnvelopeCreated: false,
    documentUploaded: false,
    recipientEmailSent: false,
    webhookRegistered: false,
    externalDeliveryPerformed: false,
    readOnly: true,
  };
}

function rejected(
  request: ESignEnvelopeRequest | null,
  packageRef: string,
  reason: ESignEnvelopeRejectedReason,
  message: string,
): ESignEnvelopeResult {
  return {
    status: 'rejected',
    provider: ESIGN_PROVIDER,
    mode: ESIGN_ENVELOPE_MODE,
    liveEnvelopeCreated: false,
    documentUploaded: false,
    recipientEmailSent: false,
    webhookRegistered: false,
    externalDeliveryPerformed: false,
    message: `${message} ${DISABLED_MESSAGE}`,
    rejectedReason: reason,
    auditSummary: audit(request, packageRef),
  };
}

/** Build a disabled-by-default PandaDoc envelope request from local package identity. */
export function prepareESignEnvelopeRequest(input: PrepareESignEnvelopeInput): ESignEnvelopeRequest {
  return {
    dealId: input.dealId,
    packageId: input.packageId,
    dealName: input.dealName,
    clientName: input.clientName,
    documentLabel: input.documentLabel,
    packageLabel: input.packageLabel,
    signerCount: input.signerCount,
    signerLabels: input.signerLabels,
    packageGeneratedAt: input.packageGeneratedAt,
    requestedByDisplayName: input.requestedByDisplayName ?? 'unknown',
    requestedAt: input.requestedAt,
    provider: ESIGN_PROVIDER,
    mode: ESIGN_ENVELOPE_MODE,
    destinationKind: ESIGN_ENVELOPE_DESTINATION,
  };
}

/**
 * Submit a PandaDoc e-sign envelope to the DISABLED seam. Synchronous, pure, and
 * offline. Always returns `disabled` (for a valid request) or `rejected` — never
 * a success / sent / created / uploaded / delivered outcome. No live PandaDoc
 * action ever occurs.
 */
export function submitESignEnvelope(
  request: ESignEnvelopeRequest | null | undefined,
): ESignEnvelopeResult {
  const packageRef = (request?.dealId ?? request?.packageId ?? '').trim();

  if (!request || packageRef.length === 0) {
    return rejected(request ?? null, packageRef, 'missing_identity', 'Rejected: a deal or package identity is required.');
  }
  if (request.provider !== ESIGN_PROVIDER) {
    return rejected(request, packageRef, 'invalid_provider', 'Rejected: only the disabled PandaDoc provider is accepted.');
  }
  if (request.mode !== ESIGN_ENVELOPE_MODE) {
    return rejected(request, packageRef, 'invalid_mode', 'Rejected: only the disabled-by-default mode is accepted.');
  }
  if (request.destinationKind !== ESIGN_ENVELOPE_DESTINATION) {
    return rejected(request, packageRef, 'invalid_destination', 'Rejected: only the disabled PandaDoc placeholder destination is accepted.');
  }

  const payloadText = [request.dealName, request.clientName, request.documentLabel, request.packageLabel, request.requestedByDisplayName, ...(request.signerLabels ?? [])].filter((v): v is string => typeof v === 'string').join('\n');
  if (isUnsafe(payloadText)) {
    return rejected(request, packageRef, 'unsafe_payload', 'Rejected: the request contains a suspicious executable / unsafe payload (including raw email addresses).');
  }

  return {
    status: 'disabled',
    provider: ESIGN_PROVIDER,
    mode: ESIGN_ENVELOPE_MODE,
    liveEnvelopeCreated: false,
    documentUploaded: false,
    recipientEmailSent: false,
    webhookRegistered: false,
    externalDeliveryPerformed: false,
    message: DISABLED_MESSAGE,
    envelopeSeamProofId: deterministicProofId(packageRef),
    auditSummary: audit(request, packageRef),
  };
}

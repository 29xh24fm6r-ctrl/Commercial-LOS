/**
 * Phase 142N — Credit package export adapter SEAM (DISABLED BY DEFAULT).
 *
 * Defines the boundary shape for a FUTURE live committee-package export and proves
 * that the current default behavior is disabled / fail-closed. It exports NOTHING
 * live: NO file upload, NO email send, NO Graph/Outlook/Power Automate call, NO
 * fetch/XMLHttpRequest/axios, NO Dataverse/CRM write, NO POST/PATCH/PUT/DELETE, NO
 * external delivery, NO committee vote/approval. Every outcome keeps
 * `liveExportPerformed`, `externalDeliveryPerformed`, `fileUploaded`, and
 * `emailSent` false. The result union has only `disabled` and `rejected` — there
 * is no success / exported / sent / uploaded status.
 */

export const CREDIT_PACKAGE_EXPORT_MODE = 'disabled_by_default' as const;
export const CREDIT_PACKAGE_EXPORT_DESTINATION = 'disabled_placeholder' as const;

export interface CreditPackageExportRequest {
  packageId?: string;
  dealId?: string;
  dealName?: string;
  clientName?: string;
  packageGeneratedAt?: string;
  committeeReadinessStatus?: string;
  evidenceCount?: number;
  blockerCount?: number;
  missingEvidenceCount?: number;
  requestedByDisplayName: string;
  requestedAt: string;
  /** Only `disabled_placeholder` is accepted in this phase. */
  destinationKind: typeof CREDIT_PACKAGE_EXPORT_DESTINATION;
  /** Only `disabled_by_default` is accepted in this phase. */
  mode: typeof CREDIT_PACKAGE_EXPORT_MODE;
}

export type CreditPackageExportRejectedReason =
  | 'missing_identity'
  | 'invalid_destination'
  | 'invalid_mode'
  | 'unsafe_payload';

export interface CreditPackageExportAuditSummary {
  packageRef: string;
  evidenceCount?: number;
  blockerCount?: number;
  missingEvidenceCount?: number;
  /** Pinned false — no live export / delivery / upload / email ever occurs. */
  liveExportPerformed: false;
  externalDeliveryPerformed: false;
  fileUploaded: false;
  emailSent: false;
  readOnly: true;
}

export interface CreditPackageExportResult {
  status: 'disabled' | 'rejected';
  mode: typeof CREDIT_PACKAGE_EXPORT_MODE;
  liveExportPerformed: false;
  externalDeliveryPerformed: false;
  fileUploaded: false;
  emailSent: false;
  message: string;
  rejectedReason?: CreditPackageExportRejectedReason;
  exportSeamProofId?: string;
  auditSummary: CreditPackageExportAuditSummary;
}

export interface PrepareCreditPackageExportInput {
  packageId?: string;
  dealId?: string;
  dealName?: string;
  clientName?: string;
  packageGeneratedAt?: string;
  committeeReadinessStatus?: string;
  evidenceCount?: number;
  blockerCount?: number;
  missingEvidenceCount?: number;
  requestedByDisplayName?: string;
  requestedAt: string;
}

const DISABLED_MESSAGE =
  'Live package export is not enabled. No files are uploaded, no emails are sent, and no external system is changed.';

// Compact unsafe-payload scan (executable / SQL / secret / PII) — mirrors the
// admin-config content-safety posture without coupling to that module.
const UNSAFE_RX: readonly RegExp[] = [
  /\bfunction\s*\(|=>|\beval\s*\(|new\s+Function\b|\brequire\s*\(|\bimport\s*\(/,
  /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b/i,
  /\b(api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

function isUnsafe(text: string): boolean {
  return UNSAFE_RX.some((rx) => rx.test(text));
}

/** Deterministic, non-random id derived from stable local inputs (FNV-1a, hex). */
function deterministicProofId(packageRef: string): string {
  const seed = `${packageRef}|${CREDIT_PACKAGE_EXPORT_MODE}|${CREDIT_PACKAGE_EXPORT_DESTINATION}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `export_seam_${hash.toString(16).padStart(8, '0')}`;
}

function audit(request: CreditPackageExportRequest | null, packageRef: string): CreditPackageExportAuditSummary {
  return {
    packageRef,
    evidenceCount: request?.evidenceCount,
    blockerCount: request?.blockerCount,
    missingEvidenceCount: request?.missingEvidenceCount,
    liveExportPerformed: false,
    externalDeliveryPerformed: false,
    fileUploaded: false,
    emailSent: false,
    readOnly: true,
  };
}

function rejected(
  request: CreditPackageExportRequest | null,
  packageRef: string,
  reason: CreditPackageExportRejectedReason,
  message: string,
): CreditPackageExportResult {
  return {
    status: 'rejected',
    mode: CREDIT_PACKAGE_EXPORT_MODE,
    liveExportPerformed: false,
    externalDeliveryPerformed: false,
    fileUploaded: false,
    emailSent: false,
    message: `${message} ${DISABLED_MESSAGE}`,
    rejectedReason: reason,
    auditSummary: audit(request, packageRef),
  };
}

/** Build a disabled-by-default export request from local package identity. */
export function prepareCreditPackageExportRequest(
  input: PrepareCreditPackageExportInput,
): CreditPackageExportRequest {
  return {
    packageId: input.packageId,
    dealId: input.dealId,
    dealName: input.dealName,
    clientName: input.clientName,
    packageGeneratedAt: input.packageGeneratedAt,
    committeeReadinessStatus: input.committeeReadinessStatus,
    evidenceCount: input.evidenceCount,
    blockerCount: input.blockerCount,
    missingEvidenceCount: input.missingEvidenceCount,
    requestedByDisplayName: input.requestedByDisplayName ?? 'unknown',
    requestedAt: input.requestedAt,
    destinationKind: CREDIT_PACKAGE_EXPORT_DESTINATION,
    mode: CREDIT_PACKAGE_EXPORT_MODE,
  };
}

/**
 * Submit a credit package export to the DISABLED seam. Synchronous, pure, and
 * offline. Always returns `disabled` (for a valid request) or `rejected` — never
 * a success / exported / sent / uploaded outcome. No live effect ever occurs.
 */
export function submitCreditPackageExport(
  request: CreditPackageExportRequest | null | undefined,
): CreditPackageExportResult {
  const packageRef = (request?.packageId ?? request?.dealId ?? '').trim();

  if (!request || packageRef.length === 0) {
    return rejected(request ?? null, packageRef, 'missing_identity', 'Rejected: a package or deal identity is required.');
  }
  if (request.destinationKind !== CREDIT_PACKAGE_EXPORT_DESTINATION) {
    return rejected(request, packageRef, 'invalid_destination', 'Rejected: only the disabled placeholder destination is accepted.');
  }
  if (request.mode !== CREDIT_PACKAGE_EXPORT_MODE) {
    return rejected(request, packageRef, 'invalid_mode', 'Rejected: only the disabled-by-default mode is accepted.');
  }

  const payloadText = [request.dealName, request.clientName, request.committeeReadinessStatus, request.requestedByDisplayName].filter((v): v is string => typeof v === 'string').join('\n');
  if (isUnsafe(payloadText)) {
    return rejected(request, packageRef, 'unsafe_payload', 'Rejected: the request contains a suspicious executable / unsafe payload.');
  }

  return {
    status: 'disabled',
    mode: CREDIT_PACKAGE_EXPORT_MODE,
    liveExportPerformed: false,
    externalDeliveryPerformed: false,
    fileUploaded: false,
    emailSent: false,
    message: DISABLED_MESSAGE,
    exportSeamProofId: deterministicProofId(packageRef),
    auditSummary: audit(request, packageRef),
  };
}

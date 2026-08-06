import {
  POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION,
  POWER_AUTOMATE_ERROR_CODES,
  authorizeTrustedActor,
  canonicalFingerprintMaterial,
  governedTargetPath,
  sha256Hex,
  validateActivationRequest,
  type PowerAutomateErrorCode,
  type PowerAutomateTransportRequest,
  type PowerAutomateTransportResponse,
  type TrustedAuthorizationFacts,
} from './activationContract.js';

export type DryRunLedgerStatus = 'STARTED' | 'DRY_RUN_COMPLETED' | 'FAILED';
export interface DryRunLedgerTransition {
  readonly status: DryRunLedgerStatus;
  readonly occurredOn: string;
  readonly actorUpn: string;
  readonly detail: string;
}
export interface DryRunLedgerRecord {
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly requestFingerprint: string;
  readonly contentSha256: string;
  readonly dealId: string;
  readonly operation: PowerAutomateTransportRequest['operation'];
  readonly targetPath: string;
  readonly fileName: string;
  readonly expectedSize: number;
  readonly actorUpn: string;
  readonly bankerId: string;
  readonly status: DryRunLedgerStatus;
  readonly startedOn: string;
  readonly completedOn?: string;
  readonly failureCode?: PowerAutomateErrorCode;
  readonly failureMessage?: string;
  readonly response?: PowerAutomateTransportResponse;
  readonly transitions: readonly DryRunLedgerTransition[];
}
export type DryRunReservation =
  | { readonly reserved: true; readonly record: DryRunLedgerRecord }
  | { readonly reserved: false; readonly existing: DryRunLedgerRecord };

/**
 * Production implementations must reserve through the Active alternate key on
 * cr664_sharepointtransportledger. There is intentionally no runtime memory fallback.
 */
export interface DurableDryRunLedger {
  readonly storeId: string;
  healthCheck(): Promise<boolean>;
  reserve(record: DryRunLedgerRecord): Promise<DryRunReservation>;
  complete(idempotencyKey: string, response: PowerAutomateTransportResponse, transition: DryRunLedgerTransition): Promise<void>;
  fail(idempotencyKey: string, code: PowerAutomateErrorCode, message: string, transition: DryRunLedgerTransition): Promise<void>;
  read(idempotencyKey: string): Promise<DryRunLedgerRecord | undefined>;
}

export interface DryRunExecutionDependencies {
  readonly ledger: DurableDryRunLedger;
  readonly now?: () => string;
}
export interface DryRunExecutionInput {
  readonly request: PowerAutomateTransportRequest;
  /** Facts resolved at the authenticated server/flow boundary, never from request JSON. */
  readonly authorization: TrustedAuthorizationFacts;
}

const EMPTY_HASH = '0'.repeat(64);
function failure(
  request: PowerAutomateTransportRequest,
  code: PowerAutomateErrorCode,
  message: string,
  targetPath = '',
  fingerprint = EMPTY_HASH,
): PowerAutomateTransportResponse {
  return {
    success: false, validationOnly: true, operation: request.operation, status: 'BLOCKED',
    correlationId: request.correlationId, idempotencyKey: request.idempotencyKey,
    requestFingerprint: fingerprint, contentSha256: request.contentSha256 ?? '',
    dealId: request.dealId, errorCode: code, errorMessage: message,
    fileMayExist: false, reconciliationRequired: false, targetPath,
    fileName: request.fileName ?? '', sharePointItemId: '', sharePointUniqueId: '',
    size: request.expectedSize ?? 0, etag: '', webUrl: '', created: false,
    completedOn: '', contractVersion: POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION,
  };
}

function decodeBase64(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return btoa(binary) === value ? bytes : undefined;
  } catch {
    return undefined;
  }
}

async function validateBinary(request: PowerAutomateTransportRequest): Promise<PowerAutomateErrorCode | undefined> {
  if (request.operation !== 'upload') return undefined;
  const bytes = request.fileContent ? decodeBase64(request.fileContent.contentBytes) : undefined;
  if (!bytes || request.fileContent?.name !== request.fileName || bytes.byteLength !== request.expectedSize) return 'INVALID_REQUEST';
  return await sha256Hex(bytes) === request.contentSha256 ? undefined : 'INVALID_REQUEST';
}

export async function executeGovernedDryRun(
  input: DryRunExecutionInput,
  dependencies: DryRunExecutionDependencies,
): Promise<PowerAutomateTransportResponse> {
  const { request, authorization } = input;
  const errors = validateActivationRequest(request as unknown as Record<string, unknown>);
  if (errors.length) return failure(request, errors.includes('INVALID_PATH') ? 'INVALID_PATH' : 'INVALID_REQUEST', errors.join(', '));
  let targetPath: string;
  try { targetPath = governedTargetPath(request); }
  catch { return failure(request, 'INVALID_PATH', 'The requested path is outside the governed SharePoint root.'); }
  if (await validateBinary(request)) return failure(request, 'INVALID_REQUEST', 'The binary content hash, size, or filename does not match the request.', targetPath);

  const decision = authorizeTrustedActor(authorization);
  if (!decision.authorized) return failure(request, decision.errorCode, 'Authenticated actor or deal authorization failed.', targetPath);
  if (!await dependencies.ledger.healthCheck()) return failure(request, 'LEDGER_UNAVAILABLE', 'The durable Dataverse transport ledger is unavailable.', targetPath);

  const requestFingerprint = await sha256Hex(canonicalFingerprintMaterial(request));
  const now = (dependencies.now ?? (() => new Date().toISOString()))();
  const actorUpn = authorization.actorUpn as string;
  const started: DryRunLedgerRecord = {
    idempotencyKey: request.idempotencyKey, correlationId: request.correlationId,
    requestFingerprint, contentSha256: request.contentSha256 ?? '', dealId: request.dealId,
    operation: request.operation, targetPath, fileName: request.fileName ?? '',
    expectedSize: request.expectedSize ?? 0, actorUpn, bankerId: decision.bankerId,
    status: 'STARTED', startedOn: now,
    transitions: [{ status: 'STARTED', occurredOn: now, actorUpn, detail: 'Atomic DRY_RUN reservation created.' }],
  };
  let reservation: DryRunReservation;
  try { reservation = await dependencies.ledger.reserve(started); }
  catch { return failure(request, 'LEDGER_UNAVAILABLE', 'The durable Dataverse transport reservation failed.', targetPath, requestFingerprint); }
  if (!reservation.reserved) {
    const existing = reservation.existing;
    if (existing.requestFingerprint !== requestFingerprint) return failure(request, 'IDEMPOTENCY_COLLISION', 'The idempotency key is already bound to different request material.', targetPath, requestFingerprint);
    if (existing.status === 'DRY_RUN_COMPLETED' && existing.response) return existing.response;
    return failure(request, 'OPERATION_IN_PROGRESS', 'The matching request is not in a replayable completed state.', targetPath, requestFingerprint);
  }

  const response: PowerAutomateTransportResponse = {
    success: false, validationOnly: true, operation: request.operation, status: 'DRY_RUN_COMPLETED',
    correlationId: request.correlationId, idempotencyKey: request.idempotencyKey,
    requestFingerprint, contentSha256: request.contentSha256 ?? '', dealId: request.dealId,
    errorCode: '', errorMessage: 'DRY_RUN validation completed. No SharePoint object was created or changed.',
    fileMayExist: false, reconciliationRequired: false, targetPath,
    fileName: request.fileName ?? '', sharePointItemId: '', sharePointUniqueId: '',
    size: request.expectedSize ?? 0, etag: '', webUrl: '', created: false,
    completedOn: now, contractVersion: POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION,
  };
  try {
    await dependencies.ledger.complete(request.idempotencyKey, response, {
      status: 'DRY_RUN_COMPLETED', occurredOn: now, actorUpn,
      detail: 'Validation-only completion; no SharePoint mutation attempted.',
    });
    const readback = await dependencies.ledger.read(request.idempotencyKey);
    if (!readback || readback.status !== 'DRY_RUN_COMPLETED' || readback.requestFingerprint !== requestFingerprint || readback.response?.requestFingerprint !== requestFingerprint) throw new Error('LEDGER_READBACK_FAILED');
    return readback.response;
  } catch {
    try {
      await dependencies.ledger.fail(request.idempotencyKey, 'LEDGER_UNAVAILABLE', 'Durable completion or readback failed.', {
        status: 'FAILED', occurredOn: now, actorUpn, detail: 'Durable completion/readback failed closed.',
      });
    } catch { /* The caller still receives an honest failure. */ }
    return failure(request, 'LEDGER_UNAVAILABLE', 'Durable DRY_RUN completion could not be verified.', targetPath, requestFingerprint);
  }
}

/** Test-only atomic ledger; production composition must supply Dataverse durability. */
export class TestOnlyInMemoryDryRunLedger implements DurableDryRunLedger {
  readonly storeId = 'TEST_ONLY_IN_MEMORY';
  private readonly records = new Map<string, DryRunLedgerRecord>();
  async healthCheck(): Promise<boolean> { return true; }
  async reserve(record: DryRunLedgerRecord): Promise<DryRunReservation> {
    const existing = this.records.get(record.idempotencyKey);
    if (existing) return { reserved: false, existing };
    this.records.set(record.idempotencyKey, record);
    return { reserved: true, record };
  }
  async complete(idempotencyKey: string, response: PowerAutomateTransportResponse, transition: DryRunLedgerTransition): Promise<void> {
    const existing = this.records.get(idempotencyKey);
    if (!existing) throw new Error('RESERVATION_REQUIRED');
    this.records.set(idempotencyKey, { ...existing, status: 'DRY_RUN_COMPLETED', completedOn: response.completedOn, response, transitions: [...existing.transitions, transition] });
  }
  async fail(idempotencyKey: string, code: PowerAutomateErrorCode, message: string, transition: DryRunLedgerTransition): Promise<void> {
    const existing = this.records.get(idempotencyKey);
    if (!existing) throw new Error('RESERVATION_REQUIRED');
    this.records.set(idempotencyKey, { ...existing, status: 'FAILED', failureCode: code, failureMessage: message, transitions: [...existing.transitions, transition] });
  }
  async read(idempotencyKey: string): Promise<DryRunLedgerRecord | undefined> { return this.records.get(idempotencyKey); }
}

export function isKnownPowerAutomateErrorCode(value: string): value is PowerAutomateErrorCode {
  return POWER_AUTOMATE_ERROR_CODES.includes(value as PowerAutomateErrorCode);
}

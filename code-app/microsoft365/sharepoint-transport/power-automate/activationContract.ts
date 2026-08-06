import {
  POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION,
  POWER_AUTOMATE_OPERATIONS,
  POWER_AUTOMATE_RESPONSE_FIELDS,
  validateGovernedSegment,
} from './transportContract.js';

export const POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION = 'ogb-deal-sharepoint/v2';
export const POWER_AUTOMATE_ERROR_CODES = [
  'ACTOR_IDENTITY_CONTEXT_UNAVAILABLE', 'ACTOR_NOT_ACTIVE', 'ACTOR_IDENTITY_AMBIGUOUS',
  'DEAL_NOT_FOUND', 'DEAL_ACCESS_DENIED', 'INVALID_REQUEST', 'INVALID_PATH',
  'IDEMPOTENCY_COLLISION', 'OPERATION_IN_PROGRESS', 'FOLDER_COLLISION', 'FILE_COLLISION',
  'SHAREPOINT_WRITE_FAILED', 'READBACK_FAILED', 'MALFORMED_RESPONSE',
  'RECONCILIATION_REQUIRED', 'CONFIGURATION_REQUIRED', 'LEDGER_UNAVAILABLE',
] as const;
export type PowerAutomateErrorCode = (typeof POWER_AUTOMATE_ERROR_CODES)[number];
export type PowerAutomateOperation = (typeof POWER_AUTOMATE_OPERATIONS)[number];

export interface PowerAutomateTransportRequest {
  readonly operation: PowerAutomateOperation;
  readonly dealId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly folderName?: string;
  readonly annualFolderName?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly fileContent?: { readonly name: string; readonly contentBytes: string };
  readonly contentSha256?: string;
  readonly expectedSize?: number;
  readonly expectedSharePointItemId?: string;
  readonly expectedUniqueId?: string;
}

export interface PowerAutomateTransportResponse {
  readonly success: boolean;
  readonly validationOnly: boolean;
  readonly operation: PowerAutomateOperation;
  readonly status: 'COMPLETED' | 'DRY_RUN_COMPLETED' | 'BLOCKED' | 'FAILED' | 'IN_PROGRESS';
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly contentSha256: string;
  readonly dealId: string;
  readonly errorCode: PowerAutomateErrorCode | '';
  readonly errorMessage: string;
  readonly fileMayExist: boolean;
  readonly reconciliationRequired: boolean;
  readonly targetPath: string;
  readonly fileName: string;
  readonly sharePointItemId: string;
  readonly sharePointUniqueId: string;
  readonly size: number;
  readonly etag: string;
  readonly webUrl: string;
  readonly created: boolean;
  readonly completedOn: string;
  readonly contractVersion: typeof POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION;
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

export function validateActivationRequest(input: Record<string, unknown>): readonly string[] {
  const errors: string[] = [];
  if (!POWER_AUTOMATE_OPERATIONS.includes(input.operation as PowerAutomateOperation)) errors.push('UNKNOWN_OPERATION');
  if (typeof input.dealId !== 'string' || !guid.test(input.dealId)) errors.push('INVALID_DEAL_ID');
  for (const field of ['correlationId', 'idempotencyKey']) {
    if (typeof input[field] !== 'string' || !input[field] || String(input[field]).length > 200) errors.push('MISSING_' + field);
  }
  for (const forbidden of ['siteUrl', 'libraryName', 'governedRoot', 'authorizationResult', 'callerEmail', 'callerObjectId', 'overwrite', 'rename']) {
    if (forbidden in input) errors.push('CALLER_OVERRIDE_' + forbidden);
  }
  for (const field of ['folderName', 'annualFolderName', 'fileName']) {
    if (typeof input[field] === 'string' && !validateGovernedSegment(input[field] as string)) errors.push('INVALID_' + field.toUpperCase());
  }
  if (typeof input.expectedSize === 'number' && (!Number.isInteger(input.expectedSize) || input.expectedSize < 1 || input.expectedSize > POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION.maxUploadBytes)) errors.push('INVALID_EXPECTED_SIZE');
  if (input.operation === 'upload') {
    if (!input.fileContent || typeof input.fileName !== 'string' || typeof input.expectedSize !== 'number') errors.push('INCOMPLETE_UPLOAD');
    if (typeof input.contentSha256 !== 'string' || !sha256.test(input.contentSha256)) errors.push('INVALID_CONTENT_HASH');
  }
  return errors;
}

export function governedTargetPath(request: Pick<PowerAutomateTransportRequest, 'annualFolderName' | 'folderName' | 'fileName'>): string {
  if (!request.annualFolderName || !request.folderName || !validateGovernedSegment(request.annualFolderName) || !validateGovernedSegment(request.folderName)) throw new Error('INVALID_PATH');
  const base = POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION.governedRoot + '/' + request.annualFolderName + '/' + request.folderName;
  if (!request.fileName) return base;
  if (!validateGovernedSegment(request.fileName)) throw new Error('INVALID_PATH');
  return base + '/' + request.fileName;
}

export function canonicalFingerprintMaterial(request: PowerAutomateTransportRequest): string {
  return JSON.stringify({
    contractVersion: POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION,
    operation: request.operation,
    dealId: request.dealId.toLowerCase(),
    targetPath: governedTargetPath(request),
    mimeType: request.mimeType ?? '',
    contentSha256: request.contentSha256 ?? '',
    expectedSize: request.expectedSize ?? 0,
    expectedSharePointItemId: request.expectedSharePointItemId ?? '',
    expectedUniqueId: request.expectedUniqueId ?? '',
  });
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(typeof value === 'string' ? new TextEncoder().encode(value) : value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface TrustedAuthorizationFacts {
  readonly actorUpn?: string;
  readonly activePlatformUserCount: number;
  readonly activeBankerIds: readonly string[];
  readonly dealExists: boolean;
  readonly assignedBankerId?: string;
}
export type AuthorizationDecision =
  | { readonly authorized: true; readonly bankerId: string }
  | { readonly authorized: false; readonly errorCode: PowerAutomateErrorCode };

export function authorizeTrustedActor(facts: TrustedAuthorizationFacts): AuthorizationDecision {
  if (!facts.actorUpn) return { authorized: false, errorCode: 'ACTOR_IDENTITY_CONTEXT_UNAVAILABLE' };
  if (facts.activePlatformUserCount !== 1 || facts.activeBankerIds.length !== 1) {
    return { authorized: false, errorCode: facts.activePlatformUserCount > 1 || facts.activeBankerIds.length > 1 ? 'ACTOR_IDENTITY_AMBIGUOUS' : 'ACTOR_NOT_ACTIVE' };
  }
  if (!facts.dealExists) return { authorized: false, errorCode: 'DEAL_NOT_FOUND' };
  if (facts.assignedBankerId?.toLowerCase() !== facts.activeBankerIds[0].toLowerCase()) return { authorized: false, errorCode: 'DEAL_ACCESS_DENIED' };
  return { authorized: true, bankerId: facts.activeBankerIds[0] };
}

export function parseTransportResponse(
  value: unknown,
  expected: Pick<PowerAutomateTransportRequest, 'operation' | 'dealId' | 'correlationId' | 'idempotencyKey'>,
): PowerAutomateTransportResponse {
  if (!value || typeof value !== 'object') throw new Error('MALFORMED_RESPONSE');
  const response = value as Record<string, unknown>;
  for (const field of POWER_AUTOMATE_RESPONSE_FIELDS) if (!(field in response)) throw new Error('MALFORMED_RESPONSE');
  if (response.contractVersion !== POWER_AUTOMATE_ACTIVATION_CONTRACT_VERSION || response.operation !== expected.operation || response.dealId !== expected.dealId || response.correlationId !== expected.correlationId || response.idempotencyKey !== expected.idempotencyKey) throw new Error('MALFORMED_RESPONSE');
  if (typeof response.success !== 'boolean' || typeof response.validationOnly !== 'boolean' || typeof response.fileMayExist !== 'boolean' || typeof response.reconciliationRequired !== 'boolean' || typeof response.size !== 'number' || typeof response.created !== 'boolean') throw new Error('MALFORMED_RESPONSE');
  if (typeof response.requestFingerprint !== 'string' || !sha256.test(response.requestFingerprint)) throw new Error('MALFORMED_RESPONSE');
  if (typeof response.contentSha256 !== 'string' || (response.contentSha256 !== '' && !sha256.test(response.contentSha256))) throw new Error('MALFORMED_RESPONSE');
  if (response.validationOnly) {
    if (response.success || response.created || response.fileMayExist || response.reconciliationRequired || response.sharePointItemId || response.sharePointUniqueId || response.etag || response.webUrl) throw new Error('MALFORMED_RESPONSE');
    if (response.status === 'DRY_RUN_COMPLETED') {
      if (response.errorCode !== '') throw new Error('MALFORMED_RESPONSE');
    } else if (typeof response.errorCode !== 'string' || !POWER_AUTOMATE_ERROR_CODES.includes(response.errorCode as PowerAutomateErrorCode)) {
      throw new Error('MALFORMED_RESPONSE');
    }
  } else if (response.success && (response.status !== 'COMPLETED' || response.errorCode !== '' || !response.webUrl)) {
    throw new Error('MALFORMED_RESPONSE');
  }
  if (!response.success && !response.validationOnly && (typeof response.errorCode !== 'string' || !POWER_AUTOMATE_ERROR_CODES.includes(response.errorCode as PowerAutomateErrorCode))) throw new Error('MALFORMED_RESPONSE');
  return response as unknown as PowerAutomateTransportResponse;
}

export const POWER_AUTOMATE_TRANSPORT_WORKFLOW_ID = '9448ac11-f490-f111-8076-7ced8d3bafd4';
export const POWER_AUTOMATE_RECONCILIATION_WORKFLOW_ID = 'f4637494-69f5-4d79-9f8b-0be46a36e71f';
export const POWER_AUTOMATE_OPERATIONS = ['ensureFolder', 'upload', 'verifyFolder', 'verifyFile'] as const;
export const POWER_AUTOMATE_RESPONSE_FIELDS = ['success','validationOnly','operation','status','correlationId','idempotencyKey','requestFingerprint','contentSha256','dealId','errorCode','errorMessage','fileMayExist','reconciliationRequired','targetPath','fileName','sharePointItemId','sharePointUniqueId','size','etag','webUrl','created','completedOn','contractVersion'] as const;

/** Exact deployed Dataverse schema names. Stale new_ names are deliberately absent. */
export const POWER_AUTOMATE_ENVIRONMENT_VARIABLE_SCHEMA_NAMES = Object.freeze({
  siteUrl: 'cr664_OGBSharePointSiteUrl', libraryName: 'cr664_OGBSharePointLibraryName',
  governedRoot: 'cr664_OGBSharePointGovernedRoot', libraryId: 'cr664_OGBSharePointLibraryId',
  graphSiteId: 'cr664_OGBSharePointGraphSiteId', graphDriveId: 'cr664_OGBSharePointGraphDriveId',
  governedRootItemId: 'cr664_OGBSharePointGovernedRootItemId', contractVersion: 'cr664_OGBSharePointContractVersion',
  transportMode: 'cr664_OGBSharePointTransportMode', maxUploadBytes: 'cr664_OGBSharePointMaxUploadBytes',
});
export const POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION = Object.freeze({
  siteUrl: 'https://oldglory22.sharepoint.com/sites/BusinessLending', libraryName: 'Documents', governedRoot: '/(a) Loans',
  libraryId: 'c1a62131-7946-44b9-bb4c-b4637a16f83c',
  graphSiteId: 'oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48',
  graphDriveId: 'b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8',
  governedRootItemId: '01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P', contractVersion: 'ogb-deal-sharepoint/v2',
  transportMode: 'DRY_RUN', maxUploadBytes: 26_214_400,
} as const);
const invalidPath = /(?:\.\.|%2e|%2f|%5c|[\\"*:<>?]|^https?:|^\/\/)/i;
export function validateGovernedSegment(value: string): boolean {
  const hasControl = [...value].some((character) => character.charCodeAt(0) < 32);
  return value.trim() === value && value.length > 0 && !hasControl && !invalidPath.test(value) && !value.includes('/');
}
export function validateTransportRequest(input: Record<string, unknown>): readonly string[] {
  const errors: string[] = [];
  if (!POWER_AUTOMATE_OPERATIONS.includes(input.operation as never)) errors.push('UNKNOWN_OPERATION');
  for (const field of ['dealId','correlationId','idempotencyKey']) if (typeof input[field] !== 'string' || !input[field]) errors.push(`MISSING_${field}`);
  for (const forbidden of ['siteUrl','libraryName','governedRoot','authorizationResult','callerEmail','callerObjectId','overwrite','rename']) if (forbidden in input) errors.push(`CALLER_OVERRIDE_${forbidden}`);
  if (typeof input.folderName === 'string' && !validateGovernedSegment(input.folderName)) errors.push('INVALID_FOLDER_NAME');
  if (typeof input.fileName === 'string' && !validateGovernedSegment(input.fileName)) errors.push('INVALID_FILE_NAME');
  if (typeof input.expectedSize === 'number' && (input.expectedSize < 1 || input.expectedSize > POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION.maxUploadBytes)) errors.push('INVALID_EXPECTED_SIZE');
  return errors;
}
export type LedgerReplayDecision = 'CREATE_STARTED'|'RETURN_COMPLETED'|'IDEMPOTENCY_COLLISION'|'IN_PROGRESS'|'RETRY_REQUIRES_RECONCILIATION';
export function resolveLedgerReplay(existing: { status: string; fingerprint: string }|undefined, fingerprint: string): LedgerReplayDecision {
  if (!existing) return 'CREATE_STARTED';
  if (existing.fingerprint !== fingerprint) return 'IDEMPOTENCY_COLLISION';
  if (existing.status === 'COMPLETED' || existing.status === 'DRY_RUN_COMPLETED') return 'RETURN_COMPLETED';
  if (['STARTED','FOLDER_CREATE_PENDING','FOLDER_CREATED','FILE_CREATE_PENDING','FILE_CREATED','VERIFY_PENDING'].includes(existing.status)) return 'IN_PROGRESS';
  return 'RETRY_REQUIRES_RECONCILIATION';
}

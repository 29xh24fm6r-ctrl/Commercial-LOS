import type { IOperationResult } from '@microsoft/power-apps/data';
import type { ManualTriggerInput, ResponseActionOutput } from '../../generated/models/OGBOriginationSharePointTransportModel';
import { OGBOriginationSharePointTransportService } from '../../generated/services/OGBOriginationSharePointTransportService';
import type { PowerAutomateTransportRequest } from '../../../microsoft365/sharepoint-transport/power-automate/activationContract';
import { DEAL_DOCUMENT_STORAGE_MODE } from './dealDocumentStorageMode';
import { registerGeneratedDealSharePointDryRunRuntime } from './dealSharePointDryRunRuntime';
import { DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID, type GeneratedPowerAutomateRunner } from './dealSharePointPowerAutomateTransport';

export const OGB_SHAREPOINT_GENERATED_SERVICE = 'OGBOriginationSharePointTransportService';
export const OGB_SHAREPOINT_GENERATED_METHOD = 'Run';
export const OGB_SHAREPOINT_GENERATED_PARAMETERS = Object.freeze([
  'text', 'text_1', 'text_2', 'text_3', 'text_4', 'text_5', 'text_6',
  'text_7', 'text_8', 'text_9', 'text_10', 'number', 'file', 'text_11',
] as const);

function describeOperationError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return 'No error detail was returned.';
}

export function toGeneratedTransportInput(request: PowerAutomateTransportRequest): ManualTriggerInput {
  return {
    text: request.operation, text_1: request.dealId, text_2: request.correlationId,
    text_3: request.idempotencyKey, text_4: request.annualFolderName ?? '',
    text_5: request.folderName ?? '', text_6: request.fileName ?? '', text_7: request.mimeType ?? '',
    text_8: request.contentSha256 ?? '', text_9: request.expectedSharePointItemId ?? '',
    text_10: request.expectedUniqueId ?? '', number: request.expectedSize ?? 0,
    file: request.fileContent ?? { name: '', contentBytes: '' }, text_11: request.requestFingerprint ?? '',
  };
}

export function createGeneratedOgbSharePointTransportRunner(
  run: (input: ManualTriggerInput) => Promise<IOperationResult<ResponseActionOutput>> = OGBOriginationSharePointTransportService.Run.bind(OGBOriginationSharePointTransportService),
): GeneratedPowerAutomateRunner {
  return { async run(request) {
    const result = await run(toGeneratedTransportInput(request));
    if (!result.success) throw new Error(`OGB_SHAREPOINT_TRANSPORT_RUN_FAILED: ${describeOperationError(result.error)}`);
    const envelope = result.data?.transportresponse;
    if (typeof envelope !== 'string' || envelope.trim() === '') throw new Error('OGB_SHAREPOINT_TRANSPORT_MALFORMED_PLATFORM_RESPONSE');
    try { return JSON.parse(envelope) as unknown; }
    catch { throw new Error('OGB_SHAREPOINT_TRANSPORT_MALFORMED_PLATFORM_RESPONSE'); }
  } };
}

/** Registers only the inspected, platform-generated Developer DRY_RUN boundary. */
export function registerOgbSharePointGeneratedDryRunRuntime(): void {
  if (DEAL_DOCUMENT_STORAGE_MODE !== 'DRY_RUN') return;
  registerGeneratedDealSharePointDryRunRuntime(createGeneratedOgbSharePointTransportRunner(), {
    requestedProvider: 'POWER_AUTOMATE', storageMode: DEAL_DOCUMENT_STORAGE_MODE,
    registration: {
      provider: 'POWER_AUTOMATE', workflowId: DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID,
      generatedServiceName: OGB_SHAREPOINT_GENERATED_SERVICE, generatedRunMethod: OGB_SHAREPOINT_GENERATED_METHOD,
      generatedParameterNames: OGB_SHAREPOINT_GENERATED_PARAMETERS, connectionReferenceBound: true,
      environmentConfigurationVerified: true, authenticatedActorResolutionVerified: true,
      serverAuthorizationVerified: true, idempotencyLedgerVerified: true,
      sharePointReadbackVerified: false, reconciliationVerified: false,
    },
  });
}

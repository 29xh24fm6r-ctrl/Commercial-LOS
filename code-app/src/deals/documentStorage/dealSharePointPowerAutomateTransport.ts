import type { DealSharePointDocumentPort } from './dealSharePointDocumentPort';
import { unavailableDealSharePointDocumentPort } from './dealSharePointDocumentPort';
import type { DealSharePointFolderIdentity, DealSharePointFileReference } from './dealDocumentStorageTypes';
import { POWER_AUTOMATE_ENVIRONMENT_VARIABLES } from '../../../microsoft365/sharepoint-transport/power-automate/transportContract';
import { parseTransportResponse, type PowerAutomateTransportRequest } from '../../../microsoft365/sharepoint-transport/power-automate/activationContract';

export const DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID = '9448ac11-f490-f111-8076-7ced8d3bafd4';
export const DEAL_SHAREPOINT_POWER_AUTOMATE_OPERATIONS = Object.freeze(['ensureFolder', 'upload', 'verifyFolder', 'verifyFile'] as const);
export type DealSharePointTransportProvider = 'AZURE_FUNCTION' | 'POWER_AUTOMATE';

export interface DealSharePointPowerAutomateRegistration {
  readonly provider: DealSharePointTransportProvider;
  readonly workflowId: typeof DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID;
  readonly generatedServiceName?: string;
  readonly generatedRunMethod?: string;
  readonly generatedParameterNames?: readonly string[];
  readonly connectionReferenceBound: boolean;
  readonly environmentConfigurationVerified: boolean;
  readonly authenticatedActorResolutionVerified: boolean;
  readonly serverAuthorizationVerified: boolean;
  readonly idempotencyLedgerVerified: boolean;
  readonly sharePointReadbackVerified: boolean;
  readonly reconciliationVerified: boolean;
}
export interface DealSharePointPowerAutomateSelection {
  readonly requestedProvider?: string;
  readonly storageMode?: string;
  readonly registration?: Partial<DealSharePointPowerAutomateRegistration>;
}
export interface GeneratedPowerAutomateRunner { run(request: PowerAutomateTransportRequest): Promise<unknown> }
function lastSegment(path:string):string{return path.split('/').filter(Boolean).at(-1)??''}
function bytesToBase64(bytes:Uint8Array):string{let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
function failureKind(code:string):'configuration_required'|'unauthorized'|'collision'|'failed'{if(code==='CONFIGURATION_REQUIRED'||code==='ACTOR_IDENTITY_CONTEXT_UNAVAILABLE')return'configuration_required';if(code.startsWith('ACTOR_')||code==='DEAL_ACCESS_DENIED'||code==='DEAL_NOT_FOUND')return'unauthorized';if(code.endsWith('_COLLISION')||code==='IDEMPOTENCY_COLLISION')return'collision';return'failed'}

/** Maps the generated Power Apps flow Run seam to the existing document port. The generated service name is injected after platform generation. */
export function createGeneratedPowerAutomateDocumentPort(runner:GeneratedPowerAutomateRunner):DealSharePointDocumentPort{
  return{
    async ensureFolder(request){
      if(request.siteUrl!==POWER_AUTOMATE_ENVIRONMENT_VARIABLES.new_OGBSharePointSiteUrl||request.libraryName!==POWER_AUTOMATE_ENVIRONMENT_VARIABLES.new_OGBSharePointLibraryName)return{ok:false,kind:'configuration_required',reason:'The requested SharePoint target does not match the governed environment configuration.'};
      const transportRequest:PowerAutomateTransportRequest={operation:'ensureFolder',dealId:request.dealId,correlationId:request.correlationId,idempotencyKey:`folder:${request.dealId}`,annualFolderName:lastSegment(request.annualFolderPath),folderName:lastSegment(request.companyFolderPath)};
      try{const response=parseTransportResponse(await runner.run(transportRequest),transportRequest);if(!response.success)return{ok:false,kind:failureKind(response.errorCode),reason:response.errorMessage};const now=response.completedOn;const folder:DealSharePointFolderIdentity={dealId:request.dealId,borrowerIdentity:request.borrowerIdentity,siteUrl:request.siteUrl,libraryName:request.libraryName,annualFolderPath:request.annualFolderPath,companyFolderPath:request.companyFolderPath,folderUrl:response.webUrl,folderItemId:response.sharePointItemId||undefined,status:'READY',createdOn:now,createdBy:request.actorSystemUserId,lastVerifiedOn:now,namingSource:'BORROWER_LEGAL_NAME',configurationVersion:response.contractVersion};return{ok:true,folder,created:response.created}}catch{return{ok:false,kind:'failed',reason:'The governed SharePoint flow returned an invalid or unavailable response.'}}
    },
    async upload(input){
      const transportRequest:PowerAutomateTransportRequest={operation:'upload',dealId:input.dealId,correlationId:input.correlationId,idempotencyKey:`upload:${input.dealId}:${input.documentId}`,annualFolderName:lastSegment(input.folder.annualFolderPath),folderName:lastSegment(input.folder.companyFolderPath),fileName:input.storedFileName,mimeType:input.file.mimeType,fileContent:{name:input.storedFileName,contentBytes:bytesToBase64(input.file.content)},expectedSize:input.file.content.byteLength};
      try{const response=parseTransportResponse(await runner.run(transportRequest),transportRequest);if(!response.success)return{ok:false,kind:failureKind(response.errorCode)==='unauthorized'?'unauthorized':response.errorCode==='INVALID_REQUEST'||response.errorCode==='INVALID_PATH'?'invalid_file':'failed',reason:response.errorMessage,fileMayExist:response.fileMayExist||response.reconciliationRequired};const reference:DealSharePointFileReference={documentId:input.documentId,dealId:input.dealId,requirementIds:input.requirementIds,storageProvider:'SHAREPOINT',siteUrl:input.folder.siteUrl,libraryName:input.folder.libraryName,folderPath:input.folder.companyFolderPath,fileUrl:response.webUrl,itemId:response.sharePointItemId,originalFileName:input.file.originalFileName,storedFileName:input.storedFileName,mimeType:input.file.mimeType,fileSizeBytes:response.size,uploadStatus:'SHAREPOINT_STORED',uploadedOn:response.completedOn,uploadedBy:input.actorSystemUserId,verifiedOn:response.completedOn,activeVersion:true,replacesDocumentId:input.replacesDocumentId};return{ok:true,reference}}catch{return{ok:false,kind:'failed',reason:'The governed SharePoint flow returned an invalid or unavailable response.',fileMayExist:false}}
    },
    async verifyFolder(folder){const request:PowerAutomateTransportRequest={operation:'verifyFolder',dealId:folder.dealId,correlationId:crypto.randomUUID(),idempotencyKey:`verify-folder:${folder.dealId}:${folder.folderItemId??folder.companyFolderPath}`,annualFolderName:lastSegment(folder.annualFolderPath),folderName:lastSegment(folder.companyFolderPath),expectedSharePointItemId:folder.folderItemId};try{return parseTransportResponse(await runner.run(request),request).success}catch{return false}},
    async verifyFile(reference){const request:PowerAutomateTransportRequest={operation:'verifyFile',dealId:reference.dealId,correlationId:crypto.randomUUID(),idempotencyKey:`verify-file:${reference.dealId}:${reference.documentId}`,annualFolderName:lastSegment(reference.folderPath.split('/').slice(0,-1).join('/')),folderName:lastSegment(reference.folderPath),fileName:reference.storedFileName,expectedSize:reference.fileSizeBytes,expectedSharePointItemId:reference.itemId};try{return parseTransportResponse(await runner.run(request),request).success}catch{return false}},
  }
}

export function verifyDealSharePointPowerAutomateRegistration(selection: DealSharePointPowerAutomateSelection) {
  const reasons: string[] = [];
  const registration = selection.registration;
  if (selection.storageMode !== 'LIVE') reasons.push('Document storage mode is not LIVE.');
  if (selection.requestedProvider !== 'POWER_AUTOMATE') reasons.push('Power Automate was not explicitly selected.');
  if (registration?.provider !== 'POWER_AUTOMATE') reasons.push('The registered provider is not Power Automate.');
  if (registration?.workflowId !== DEAL_SHAREPOINT_POWER_AUTOMATE_WORKFLOW_ID) reasons.push('The approved workflow ID is not registered.');
  if (!registration?.generatedServiceName?.trim()) reasons.push('The generated flow service has not been inspected.');
  if (!registration?.generatedRunMethod?.trim()) reasons.push('The generated flow Run method has not been inspected.');
  if (!registration?.generatedParameterNames?.length) reasons.push('The generated flow parameter contract has not been inspected.');
  if (!registration?.connectionReferenceBound) reasons.push('The flow connection reference is not verified as bound.');
  if (!registration?.environmentConfigurationVerified) reasons.push('The immutable environment configuration is not verified.');
  if (!registration?.authenticatedActorResolutionVerified) reasons.push('Authenticated actor resolution is not verified.');
  if (!registration?.serverAuthorizationVerified) reasons.push('Server-side deal authorization is not verified.');
  if (!registration?.idempotencyLedgerVerified) reasons.push('The durable idempotency ledger is not verified.');
  if (!registration?.sharePointReadbackVerified) reasons.push('SharePoint readback is not verified.');
  if (!registration?.reconciliationVerified) reasons.push('Reconciliation is not verified.');
  return reasons.length
    ? { ready: false as const, reasons }
    : { ready: true as const, registration: registration as DealSharePointPowerAutomateRegistration };
}

/** Generated client names remain deliberately absent until Power Apps integration emits and exposes the exact Run signature. */
export function buildDealSharePointPowerAutomateTransport(
  selection: DealSharePointPowerAutomateSelection,
  generatedAdapter?: DealSharePointDocumentPort,
): DealSharePointDocumentPort {
  const readiness = verifyDealSharePointPowerAutomateRegistration(selection);
  return readiness.ready && generatedAdapter ? generatedAdapter : unavailableDealSharePointDocumentPort;
}

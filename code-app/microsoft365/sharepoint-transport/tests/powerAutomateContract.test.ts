import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION, POWER_AUTOMATE_ENVIRONMENT_VARIABLE_SCHEMA_NAMES, POWER_AUTOMATE_OPERATIONS, POWER_AUTOMATE_RESPONSE_FIELDS, resolveLedgerReplay, validateTransportRequest } from '../power-automate/transportContract.js';
const flowPath=resolve('power-platform/solutions/CommercialLendingLOS/Workflows/OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json');
const reconciliationPath=resolve('power-platform/solutions/CommercialLendingLOS/Workflows/OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json');
const transportMetadataPath=flowPath+'.data.xml';
const reconciliationMetadataPath=reconciliationPath+'.data.xml';
const manifestPath=resolve('power-platform/solutions/CommercialLendingLOS/PowerAutomateOwned/activation-manifest.json');
function findAction(value: unknown, actionName: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record=value as Record<string,unknown>; const actions=record.actions as Record<string,unknown>|undefined;
  if(actions?.[actionName] && typeof actions[actionName]==='object') return actions[actionName] as Record<string,unknown>;
  for(const child of Object.values(record)){const found=findAction(child,actionName);if(found)return found}
  return undefined;
}
describe('solution-aware Power Automate transport contract',()=>{
 it('rejects unknown operations, traversal, and caller-controlled targets or authorization',()=>{
  expect(validateTransportRequest({operation:'delete',dealId:'d',correlationId:'c',idempotencyKey:'i'})).toContain('UNKNOWN_OPERATION');
  expect(validateTransportRequest({operation:'upload',dealId:'d',correlationId:'c',idempotencyKey:'i',fileName:'../x.pdf'})).toContain('INVALID_FILE_NAME');
  expect(validateTransportRequest({operation:'upload',dealId:'d',correlationId:'c',idempotencyKey:'i',siteUrl:'https://evil',authorizationResult:true})).toEqual(expect.arrayContaining(['CALLER_OVERRIDE_siteUrl','CALLER_OVERRIDE_authorizationResult']));
 });
 it('models replay, collision, in-progress, and reconciliation decisions',()=>{
  expect(resolveLedgerReplay(undefined,'a')).toBe('CREATE_STARTED');
  expect(resolveLedgerReplay({status:'COMPLETED',fingerprint:'a'},'a')).toBe('RETURN_COMPLETED');
  expect(resolveLedgerReplay({status:'COMPLETED',fingerprint:'a'},'b')).toBe('IDEMPOTENCY_COLLISION');
  expect(resolveLedgerReplay({status:'FILE_CREATED',fingerprint:'a'},'a')).toBe('IN_PROGRESS');
  expect(resolveLedgerReplay({status:'FAILED',fingerprint:'a'},'a')).toBe('RETRY_REQUIRES_RECONCILIATION');
 });
 it('contains stable trigger, response, router, fail-closed seam, and solution references',()=>{
  const flow=JSON.parse(readFileSync(flowPath,'utf8')); const schema=flow.properties.definition.triggers.manual.inputs.schema;
  expect(schema.required).toEqual(['text','text_1','text_2','text_3','text_4','text_5','text_6','text_7','text_8','text_9','text_10','number','file','text_11']);
  expect(Object.values(schema.properties).map((property)=>String((property as {title?:unknown}).title))).toEqual(expect.arrayContaining(['operation','dealId','correlationId','idempotencyKey','fileContent','expectedSize','expectedSharePointItemId','expectedUniqueId','requestFingerprint']));
  for(const action of ['Get_my_profile_(V2)','Resolve_active_platform_user','Resolve_active_banker','Resolve_assigned_active_deal','Load_exact_cr664_environment_configuration','Read_durable_transport_ledger','Reserve_durable_DRY_RUN_ledger','Complete_durable_DRY_RUN_ledger','Read_back_durable_DRY_RUN_ledger','Respond_to_a_Power_App_or_flow']) expect(findAction(flow,action)).toBeDefined();
  const source=JSON.stringify(flow); for(const operation of POWER_AUTOMATE_OPERATIONS) expect(source).toContain(operation);
  for(const field of POWER_AUTOMATE_RESPONSE_FIELDS) expect(source).toContain(field);
  expect(Object.keys(flow.properties.connectionReferences)).toEqual(expect.arrayContaining(['shared_office365users','shared_commondataserviceforapps']));
  expect(Object.keys(flow.properties.connectionReferences)).not.toContain('new_sharedsharepointonline_b8f0b');
 });
 it('keeps configuration non-secret and reconciliation development-safe',()=>{
  expect(POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION.transportMode).toBe('DRY_RUN');
  expect(POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION.contractVersion).toBe('ogb-deal-sharepoint/v2');
  expect(POWER_AUTOMATE_ENVIRONMENT_VARIABLE_SCHEMA_NAMES.libraryId).toBe('cr664_OGBSharePointLibraryId');
  expect(JSON.stringify(POWER_AUTOMATE_ENVIRONMENT_VARIABLE_SCHEMA_NAMES)).not.toMatch(/new_OGBSharePoint|ListId/);
  expect(JSON.stringify(POWER_AUTOMATE_ENVIRONMENT_CONFIGURATION)).not.toMatch(/token|secret|password|connectionId/i);
  const flow=JSON.parse(readFileSync(reconciliationPath,'utf8'));
  expect(flow.properties.definition.triggers.recurrence.recurrence.startTime).toBe('2026-08-08T00:00:00Z');
  expect(flow.properties.definition.actions.Terminate_without_mutation.inputs.runStatus).toBe('Failed');
 });
 it('keeps both workflows inactive and contains no SharePoint mutation action',()=>{
  for(const path of [transportMetadataPath,reconciliationMetadataPath]){const xml=readFileSync(path,'utf8');expect(xml).toContain('<StateCode>0</StateCode>');expect(xml).toContain('<StatusCode>1</StatusCode>')}
  const workflowSource=readFileSync(flowPath,'utf8')+readFileSync(reconciliationPath,'utf8');
  expect(workflowSource).not.toMatch(/Create file|Create new folder|Delete file|Move file|Copy file|Update file/i);
  const reconciliation=JSON.parse(readFileSync(reconciliationPath,'utf8'));
  expect(reconciliation.properties.definition.actions.Reconciliation_is_blocked.inputs).toMatchObject({status:'BLOCKED',automaticDelete:false,automaticOverwrite:false});
 });
 it('uses only exact cr664 transport variable names and declares validation-only completion',()=>{
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  expect(manifest.environmentVariableSchemaNames).toEqual(Object.values(POWER_AUTOMATE_ENVIRONMENT_VARIABLE_SCHEMA_NAMES));
  expect(manifest.ledger.statuses).toContain('DRY_RUN_COMPLETED');
  expect(manifest.dryRunSemantics).toMatchObject({success:false,validationOnly:true,sharePointMutationAllowed:false,createsFolderIdentity:false,createsFileReference:false,satisfiesDocumentRequirement:false});
  expect(JSON.stringify(manifest.environmentVariableSchemaNames)).not.toMatch(/new_OGBSharePoint|ListId/);
 });
});

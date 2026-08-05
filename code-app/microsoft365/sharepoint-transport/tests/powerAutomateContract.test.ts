import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { POWER_AUTOMATE_ENVIRONMENT_VARIABLES, POWER_AUTOMATE_OPERATIONS, POWER_AUTOMATE_RESPONSE_FIELDS, resolveLedgerReplay, validateTransportRequest } from '../power-automate/transportContract.js';
const flowPath=resolve('power-platform/solutions/CommercialLendingLOS/Workflows/OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json');
const reconciliationPath=resolve('power-platform/solutions/CommercialLendingLOS/Workflows/OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json');
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
  expect(schema.required).toEqual(['operation','dealId','correlationId','idempotencyKey']);
  expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['fileContent','expectedSize','expectedSharePointItemId','expectedUniqueId']));
  expect(Object.keys(flow.properties.definition.actions.Route_operation.cases)).toEqual(POWER_AUTOMATE_OPERATIONS);
  expect(flow.properties.definition.actions.Governed_fail_closed_response.inputs.errorCode).toBe('AUTHORIZATION_ADAPTER_UNRESOLVED');
  for(const field of POWER_AUTOMATE_RESPONSE_FIELDS) expect(flow.properties.definition.actions.Governed_fail_closed_response.inputs).toHaveProperty(field);
  expect(Object.keys(flow.properties.connectionReferences)).toEqual(expect.arrayContaining(['new_sharedsharepointonline_b8f0b','new_commondataserviceforapps_ogblos']));
 });
 it('keeps configuration non-secret and reconciliation development-safe',()=>{
  expect(POWER_AUTOMATE_ENVIRONMENT_VARIABLES.new_OGBSharePointTransportMode).toBe('DRY_RUN');
  expect(JSON.stringify(POWER_AUTOMATE_ENVIRONMENT_VARIABLES)).not.toMatch(/token|secret|password|connectionId/i);
  const flow=JSON.parse(readFileSync(reconciliationPath,'utf8'));
  expect(flow.properties.definition.triggers.recurrence.recurrence.startTime).toBe('2099-01-01T00:00:00Z');
  expect(flow.properties.definition.actions.Terminate_without_mutation.inputs.runStatus).toBe('Cancelled');
 });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;

describe('governed Copilot email-service-request deployment package', () => {
  it('is additive, audited, and contains no destructive schema operations', () => {
    const plan = json<{ mutationSemantics: string; destructiveOperations: unknown[]; tables: { logicalName: string; auditEnabled: boolean }[]; columns: unknown[]; relationships: unknown[] }>('deployment/copilot-email-service-request/dataverse-schema-plan.json');
    expect(plan.mutationSemantics).toBe('CREATE_MISSING_ONLY');
    expect(plan.destructiveOperations).toEqual([]);
    expect(plan.tables.map(table => table.logicalName)).toEqual(expect.arrayContaining(['cr664_emailservicerequestintake', 'cr664_emailautomationpermission']));
    expect(plan.tables.every(table => table.auditEnabled)).toBe(true);
    expect(plan.columns.length).toBeGreaterThanOrEqual(25);
    expect(plan.relationships.length).toBeGreaterThanOrEqual(6);
  });

  it('registers the exact transactional Custom API and direct-task-write guard', () => {
    const api = json<{ pluginType: string; uniqueName: string; requestParameters: { uniqueName: string }[] }>('dataverse-plugins/CommercialLendingLOS.Plugins/EmailServiceRequestCustomApiRegistration.json');
    const guard = json<{ pluginType: string; steps: { message: string; primaryEntity: string; stage: number; mode: number; enabled: boolean }[] }>('dataverse-plugins/CommercialLendingLOS.Plugins/EmailAutomationDirectTaskWriteGuardRegistration.json');
    expect(api).toMatchObject({ pluginType: 'CommercialLendingLOS.Plugins.EmailServiceRequestIntakePlugin', uniqueName: 'cr664_ProcessInboundServiceRequest' });
    expect(api.requestParameters.map(parameter => parameter.uniqueName)).toEqual(expect.arrayContaining(['InternetMessageId', 'ContentHash', 'Confidence', 'MatchStatus', 'UsedProtectedCharacteristic']));
    expect(guard.steps).toHaveLength(2);
    expect(guard.steps).toEqual(expect.arrayContaining(['cr664_dealtask1', 'cr664_emailservicerequestintake'].map(primaryEntity => expect.objectContaining({ message: 'Create', primaryEntity, stage: 20, mode: 0, enabled: true }))));
  });

  it('forces Outlook and Copilot through the Custom API and prohibits direct task creation or communication', () => {
    const flow = json<{ settings: Record<string, unknown>; steps: { action: string; operationName?: string }[]; prohibitedActions: string[]; disabledByDefault: boolean }>('microsoft365/power-automate/email-service-request-flow-contract.json');
    const agent = json<{ nonAutonomousActions: string[]; releaseGate: string; monitoring: { evidence: string[] } }>('microsoft365/copilot-studio/email-service-request-agent-contract.json');
    expect(flow.settings).toMatchObject({ concurrencyControl: true, degreeOfParallelism: 1, secureInputs: true, secureOutputs: true });
    expect(flow.steps).toContainEqual(expect.objectContaining({ action: 'invokeDataverseCustomApi', operationName: 'cr664_ProcessInboundServiceRequest' }));
    expect(flow.prohibitedActions.join(' ')).toMatch(/Add a new row.*cr664_dealtask1/i);
    expect(flow.prohibitedActions.join(' ')).toMatch(/send email/i);
    expect(flow.disabledByDefault).toBe(true);
    expect(agent.nonAutonomousActions.join(' ')).toMatch(/approve credit/i);
    expect(agent.monitoring.evidence).toEqual(expect.arrayContaining(['task', 'audit event', 'deal timeline event']));
    expect(agent.releaseGate).toMatch(/before trigger enablement/i);
  });

  it('contains no secrets or persisted token material', () => {
    const files = [
      'microsoft365/power-automate/email-service-request-flow-contract.json',
      'microsoft365/copilot-studio/email-service-request-agent-contract.json',
      'scripts/dataverse/provision-email-automation-permission.ps1',
    ].map(path => readFileSync(resolve(root, path), 'utf8')).join('\n');
    expect(files).not.toMatch(/client[_-]?secret\s*[:=]\s*["'][^"']+/i);
    expect(files).not.toMatch(/access[_-]?token\s*[:=]\s*["'][^"']+/i);
  });
});

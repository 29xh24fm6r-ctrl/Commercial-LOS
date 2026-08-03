import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const json = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as T;

describe('credit intelligence deployment artifacts', () => {
  it('defines an additive audited Dataverse schema with the runtime tables', () => {
    const plan = json<{ mutationSemantics: string; destructiveOperations: unknown[]; tables: { logicalName: string; auditEnabled: boolean }[]; relationships: unknown[] }>('deployment/copilot-credit-intelligence/dataverse-schema-plan.json');
    expect(plan.mutationSemantics).toBe('CREATE_MISSING_ONLY');
    expect(plan.destructiveOperations).toEqual([]);
    expect(plan.tables.map(table => table.logicalName)).toEqual(expect.arrayContaining([
      'cr664_creditintelligencerun', 'cr664_creditevidence', 'cr664_creditfact',
      'cr664_creditintelligencepermission', 'cr664_creditintelligencesource',
    ]));
    expect(plan.tables.every(table => table.auditEnabled)).toBe(true);
    expect(plan.relationships.length).toBeGreaterThanOrEqual(10);
  });

  it('registers the exact six-tool Custom API as synchronous server logic', () => {
    const manifest = json<{ pluginType: string; uniqueName: string; requestParameters: { uniqueName: string }[]; responseProperties: { uniqueName: string }[] }>('dataverse-plugins/CommercialLendingLOS.Plugins/CreditIntelligenceCustomApiRegistration.json');
    expect(manifest.pluginType).toBe('CommercialLendingLOS.Plugins.CreditIntelligenceCustomApiPlugin');
    expect(manifest.uniqueName).toBe('cr664_RunCreditIntelligence');
    expect(manifest.requestParameters.map(item => item.uniqueName)).toContain('RequestedSourceIdsJson');
    expect(manifest.responseProperties.map(item => item.uniqueName)).toEqual(['ResultJson']);
  });

  it('keeps Azure grounding passwordless, authenticated, ACL-filtered, and non-public', () => {
    const bicep = readFileSync(resolve(root, 'azure/copilot-credit-intelligence/main.bicep'), 'utf8');
    const handler = readFileSync(resolve(root, 'azure/copilot-credit-intelligence/function-app/index.mjs'), 'utf8');
    expect(bicep).toContain('disableLocalAuth: true');
    expect(bicep).toContain('requireAuthentication: true');
    expect(bicep).toContain('allowSharedKeyAccess: false');
    expect(handler).toContain("x-ms-client-principal");
    expect(handler).toContain('principals/any');
    expect(handler).not.toMatch(/console\.log|access_token\}\)|IDENTITY_HEADER\}/);
  });

  it('requires citations, human decisions, DLP, Purview, and adversarial evaluation', () => {
    const controls = json<{ responsibleAi: Record<string, boolean>; dlp: { crossGroupDataMovement: string }; purview: { audit: string[] } }>('microsoft365/copilot-studio/security-and-compliance-contract.json');
    const evaluation = json<{ mandatoryCases: { id: string; adversarial?: boolean }[]; releaseGate: string }>('microsoft365/copilot-studio/agent-evaluation-suite.json');
    expect(controls.responsibleAi.humanDecisionRequired).toBe(true);
    expect(controls.responsibleAi.citationsRequired).toBe(true);
    expect(controls.dlp.crossGroupDataMovement).toBe('blocked');
    expect(controls.purview.audit).toContain('CopilotInteraction');
    expect(evaluation.mandatoryCases.filter(item => item.adversarial)).toHaveLength(6);
    expect(evaluation.releaseGate).toMatch(/All mandatory cases must pass/);
  });
});

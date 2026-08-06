import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflows = resolve(process.cwd(), 'power-platform/solutions/CommercialLendingLOS/Workflows');
const transportName = 'OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json';
const reconciliationName = 'OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json';

function text(name: string): string {
  return readFileSync(resolve(workflows, name), 'utf8');
}

describe('inactive Power Automate workflow source', () => {
  it('keeps both exact workflow records inactive', () => {
    for (const name of [transportName, reconciliationName]) {
      const metadata = text(`${name}.data.xml`);
      expect(metadata).toContain('<StateCode>1</StateCode>');
      expect(metadata).toContain('<StatusCode>2</StatusCode>');
    }
  });

  it('uses the exact v2 cr664 configuration contract and no stale variable names', () => {
    const source = text(transportName);
    const definition = JSON.parse(source) as {
      properties: { definition: { actions: { Load_exact_cr664_environment_configuration: { inputs: { schemaNames: string[]; rejectStalePrefix: string } } } } };
    };
    const configuration = definition.properties.definition.actions.Load_exact_cr664_environment_configuration.inputs;
    expect(source).toContain('ogb-deal-sharepoint/v2');
    expect(configuration.schemaNames).toContain('cr664_OGBSharePointLibraryId');
    expect(configuration.schemaNames).toHaveLength(10);
    expect(configuration.schemaNames.every((name) => name.startsWith('cr664_OGBSharePoint'))).toBe(true);
    expect(configuration.rejectStalePrefix).toBe('new_OGBSharePoint');
    expect(source).toContain('cr664_sharepointtransportledger');
    expect(source).toContain('DRY_RUN_COMPLETED');
    expect(configuration.schemaNames).not.toContain('cr664_OGBSharePointListId');
  });

  it('contains no SharePoint mutation operation while implementation is inactive', () => {
    const source = `${text(transportName)}\n${text(reconciliationName)}`;
    expect(source).not.toMatch(/Create file|Create new folder|Delete file|Move file|Copy file|Update file/i);
  });

  it('keeps reconciliation read-only, non-destructive, and unable to fabricate completion', () => {
    const definition = JSON.parse(text(reconciliationName)) as {
      properties: { definition: { triggers: { recurrence: { recurrence: { startTime: string } } }; actions: Record<string, { inputs?: unknown }> } };
    };
    expect(definition.properties.definition.triggers.recurrence.recurrence.startTime).toBe('2099-01-01T00:00:00Z');
    expect(definition.properties.definition.actions.Inspect_unresolved_ledger_plan.inputs).toMatchObject({
      readOnly: true,
      automaticDelete: false,
      automaticOverwrite: false,
      automaticRename: false,
      fabricateCompletion: false,
    });
  });
});

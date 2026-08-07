import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflows = resolve(process.cwd(), 'power-platform/solutions/CommercialLendingLOS/Workflows');
const transportName = 'OGBOriginationSharePointTransport-9448AC11-F490-F111-8076-7CED8D3BAFD4.json';
const reconciliationName = 'OGBOriginationSharePointTransportReconciliation-F4637494-69F5-4D79-9F8B-0BE46A36E71F.json';

function text(name: string): string {
  return readFileSync(resolve(workflows, name), 'utf8');
}

function findAction(value: unknown, actionName: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const actions = record.actions as Record<string, unknown> | undefined;
  if (actions?.[actionName] && typeof actions[actionName] === 'object') return actions[actionName] as Record<string, unknown>;
  for (const child of Object.values(record)) {
    const found = findAction(child, actionName);
    if (found) return found;
  }
  return undefined;
}

describe('inactive Power Automate workflow source', () => {
  it('keeps both exact workflow records inactive', () => {
    for (const name of [transportName, reconciliationName]) {
      const metadata = text(`${name}.data.xml`);
      expect(metadata).toContain('<StateCode>0</StateCode>');
      expect(metadata).toContain('<StatusCode>1</StatusCode>');
    }
  });

  it('uses the exact v2 cr664 configuration contract and no stale variable names', () => {
    const source = text(transportName);
    const definition = JSON.parse(source) as unknown;
    const action = findAction(definition, 'Load_exact_cr664_environment_configuration');
    const parameters = (action?.inputs as { parameters?: Record<string, unknown> } | undefined)?.parameters;
    const filter = String(parameters?.['$filter'] ?? '');
    const schemaNames = [...filter.matchAll(/schemaname eq '([^']+)'/g)].map((match) => match[1]);
    expect(source).toContain('ogb-deal-sharepoint%2Fv2');
    expect(schemaNames).toContain('cr664_OGBSharePointLibraryId');
    expect(schemaNames).toHaveLength(10);
    expect(schemaNames.every((name) => name.startsWith('cr664_OGBSharePoint'))).toBe(true);
    expect(source).not.toContain('new_OGBSharePoint');
    expect(source).toContain('cr664_sharepointtransportledger');
    expect(source).toContain('DRY_RUN_COMPLETED');
    expect(schemaNames).not.toContain('cr664_OGBSharePointListId');
  });

  it('contains no SharePoint mutation operation while implementation is inactive', () => {
    const source = `${text(transportName)}\n${text(reconciliationName)}`;
    expect(source).not.toMatch(/Create file|Create new folder|Delete file|Move file|Copy file|Update file/i);
  });

  it('keeps reconciliation read-only, non-destructive, and unable to fabricate completion', () => {
    const definition = JSON.parse(text(reconciliationName)) as {
      properties: { definition: { triggers: { recurrence: { recurrence: { startTime: string } } }; actions: Record<string, { inputs?: unknown }> } };
    };
    expect(definition.properties.definition.triggers.recurrence.recurrence.startTime).toBe('2026-08-08T00:00:00Z');
    expect(definition.properties.definition.actions.Reconciliation_is_blocked.inputs).toMatchObject({
      status: 'BLOCKED',
      automaticDelete: false,
      automaticOverwrite: false,
    });
  });
});

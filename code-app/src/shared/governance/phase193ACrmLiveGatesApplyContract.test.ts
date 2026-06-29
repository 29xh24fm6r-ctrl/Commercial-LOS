import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCrmSpineSchemaOrchestrator } from '../../crm/crmSalesforceSpineApplyOrchestrator';

/**
 * Phase 193A — CRM live gates + apply orchestrator governance.
 *
 * Static pins prove the gates/orchestrator carry no destructive verbs, no SDK/
 * fetch, no flag flip, no schema/migration files. Runtime pins prove default
 * behavior is no-write: inspect/plan/dry-run execute nothing and live apply
 * blocks unless the hard gates are satisfied AND an executor is wired.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const GATES = read('crm', 'crmSalesforceSpineLiveGates.ts');
const ORCH = read('crm', 'crmSalesforceSpineApplyOrchestrator.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const SOURCES = [
  { file: 'crmSalesforceSpineLiveGates.ts', code: GATES },
  { file: 'crmSalesforceSpineApplyOrchestrator.ts', code: ORCH },
];

describe('no destructive verbs / network / SDK', () => {
  it('contains no delete operation and no PublishXml outside a gated path', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(deleteRecord|deleteMultiple|DeleteEntity|DeleteAttribute|dropTable)\b/);
      expect(code, file).not.toMatch(/method:\s*['"]DELETE['"]/);
      expect(code, file).not.toMatch(/PublishXml/);
    }
  });

  it('opens no fetch / network call and imports no Dataverse SDK / generated service', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
      expect(code, file).not.toMatch(/@microsoft\/power-apps/);
      expect(code, file).not.toMatch(/generated\/services|Cr664_\w+Service/);
      expect(code, file).not.toMatch(/getClient|dataSourcesInfo/);
    }
  });

  it('emits no fabricated schema/sync success message', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/synced successfully|schema applied successfully|live write completed/i);
    }
  });
});

describe('default behavior is no-write (runtime)', () => {
  it('inspect / plan / dry-run execute nothing', async () => {
    for (const mode of ['inspect', 'plan', 'dry-run-apply'] as const) {
      const r = await runCrmSpineSchemaOrchestrator({ mode, correlationId: 'g', snapshot: [] });
      expect(r.executed).toBe(false);
      expect(r.schemaMutated).toBe(false);
    }
  });

  it('live apply blocks with no gate / no executor', async () => {
    const r = await runCrmSpineSchemaOrchestrator({ mode: 'live-apply', correlationId: 'g', snapshot: [] });
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
  });
});

describe('no flag flip / no schema files', () => {
  it('flag is at its safe default (false); modules never assign it', () => {
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=[^=]/);
    }
  });

  it('this phase adds no SQL or migration files under src/crm', () => {
    const files = readdirSync(here('crm'));
    expect(files.some((f) => f.endsWith('.sql'))).toBe(false);
    expect(files.some((f) => /migration/i.test(f))).toBe(false);
  });
});

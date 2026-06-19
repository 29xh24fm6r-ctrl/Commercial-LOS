import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 193C — CRM operator recovery console governance.
 *
 * The console is a read-mostly cockpit: it dispatches gated actions via callback
 * props and performs no write itself. Static pins prove no direct write verb /
 * SDK / fetch / fake-success copy, that it uses inspect/plan, and that it does
 * not auto-satisfy the live gate.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const CONSOLE = read('crm', 'CrmSpineRecoveryConsole.tsx');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');

describe('console performs no direct write and no hidden live apply', () => {
  it('wires no direct write verb / POST / fetch / SDK', () => {
    expect(CONSOLE).not.toMatch(/\b(createRecord|updateRecord|deleteRecord)\b/);
    expect(CONSOLE).not.toMatch(/method:\s*['"](POST|PATCH|DELETE)['"]/);
    expect(CONSOLE).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(CONSOLE).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient/);
  });

  it('uses inspect + plan and never hard-codes a satisfied gate', () => {
    expect(CONSOLE).toMatch(/inspectCrmSpineSchema\(/);
    expect(CONSOLE).toMatch(/planCrmSpineSchema\(/);
    // It evaluates the gate from props; it must not fabricate a satisfied config.
    expect(CONSOLE).not.toMatch(/schemaApplyEnabled:\s*'true'/);
    expect(CONSOLE).not.toMatch(/operatorAuthorized:\s*true/);
  });

  it('emits no fabricated synced/success copy', () => {
    expect(CONSOLE).not.toMatch(/synced successfully|sync complete|Salesforce updated|live write completed/i);
  });

  it('declares no route/router and is not referenced by App/WorkspaceGate', () => {
    expect(CONSOLE).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
    for (const src of [APP, WORKSPACE_GATE]) {
      expect(src).not.toMatch(/CrmSpineRecoveryConsole/);
    }
  });
});

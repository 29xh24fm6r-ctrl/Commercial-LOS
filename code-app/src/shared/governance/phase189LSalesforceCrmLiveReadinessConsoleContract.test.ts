import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189L — Salesforce CRM live readiness console governance pins.
 *
 * Read-only console ONLY. Static pins prove the console is presentational (no
 * Dataverse write, no SDK/client/fetch, no write verbs, no schema mutation, no
 * CRM_LIVE_PERSISTENCE_ENABLED flip), uses the Phase 189K adapter in inspect/plan
 * mode (never a satisfied seed gate), introduces no route/App/WorkspaceGate
 * mutation, and is not mounted into any banker/manager/team/executive workspace.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const tryRead = (...p: string[]) => {
  try {
    return read(...p);
  } catch {
    return '';
  }
};

const CONSOLE = read('crm', 'CrmSpineReadinessConsole.tsx');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');
const EXEC_WORKSPACE = tryRead('workspaces', 'ExecutiveWorkspace.tsx');
const EXEC_STRATEGY_WORKSPACE = tryRead('workspaces', 'ExecutiveProductStrategyWorkspace.tsx');

const importLines = (src: string) => src.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('console is read-only — no write / network / SDK / schema mutation', () => {
  it('executes no data-write verb and opens no network/SDK call', () => {
    expect(CONSOLE).not.toMatch(/method:\s*['"](POST|PATCH|DELETE)['"]/);
    expect(CONSOLE).not.toMatch(/PublishXml/);
    expect(CONSOLE).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(CONSOLE).not.toMatch(/\b(createRecord|updateRecord|deleteRecord|deleteMultiple|retrieveMultiple|executeMultiple)\b/);
    expect(CONSOLE).not.toMatch(/EntityDefinitions|CreateEntity\(|UpdateEntity|ImportSolution/);
  });

  it('renders no write affordance (no button/form/input or action handler)', () => {
    expect(CONSOLE).not.toMatch(/<button|<form|<input|<textarea|<select/i);
    expect(CONSOLE).not.toMatch(/onClick|onSubmit|onChange/);
  });

  it('imports only react, shared UI, and the pure CRM spine modules', () => {
    const lines = importLines(CONSOLE);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(
        /from '(react|\.\.\/shared\/(Card|Badge|theme)|\.\/(crmSalesforceSpineModel|crmSalesforceSpineSchemaAdapter))';/,
      );
    }
    expect(CONSOLE).not.toMatch(/@microsoft\/power-apps/);
    expect(CONSOLE).not.toMatch(/generated\/services|Cr664_\w+Service/);
    expect(CONSOLE).not.toMatch(/getClient|dataSourcesInfo/);
  });
});

describe('uses the 189K adapter in inspect/plan mode; seed stays inert', () => {
  it('calls inspect + plan', () => {
    expect(CONSOLE).toMatch(/inspectCrmSpineSchema\(/);
    expect(CONSOLE).toMatch(/planCrmSpineSchema\(/);
  });

  it('never passes a satisfied seed gate (no live seed)', () => {
    expect(CONSOLE).not.toMatch(/explicitlyConfirmed/);
    expect(CONSOLE).not.toMatch(/acknowledgement:/);
    expect(CONSOLE).not.toMatch(/liveCrmPersistenceEnabled:\s*true/);
  });
});

describe('does not flip CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is true (flipped by Phase 256B); the console never assigns it', () => {
    // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
    // this console still never assigns the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = true;/);
    expect(CONSOLE).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=[^=]/);
  });
});

describe('no schema/migration files', () => {
  it('this phase adds no SQL or migration files under src/crm', () => {
    const files = readdirSync(here('crm'));
    expect(files.some((f) => f.endsWith('.sql'))).toBe(false);
    expect(files.some((f) => /migration/i.test(f))).toBe(false);
  });
});

describe('no route / App / WorkspaceGate mutation', () => {
  it('the console declares no route/router', () => {
    expect(CONSOLE).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });

  it('App.tsx, WorkspaceGate, workspaceRoutes reference no readiness console', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/CrmSpineReadinessConsole/);
    }
  });
});

describe('no banker/manager/team/executive workspace expansion', () => {
  it('no role/exec deal workspace imports or mounts the console', () => {
    for (const src of [BANKER_WORKSPACE, MANAGER_WORKSPACE, TEAM_WORKSPACE, EXEC_WORKSPACE, EXEC_STRATEGY_WORKSPACE]) {
      expect(src).not.toMatch(/CrmSpineReadinessConsole/);
    }
  });
});

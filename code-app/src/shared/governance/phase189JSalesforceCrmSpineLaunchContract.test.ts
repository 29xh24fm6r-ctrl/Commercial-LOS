import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189J — Salesforce CRM spine launch FOUNDATION governance pins.
 *
 * Typed model + readiness ONLY. These static pins guarantee: the model and
 * readiness modules are pure (no IO, no Dataverse service/client/fetch import,
 * no write verbs), no schema/migration files, no CRM_LIVE_PERSISTENCE_ENABLED
 * flip, no fabricated contacts/accounts/roles/activities/tasks/timeline, no new
 * routes, no App/router/WorkspaceGate change, and no manager/team/executive
 * mount expansion.
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

const MODEL = read('crm', 'crmSalesforceSpineModel.ts');
const READINESS = read('crm', 'crmSalesforceSpineLaunchReadiness.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');
const EXEC_WORKSPACE = tryRead('workspaces', 'ExecutiveWorkspace.tsx');
const EXEC_STRATEGY_WORKSPACE = tryRead('workspaces', 'ExecutiveProductStrategyWorkspace.tsx');

const SPINE_MODULES = [MODEL, READINESS];
const importLines = (src: string) => src.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('pure model/readiness modules — no writes / network / SDK / client', () => {
  it('contain no write verbs', () => {
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/['"]POST['"]/);
      expect(src).not.toMatch(/['"]PATCH['"]/);
      expect(src).not.toMatch(/['"]DELETE['"]/);
      expect(src).not.toMatch(/PublishXml/);
    }
  });

  it('make no fetch / network call and run no Dataverse query', () => {
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/api\/data\/v9/);
      expect(src).not.toMatch(/retrieveMultiple|RetrieveMultiple/);
      expect(src).not.toMatch(/\$filter|\$select|\$expand/);
    }
  });

  it('import only pure local CRM modules (no service/client/SDK/adapter)', () => {
    for (const src of SPINE_MODULES) {
      const lines = importLines(src);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(
          /from '\.\/(crmFeatureFlags|crmRelationshipViewModel|crmSalesforceSpineModel)';/,
        );
      }
      expect(src).not.toMatch(/@microsoft\/power-apps/);
      expect(src).not.toMatch(/generated\/services/);
      expect(src).not.toMatch(/getClient|dataSourcesInfo/);
      expect(src).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
    }
  });
});

describe('no schema/migration mutation or files', () => {
  it('the modules perform no live schema mutation', () => {
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/EntityDefinitions|CreateEntity|UpdateEntity|RelationshipDefinitions|ImportSolution/);
    }
  });

  it('this phase adds no SQL or migration files under src/crm', () => {
    const files = readdirSync(here('crm'));
    expect(files.some((f) => f.endsWith('.sql'))).toBe(false);
    expect(files.some((f) => /migration/i.test(f))).toBe(false);
  });
});

describe('does not flip CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is the safe false (reset in crmFeatureFlags.ts); the modules never assign it', () => {
    // Completion Phase A reset CRM_LIVE_PERSISTENCE_ENABLED to the SAFE default
    // (false) in crmFeatureFlags.ts; these spine modules still never assign the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
    }
  });
});

describe('no fabricated contacts/accounts/roles/activities/tasks/timeline', () => {
  it('defines no fake/sample/mock record collections or PII literals', () => {
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/salesforce_account|salesforce_contact/i);
      expect(src).not.toMatch(/const\s+(fakeContacts|sampleContacts|mockAccounts|demoActivities|seedContacts|sampleAccount)/i);
      expect(src).not.toMatch(/@(example|acme|test)\.(com|org)/i);
      expect(src).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    }
  });

  it('the readiness engine explicitly records its fabrication refusals', () => {
    expect(READINESS).toMatch(/REJECTED_FABRICATIONS/);
    for (const e of ['contact', 'activity', 'task', 'timeline']) {
      expect(READINESS).toMatch(new RegExp(`entity: '${e}'`));
    }
  });

  it('the model fabricates no record constructors (only honest projections)', () => {
    expect(MODEL).toMatch(/export function toProvisionalAccount/);
    expect(MODEL).toMatch(/export function coverageTeamFromAuthorizedFacts/);
    expect(MODEL).not.toMatch(/export function (createContact|createAccount|createActivity|createTask|seedContacts|buildTimeline)/);
  });
});

describe('no routes / App / WorkspaceGate change', () => {
  it('the modules declare no route/router', () => {
    for (const src of SPINE_MODULES) {
      expect(src).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
    }
  });

  it('App.tsx, WorkspaceGate, workspaceRoutes reference no spine modules', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/crmSalesforceSpineModel|crmSalesforceSpineLaunchReadiness/);
    }
  });
});

describe('no manager/team/executive mount expansion', () => {
  it('no role deal workspace imports the spine modules', () => {
    for (const src of [BANKER_WORKSPACE, MANAGER_WORKSPACE, TEAM_WORKSPACE, EXEC_WORKSPACE, EXEC_STRATEGY_WORKSPACE]) {
      expect(src).not.toMatch(/crmSalesforceSpineModel|crmSalesforceSpineLaunchReadiness/);
    }
  });

  it('executive workspaces still mount no CRM relationship panel (189I parity unchanged)', () => {
    for (const src of [EXEC_WORKSPACE, EXEC_STRATEGY_WORKSPACE]) {
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
    }
  });
});

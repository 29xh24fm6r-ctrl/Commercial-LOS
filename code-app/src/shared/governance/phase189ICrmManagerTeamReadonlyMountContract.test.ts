import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189I — Manager/Team CRM read-only mount parity governance pins.
 *
 * Mount parity ONLY. These static pins guarantee: the manager and team deal
 * workspaces mount the EXISTING read-only DealCrmRelationshipPanel container
 * (reuse, not a new component) inside their already-authorized, team-scoped
 * DealDataProvider context; the banker mount is unchanged; no executive mount;
 * no App/router/WorkspaceGate change; no new route; no Dataverse IO; no write
 * verbs/affordances; no CRM_LIVE_PERSISTENCE_ENABLED flip; no schema/migration.
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

const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const EXEC_WORKSPACE = tryRead('workspaces', 'ExecutiveWorkspace.tsx');
const EXEC_STRATEGY_WORKSPACE = tryRead('workspaces', 'ExecutiveProductStrategyWorkspace.tsx');

const CHANGED_WORKSPACES = [MANAGER_WORKSPACE, TEAM_WORKSPACE];

describe('manager/team mount the existing read-only CRM panel container', () => {
  it('both mount <DealCrmRelationshipPanel /> and import the existing crm container', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).toMatch(/<DealCrmRelationshipPanel \/>/);
      expect(src).toMatch(
        /import \{ DealCrmRelationshipPanel \} from '\.\.\/crm\/CrmRelationshipPanel';/,
      );
    }
  });

  it('reuses the container — does not import the detail cards or panel internals directly', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
      expect(src).not.toMatch(/crmRelationshipViewModel|crmRelationshipDetailReadiness|buildCrmRelationshipInput/);
    }
  });

  it('mounts the panel INSIDE the authorized DealDataProvider context', () => {
    for (const src of CHANGED_WORKSPACES) {
      const open = src.indexOf('<DealDataProvider');
      const close = src.indexOf('</DealDataProvider>');
      const mount = src.indexOf('<DealCrmRelationshipPanel />');
      expect(open).toBeGreaterThanOrEqual(0);
      expect(mount).toBeGreaterThan(open);
      expect(mount).toBeLessThan(close);
    }
  });
});

describe('banker mount unchanged; no executive mount', () => {
  it('BankerDealWorkspace still mounts the CRM relationship panel', () => {
    expect(BANKER_WORKSPACE).toMatch(/<DealCrmRelationshipPanel \/>/);
  });

  it('executive workspaces mount neither the CRM panel nor the detail cards', () => {
    for (const src of [EXEC_WORKSPACE, EXEC_STRATEGY_WORKSPACE]) {
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
    }
  });
});

describe('no App / router / WorkspaceGate change, no new route', () => {
  it('App.tsx, WorkspaceGate, workspaceRoutes reference no CRM panel / detail cards', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
    }
  });

  it('the changed workspaces declare no router/route and no schema/metadata mutation', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/createBrowserRouter|<Route\b|createHashRouter/);
      expect(src).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
    }
  });
});

describe('read-only — no new Dataverse IO / writes in the changed workspaces', () => {
  it('contains no write verbs / network / broad query / OData params', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/['"]POST['"]/);
      expect(src).not.toMatch(/['"]PATCH['"]/);
      expect(src).not.toMatch(/['"]DELETE['"]/);
      expect(src).not.toMatch(/PublishXml/);
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/api\/data\/v9/);
      expect(src).not.toMatch(/retrieveMultiple|RetrieveMultiple/);
      expect(src).not.toMatch(/\$filter|\$select|\$expand/);
    }
  });

  it('imports no Dataverse SDK / generated service / live adapter', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/@microsoft\/power-apps/);
      expect(src).not.toMatch(/generated\/services/);
      expect(src).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
    }
  });

  it('still passes readOnly to every write-capable card (no write surface regression)', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).toMatch(/<DealTasks readOnly \/>/);
      expect(src).toMatch(/<DealDocuments readOnly \/>/);
      expect(src).toMatch(/<CreditMemo readOnly \/>/);
      expect(src).toMatch(/<BorrowerCommunication readOnly \/>/);
    }
  });

  it('adds no write button/form/input/action handler around the CRM mount', () => {
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/<button|<form|<input|<textarea|<select/i);
      expect(src).not.toMatch(/onClick|onSubmit|onChange/);
    }
  });
});

describe('does not flip CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is the safe false (reset in crmFeatureFlags.ts); the workspaces never assign it', () => {
    // Completion Phase A reset CRM_LIVE_PERSISTENCE_ENABLED to the SAFE default
    // (false) in crmFeatureFlags.ts; these workspaces still never reference or assign the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    for (const src of CHANGED_WORKSPACES) {
      expect(src).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED/);
    }
  });
});

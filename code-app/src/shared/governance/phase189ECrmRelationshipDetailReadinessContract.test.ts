import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCrmRelationshipDetailReadiness } from '../../crm/crmRelationshipDetailReadiness';
import type { CrmRelationshipGraphInput } from '../../crm/crmRelationshipViewModel';

/**
 * Phase 189E — CRM relationship detail readiness governance pins.
 *
 * The readiness module is pure and read-only. These static pins guarantee: no
 * writes, no Dataverse service/client import, no broad list-all CRM query, no
 * CRM_LIVE_PERSISTENCE_ENABLED flip, no route/App/WorkspaceGate change, no
 * schema/migration coupling, no write affordances, and no fabricated CRM spine.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const MODULE = read('crm', 'crmRelationshipDetailReadiness.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');

const IMPORT_LINES = MODULE.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('read-only — no write verbs / network / broad queries', () => {
  it('contains no POST / PATCH / DELETE / PublishXml', () => {
    expect(MODULE).not.toMatch(/['"]POST['"]/);
    expect(MODULE).not.toMatch(/['"]PATCH['"]/);
    expect(MODULE).not.toMatch(/['"]DELETE['"]/);
    expect(MODULE).not.toMatch(/PublishXml/);
  });

  it('makes no network call and runs no broad list-all CRM query', () => {
    expect(MODULE).not.toMatch(/\bfetch\s*\(/);
    expect(MODULE).not.toMatch(/XMLHttpRequest/);
    expect(MODULE).not.toMatch(/api\/data\/v9/);
    expect(MODULE).not.toMatch(/retrieveMultiple|RetrieveMultiple|\.list\(/);
    expect(MODULE).not.toMatch(/\$filter|\$select|\$expand/);
  });
});

describe('imports no Dataverse service/client', () => {
  it('only imports pure local modules + a type', () => {
    expect(IMPORT_LINES.length).toBeGreaterThan(0);
    for (const line of IMPORT_LINES) {
      expect(line).toMatch(/from '\.\/(crmFeatureFlags|buildCrmRelationshipInput|crmRelationshipViewModel)';/);
    }
  });

  it('does not import the Power Apps SDK, a generated service, a client, or a write adapter', () => {
    expect(MODULE).not.toMatch(/@microsoft\/power-apps/);
    expect(MODULE).not.toMatch(/generated\/services/);
    expect(MODULE).not.toMatch(/getClient/);
    expect(MODULE).not.toMatch(/dataSourcesInfo/);
    expect(MODULE).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
  });
});

describe('does not change CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is the safe false (reset in crmFeatureFlags.ts) and this module never assigns it', () => {
    // Completion Phase A reset CRM_LIVE_PERSISTENCE_ENABLED to the SAFE default
    // (false) in crmFeatureFlags.ts; this phase's module still never assigns the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    expect(MODULE).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('no route / App / WorkspaceGate change, no schema/migration', () => {
  it('App.tsx, WorkspaceGate, and workspaceRoutes reference no readiness module', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/crmRelationshipDetailReadiness/);
      expect(src).not.toMatch(/deriveCrmRelationshipDetailReadiness/);
    }
  });

  it('the module declares no routes and no schema/metadata mutation', () => {
    expect(MODULE).not.toMatch(/createBrowserRouter|<Route|react-router/);
    expect(MODULE).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
  });
});

describe('no write affordances / no fabricated CRM spine', () => {
  it('renders no JSX and wires no write handler (it is a pure function, not a component)', () => {
    expect(MODULE).not.toMatch(/<button|<form|<input/i);
    expect(MODULE).not.toMatch(/onClick|onSubmit/);
  });

  it('fabricates no contacts / orgs / roles / activities / timeline in its output', () => {
    const sample: CrmRelationshipGraphInput = {
      deal: { id: 'd', name: 'Deal' },
      client: { id: 'c', name: 'Client', lookupClassification: 'real-lookup' },
      team: { id: 't', name: 'Team', lookupClassification: 'real-lookup' },
      assignedBanker: { id: 'b', name: 'Banker', lookupClassification: 'real-lookup' },
    };
    const r = deriveCrmRelationshipDetailReadiness(sample);
    // The forbidden detail surfaces are REJECTED, never materialized.
    const rejected = r.unsafeAssumptionsRejected.map((a) => a.assumption);
    expect(rejected).toEqual(
      expect.arrayContaining([
        'contacts',
        'organization_hierarchy',
        'relationship_roles',
        'activities',
        'timeline_events',
        'communication_preferences',
      ]),
    );
    for (const prop of ['contacts', 'organizations', 'roles', 'activities', 'timelineEvents', 'communicationPreferences']) {
      expect(r).not.toHaveProperty(prop);
    }
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/salesforce_account|salesforce_contact/i);
  });

  it('the source defines no synthetic record literals (fake contacts/orgs/roles)', () => {
    expect(MODULE).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities|seedContacts)/i);
    expect(MODULE).not.toMatch(/contactId:|orgId:|roleId:|activityId:/);
  });
});

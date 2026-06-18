import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189F — read-only CRM detail cards governance pins.
 *
 * The detail cards are presentational and gated by the Phase 189E readiness
 * audit. These static pins guarantee: no writes, no Dataverse service/client/
 * fetch import, no broad CRM query, no CRM_LIVE_PERSISTENCE_ENABLED flip, no
 * route/App/WorkspaceGate change, no write affordances, no fabricated CRM
 * spine — and that the connected container uses deriveCrmRelationshipDetailReadiness
 * as the gate.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const CARDS = read('crm', 'CrmRelationshipDetailCards.tsx');
const PANEL = read('crm', 'CrmRelationshipPanel.tsx');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');

const CARDS_IMPORTS = CARDS.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('read-only — no write verbs / network / broad queries', () => {
  it('detail cards contain no POST / PATCH / DELETE / PublishXml', () => {
    expect(CARDS).not.toMatch(/['"]POST['"]/);
    expect(CARDS).not.toMatch(/['"]PATCH['"]/);
    expect(CARDS).not.toMatch(/['"]DELETE['"]/);
    expect(CARDS).not.toMatch(/PublishXml/);
  });

  it('detail cards make no network call and run no broad CRM query', () => {
    expect(CARDS).not.toMatch(/\bfetch\s*\(/);
    expect(CARDS).not.toMatch(/XMLHttpRequest/);
    expect(CARDS).not.toMatch(/api\/data\/v9/);
    expect(CARDS).not.toMatch(/retrieveMultiple|RetrieveMultiple|\.list\(/);
    expect(CARDS).not.toMatch(/\$filter|\$select|\$expand/);
  });
});

describe('detail cards import no Dataverse service/client/fetch', () => {
  it('import only pure local modules + shared UI', () => {
    expect(CARDS_IMPORTS.length).toBeGreaterThan(0);
    for (const line of CARDS_IMPORTS) {
      expect(line).toMatch(
        /from '(\.\/(crmRelationshipViewModel|crmRelationshipDetailReadiness)|\.\.\/shared\/[A-Za-z]+|react)';/,
      );
    }
  });

  it('reference no SDK / generated service / client / write adapter', () => {
    expect(CARDS).not.toMatch(/@microsoft\/power-apps/);
    expect(CARDS).not.toMatch(/generated\/services/);
    expect(CARDS).not.toMatch(/getClient/);
    expect(CARDS).not.toMatch(/dataSourcesInfo/);
    expect(CARDS).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
    expect(CARDS).not.toMatch(/useDealData/); // presentational — props only
  });
});

describe('does not change CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default stays false; cards + panel never assign it', () => {
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    expect(`${CARDS}\n${PANEL}`).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('no route / App / WorkspaceGate change', () => {
  it('App.tsx, WorkspaceGate, workspaceRoutes reference no detail cards', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
    }
  });

  it('the detail cards declare no route / router', () => {
    expect(CARDS).not.toMatch(/createBrowserRouter|<Route|react-router/);
    expect(CARDS).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
  });

  it('the cards reach the UI only through the existing BankerDealWorkspace mount (via the panel container)', () => {
    // The container (DealCrmRelationshipPanel) renders the cards; the workspace
    // mounts only that container — no new mount point is added.
    expect(PANEL).toMatch(/<CrmRelationshipDetailCards /);
    expect(BANKER_WORKSPACE).toMatch(/<DealCrmRelationshipPanel \/>/);
    expect(BANKER_WORKSPACE).not.toMatch(/CrmRelationshipDetailCards/);
  });
});

describe('no write affordances', () => {
  it('renders no button/form/input and wires no action handler', () => {
    expect(CARDS).not.toMatch(/<button|<form|<input|<textarea|<select/i);
    expect(CARDS).not.toMatch(/onClick|onSubmit|onChange/);
  });
});

describe('readiness is the gate; no fabricated CRM spine', () => {
  it('the connected container derives + passes the 189E readiness gate', () => {
    expect(PANEL).toMatch(/import \{ deriveCrmRelationshipDetailReadiness \} from '\.\/crmRelationshipDetailReadiness';/);
    expect(PANEL).toMatch(/const readiness = deriveCrmRelationshipDetailReadiness\(input\)/);
    expect(PANEL).toMatch(/readiness=\{readiness\}/);
    // The cards render strictly off readiness.safeDetailSections.
    expect(CARDS).toMatch(/readiness\.safeDetailSections\.includes/);
  });

  it('the cards define no synthetic record literals and no fake spine objects', () => {
    expect(CARDS).not.toMatch(/salesforce_account|salesforce_contact/i);
    expect(CARDS).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities|seedContacts)/i);
    expect(CARDS).not.toMatch(/contactId:|orgId:|roleId:|activityId:/);
  });
});

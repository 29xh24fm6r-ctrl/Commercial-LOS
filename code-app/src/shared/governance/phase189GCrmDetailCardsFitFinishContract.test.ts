import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189G — CRM detail cards fit-and-finish + source-fact governance pins.
 *
 * Banker-only, read-only. These static pins guarantee: no writes, no Dataverse
 * service/client/fetch import, no broad query, no CRM_LIVE_PERSISTENCE_ENABLED
 * flip, no route/App/WorkspaceGate change, no manager/team/executive mount
 * expansion, no write affordances, no fabricated CRM spine — and that the
 * source-fact traceability language (authorized deal row → 189B → 189E, no new
 * lookup) is present.
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

const CARDS = read('crm', 'CrmRelationshipDetailCards.tsx');
// Phase 189I: restore the PANEL source read that a prior merge dropped while its
// usages below (the "panel mounts the detail cards read-only" pin) remained.
const PANEL = read('crm', 'CrmRelationshipPanel.tsx');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = tryRead('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = tryRead('team', 'TeamDealWorkspace.tsx');

const CARDS_IMPORTS = CARDS.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('read-only — no write verbs / network / broad queries', () => {
  it('contains no POST / PATCH / DELETE / PublishXml', () => {
    expect(CARDS).not.toMatch(/['"]POST['"]/);
    expect(CARDS).not.toMatch(/['"]PATCH['"]/);
    expect(CARDS).not.toMatch(/['"]DELETE['"]/);
    expect(CARDS).not.toMatch(/PublishXml/);
  });

  it('makes no fetch / network call and runs no broad CRM query', () => {
    expect(CARDS).not.toMatch(/\bfetch\s*\(/);
    expect(CARDS).not.toMatch(/XMLHttpRequest/);
    expect(CARDS).not.toMatch(/api\/data\/v9/);
    expect(CARDS).not.toMatch(/retrieveMultiple|RetrieveMultiple|\.list\(/);
    expect(CARDS).not.toMatch(/\$filter|\$select|\$expand/);
  });

  it('the panel mounts the detail cards read-only (no write verb / fetch)', () => {
    expect(PANEL).toMatch(/CrmRelationshipDetailCards/);
    expect(PANEL).not.toMatch(/['"]POST['"]/);
    expect(PANEL).not.toMatch(/['"]PATCH['"]/);
    expect(PANEL).not.toMatch(/['"]DELETE['"]/);
    expect(PANEL).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('imports no Dataverse service/client/fetch', () => {
  it('imports only pure local modules + shared UI + react', () => {
    expect(CARDS_IMPORTS.length).toBeGreaterThan(0);
    for (const line of CARDS_IMPORTS) {
      expect(line).toMatch(
        /from '(\.\/(crmRelationshipViewModel|crmRelationshipDetailReadiness|buildCrmRelationshipInput)|\.\.\/shared\/[A-Za-z]+|react)';/,
      );
    }
  });

  it('references no SDK / generated service / client / write adapter / context hook', () => {
    expect(CARDS).not.toMatch(/@microsoft\/power-apps/);
    expect(CARDS).not.toMatch(/generated\/services/);
    expect(CARDS).not.toMatch(/getClient/);
    expect(CARDS).not.toMatch(/dataSourcesInfo/);
    expect(CARDS).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
    expect(CARDS).not.toMatch(/useDealData/);
  });
});

describe('does not change CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is true (flipped by Phase 256B); cards never assign it', () => {
    // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
    // these cards still never assign the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = true;/);
    expect(CARDS).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('no route / App / WorkspaceGate change', () => {
  it('App.tsx, WorkspaceGate, workspaceRoutes reference no detail cards', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
    }
  });

  it('the detail cards declare no route and no schema/metadata mutation', () => {
    expect(CARDS).not.toMatch(/createBrowserRouter|<Route|react-router/);
    expect(CARDS).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
  });
});

describe('CRM relationship panel mount surfaces', () => {
  // NOTE: Phase 189I superseded the original 189G banker-only invariant.
  // The read-only DealCrmRelationshipPanel is now mounted at parity in the
  // manager and team deal workspaces too (mount parity). The banker mount is
  // unchanged and executive surfaces remain unmounted.
  it('BankerDealWorkspace still mounts the CRM relationship panel', () => {
    expect(BANKER_WORKSPACE).toMatch(/<DealCrmRelationshipPanel \/>/);
  });

  it('manager and team deal workspaces mount the read-only CRM panel (Phase 189I parity)', () => {
    for (const src of [MANAGER_WORKSPACE, TEAM_WORKSPACE]) {
      expect(src).toMatch(/<DealCrmRelationshipPanel \/>/);
    }
  });
});

describe('no write affordances / no fabricated CRM spine', () => {
  it('renders no button/form/input and wires no action handler', () => {
    expect(CARDS).not.toMatch(/<button|<form|<input|<textarea|<select/i);
    expect(CARDS).not.toMatch(/onClick|onSubmit|onChange/);
  });

  it('defines no synthetic record literals, no fake spine objects, no fake placeholders', () => {
    expect(CARDS).not.toMatch(/salesforce_account|salesforce_contact/i);
    expect(CARDS).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities|seedContacts)/i);
    expect(CARDS).not.toMatch(/contactId:|orgId:|roleId:|activityId:/);
    // No fabricated placeholder copy.
    expect(CARDS).not.toMatch(/\bTBD\b|unknown contact|sample role|lorem ipsum/i);
  });
});

describe('source-fact traceability language present + deterministic order', () => {
  it('names the authorized deal row, 189B view-model, 189E gate, and "no new CRM lookup"', () => {
    expect(CARDS).toMatch(/189B view-model/);
    expect(CARDS).toMatch(/189E readiness/);
    expect(CARDS).toMatch(/No new CRM lookup/i);
    expect(CARDS).toMatch(/authorized deal row/i);
    expect(CARDS).toMatch(/data-source-fact/);
    expect(CARDS).toMatch(/data-testid="crm-detail-provenance"/);
  });

  it('declares the six sections in deterministic order', () => {
    const order = CARDS.slice(
      CARDS.indexOf('const SECTION_ORDER'),
      CARDS.indexOf('];', CARDS.indexOf('const SECTION_ORDER')),
    );
    const keys = ['clientIdentity', 'teamOwnership', 'assignedBanker', 'platformWorkspaceBridge', 'relationshipIntegrity', 'salesforceSpine'];
    let lastIdx = -1;
    for (const k of keys) {
      const idx = order.indexOf(k);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('hides name: surrogate ids defensively', () => {
    expect(CARDS).toMatch(/isSurrogateId/);
    expect(CARDS).toMatch(/CRM_NAME_REF_PREFIX/);
  });
});


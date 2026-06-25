import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189C — read-only CRM Relationship panel governance pins.
 *
 * The panel + its input builder are read-only and pure-ish (the container reads
 * already-authorized context only). These static pins guarantee: no writes, no
 * CRM_LIVE_PERSISTENCE_ENABLED flip, no route/App/WorkspaceGate mounting (the
 * panel mounts ONLY inside BankerDealWorkspace's authorized render path), no
 * checklist/comms/handoff or SDK/write-adapter imports, and no fabricated
 * Salesforce-style spine data.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const PANEL = read('crm', 'CrmRelationshipPanel.tsx');
const BUILDER = read('crm', 'buildCrmRelationshipInput.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');

const PANEL_AND_BUILDER = `${PANEL}\n${BUILDER}`;

describe('read-only — no write verbs / network', () => {
  it('panel + builder contain no POST / PATCH / DELETE / PublishXml', () => {
    expect(PANEL_AND_BUILDER).not.toMatch(/['"]POST['"]/);
    expect(PANEL_AND_BUILDER).not.toMatch(/['"]PATCH['"]/);
    expect(PANEL_AND_BUILDER).not.toMatch(/['"]DELETE['"]/);
    expect(PANEL_AND_BUILDER).not.toMatch(/PublishXml/);
  });

  it('panel + builder make no fetch / network call of their own', () => {
    expect(PANEL_AND_BUILDER).not.toMatch(/\bfetch\s*\(/);
    expect(PANEL_AND_BUILDER).not.toMatch(/XMLHttpRequest/);
    expect(PANEL_AND_BUILDER).not.toMatch(/api\/data\/v9/);
  });
});

describe('does not change CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('reflects the flag default (flipped to true by Phase 256B)', () => {
    // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
    // neither panel nor builder assigns it (proven below).
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = true;/);
  });

  it('neither panel nor builder assigns the flag', () => {
    expect(PANEL_AND_BUILDER).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('mounts ONLY in BankerDealWorkspace — no App/router/WorkspaceGate change', () => {
  it('BankerDealWorkspace imports and renders the connected panel', () => {
    expect(BANKER_WORKSPACE).toMatch(
      /import \{ DealCrmRelationshipPanel \} from '\.\.\/crm\/CrmRelationshipPanel';/,
    );
    expect(BANKER_WORKSPACE).toMatch(/<DealCrmRelationshipPanel \/>/);
  });

  it('App.tsx, WorkspaceGate, and workspaceRoutes do NOT reference the panel', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/CrmRelationshipPanel/);
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
    }
  });

  it('the panel declares no routes and mounts no router', () => {
    expect(PANEL).not.toMatch(/createBrowserRouter/);
    expect(PANEL).not.toMatch(/<Route/);
    expect(PANEL).not.toMatch(/from 'react-router/);
  });
});

describe('no checklist / comms / handoff / SDK / write-adapter coupling', () => {
  it('does not import the Power Apps SDK, a client, or a Dataverse write adapter', () => {
    expect(PANEL_AND_BUILDER).not.toMatch(/@microsoft\/power-apps/);
    expect(PANEL_AND_BUILDER).not.toMatch(/getClient/);
    expect(PANEL_AND_BUILDER).not.toMatch(/dataSourcesInfo/);
    expect(PANEL_AND_BUILDER).not.toMatch(/crmLiveDataverseAdapter/);
    expect(PANEL_AND_BUILDER).not.toMatch(/crmLiveDataverseTransport/);
    expect(PANEL_AND_BUILDER).not.toMatch(/crmPersistenceAdapter/);
    expect(PANEL_AND_BUILDER).not.toMatch(/crmControlledWritebackAdapter/);
  });

  it('does not reference a checklist / comms / handoff path', () => {
    // A banker `email` is graph DATA, not a comms action — pins target
    // comms ACTIONS/MODULES, not the bare word "email".
    expect(PANEL_AND_BUILDER).not.toMatch(/checklist/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/sendDocumentRequest/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/prepareDocumentRequestHandoff/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/handoff/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/send[A-Za-z]*Email/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/sendSms/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/mailto:/i);
    expect(PANEL_AND_BUILDER).not.toMatch(/Outlook/i);
  });
});

describe('fabricates no Salesforce-style spine data', () => {
  it('the panel renders the future spine honestly and invents no entity literals', () => {
    expect(PANEL).toMatch(/not seeded · not wired/i);
    expect(PANEL).not.toMatch(/salesforce_account/i);
    expect(PANEL).not.toMatch(/salesforce_contact/i);
    // No hard-coded synthetic contact/org/role/activity record arrays.
    expect(PANEL).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities)/i);
  });
});

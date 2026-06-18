import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189H — Manager/Team CRM detail MOUNT readiness governance pins.
 *
 * Audit/readiness ONLY. These static pins guarantee: the audit module is pure
 * (no IO, no writes, no Dataverse service/client/transport/adapter import, no
 * broad query, no React, no JSX), it adds NO new mount, the Manager and Team
 * deal workspaces still do NOT mount the CRM panel or detail cards,
 * BankerDealWorkspace remains the ONLY active DealCrmRelationshipPanel mount, no
 * App/router/WorkspaceGate change, no CRM_LIVE_PERSISTENCE_ENABLED flip, and no
 * schema/migration files.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const AUDIT = read('crm', 'crmManagerTeamMountReadiness.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');

const AUDIT_IMPORTS = AUDIT.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('audit module is pure — no write verbs / network / broad queries', () => {
  it('contains no POST / PATCH / DELETE / PublishXml', () => {
    expect(AUDIT).not.toMatch(/['"]POST['"]/);
    expect(AUDIT).not.toMatch(/['"]PATCH['"]/);
    expect(AUDIT).not.toMatch(/['"]DELETE['"]/);
    expect(AUDIT).not.toMatch(/PublishXml/);
  });

  it('makes no fetch / network call and runs no broad CRM query', () => {
    expect(AUDIT).not.toMatch(/\bfetch\s*\(/);
    expect(AUDIT).not.toMatch(/XMLHttpRequest/);
    expect(AUDIT).not.toMatch(/api\/data\/v9/);
    expect(AUDIT).not.toMatch(/retrieveMultiple|RetrieveMultiple|\.list\(/);
    expect(AUDIT).not.toMatch(/\$filter|\$select|\$expand/);
  });

  it('renders nothing — no React import, no JSX, no panel/cards mount', () => {
    expect(AUDIT).not.toMatch(/from 'react'/);
    expect(AUDIT).not.toMatch(/<DealCrmRelationshipPanel/);
    expect(AUDIT).not.toMatch(/<CrmRelationshipDetailCards/);
    expect(AUDIT).not.toMatch(/<DealDataProvider/);
  });
});

describe('audit imports no Dataverse service/client/fetch/adapter', () => {
  it('imports only pure local modules', () => {
    expect(AUDIT_IMPORTS.length).toBeGreaterThan(0);
    for (const line of AUDIT_IMPORTS) {
      expect(line).toMatch(/from '\.\/crmFeatureFlags';/);
    }
  });

  it('references no SDK / generated service / client / write adapter / context hook', () => {
    expect(AUDIT).not.toMatch(/@microsoft\/power-apps/);
    expect(AUDIT).not.toMatch(/generated\/services/);
    expect(AUDIT).not.toMatch(/getClient/);
    expect(AUDIT).not.toMatch(/dataSourcesInfo/);
    expect(AUDIT).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
    // The audit must not import or CALL any host context hook (mentions in
    // explanatory comments are fine — it stays a pure function over its input).
    for (const line of AUDIT_IMPORTS) {
      expect(line).not.toMatch(/useDealData|useOptionalBanker/);
    }
    expect(AUDIT).not.toMatch(/useDealData\s*\(|useOptionalBanker\s*\(/);
    expect(AUDIT).not.toMatch(/from '\.\.\/deals\/DealDataProvider'|from '\.\.\/banker\//);
  });
});

describe('does not change CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default stays false; the audit never assigns it', () => {
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    expect(AUDIT).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('no route / App / WorkspaceGate change', () => {
  it('App.tsx, WorkspaceGate, workspaceRoutes reference no CRM panel / detail cards / audit', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
      expect(src).not.toMatch(/crmManagerTeamMountReadiness/);
    }
  });

  it('the audit declares no route and no schema/metadata mutation', () => {
    expect(AUDIT).not.toMatch(/createBrowserRouter|<Route|react-router/);
    expect(AUDIT).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
  });
});

describe('no new mount — banker remains the only active mount', () => {
  it('BankerDealWorkspace still mounts the CRM relationship panel', () => {
    expect(BANKER_WORKSPACE).toMatch(/<DealCrmRelationshipPanel \/>/);
  });

  it('manager and team deal workspaces do NOT import or mount the CRM panel / detail cards', () => {
    for (const src of [MANAGER_WORKSPACE, TEAM_WORKSPACE]) {
      expect(src).not.toMatch(/DealCrmRelationshipPanel/);
      expect(src).not.toMatch(/CrmRelationshipDetailCards/);
      expect(src).not.toMatch(/from '\.\.\/crm\//);
    }
  });
});

describe('no fabricated CRM detail / write affordances in the audit', () => {
  it('defines no synthetic record literals or fake spine objects', () => {
    expect(AUDIT).not.toMatch(/salesforce_account|salesforce_contact/i);
    expect(AUDIT).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities|seedContacts)/i);
    expect(AUDIT).not.toMatch(/contactId:|orgId:|roleId:|activityId:/);
  });

  it('explicitly names the rejected unsafe assumptions for a manager/team mount', () => {
    expect(AUDIT).toMatch(/broadened_crm_visibility/);
    expect(AUDIT).toMatch(/manager_write_affordances/);
    expect(AUDIT).toMatch(/cross_team_contacts/);
  });
});

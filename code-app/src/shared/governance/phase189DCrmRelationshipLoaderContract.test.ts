import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 189D — authorized relationship enrichment governance pins.
 *
 * 189D is NOT a new runtime loader: it enriches the already-authorized deal row
 * returned by loadDealFor* with real lookup ids + classifications, off the SAME
 * retrieve. These static pins prove: no new Dataverse GET/child query, no write
 * path, no pre-authorization query, no route/App/WorkspaceGate change, no
 * schema/migration coupling, and no fabricated CRM spine.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');

const DEAL_QUERIES = read('deals', 'dealQueries.ts');
const PANEL = read('crm', 'CrmRelationshipPanel.tsx');
const BUILDER = read('crm', 'buildCrmRelationshipInput.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');

describe('no new Dataverse write path', () => {
  it('dealQueries issues no POST / PATCH / DELETE / PublishXml and no write verbs', () => {
    expect(DEAL_QUERIES).not.toMatch(/['"]POST['"]/);
    expect(DEAL_QUERIES).not.toMatch(/['"]PATCH['"]/);
    expect(DEAL_QUERIES).not.toMatch(/['"]DELETE['"]/);
    expect(DEAL_QUERIES).not.toMatch(/PublishXml/);
    expect(DEAL_QUERIES).not.toMatch(/\.(create|update|delete|save|upsert)\s*\(/);
  });

  it('the panel + builder add no write affordance', () => {
    const both = `${PANEL}\n${BUILDER}`;
    expect(both).not.toMatch(/['"](POST|PATCH|DELETE)['"]/);
    expect(both).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('no new runtime query — enrichment rides the SAME authorized retrieve', () => {
  it('dealQueries still performs exactly the existing single retrieve per loader (no child/second GET)', () => {
    const gets = DEAL_QUERIES.match(/Cr664_loandealsService\.get\(/g) ?? [];
    // One in loadDealForBanker, one in the shared loadDealByTeamMatch — unchanged.
    expect(gets.length).toBe(2);
    // No additional Dataverse service is imported or called for the enrichment.
    expect(DEAL_QUERIES).not.toMatch(/retrieveMultiple|\.list\(|RetrieveMultiple/);
    const serviceImports = DEAL_QUERIES.match(/from '\.\.\/generated\/services\//g) ?? [];
    expect(serviceImports.length).toBe(1);
  });

  it('the CRM classification type is a TYPE-ONLY import (erased — no runtime CRM dependency in the loader)', () => {
    expect(DEAL_QUERIES).toMatch(
      /import type \{ CrmEdgeLookupClassification \} from '\.\.\/crm\/crmRelationshipViewModel';/,
    );
  });

  it('enrichment is read off the already-fetched row (deal._cr664_*_value), not a new request', () => {
    expect(DEAL_QUERIES).toMatch(/const clientId = deal\._cr664_client_value;/);
    expect(DEAL_QUERIES).toMatch(/const teamId = deal\._cr664_team_value;/);
    expect(DEAL_QUERIES).toMatch(/const assignedBankerId = deal\._cr664_assignedbanker_value;/);
  });
});

describe('no pre-authorization query was added', () => {
  it('authorization still precedes mapping in loadDealForBanker', () => {
    const fn = DEAL_QUERIES.slice(
      DEAL_QUERIES.indexOf('export async function loadDealForBanker'),
      DEAL_QUERIES.indexOf('export async function loadDealForManager'),
    );
    const denyIdx = fn.indexOf('_cr664_assignedbanker_value !== bankerId');
    const mapIdx = fn.indexOf('mapDealDetail(deal)');
    expect(denyIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(denyIdx);
  });

  it('authorization still precedes mapping in the team-scoped loader', () => {
    const fn = DEAL_QUERIES.slice(
      DEAL_QUERIES.indexOf('async function loadDealByTeamMatch'),
      DEAL_QUERIES.indexOf('function getFormattedValue'),
    );
    const denyIdx = fn.indexOf('_cr664_team_value !== teamId');
    const mapIdx = fn.indexOf('mapDealDetail(deal)');
    expect(denyIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(denyIdx);
  });
});

describe('no route / App / WorkspaceGate change', () => {
  it('App.tsx, WorkspaceGate, and workspaceRoutes reference no CRM panel or enrichment field', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/CrmRelationshipPanel/);
      expect(src).not.toMatch(/clientLookupClassification/);
    }
  });

  it('dealQueries declares no route and no schema/metadata mutation', () => {
    expect(DEAL_QUERIES).not.toMatch(/createBrowserRouter|<Route|react-router/);
    expect(DEAL_QUERIES).not.toMatch(/EntityDefinitions|CreateEntity|RelationshipDefinitions|migration/i);
  });
});

describe('no schema / migration coupling, no fabricated CRM spine', () => {
  it('does not itself flip CRM_LIVE_PERSISTENCE_ENABLED (Phase 256B did, in crmFeatureFlags.ts)', () => {
    const flags = read('crm', 'crmFeatureFlags.ts');
    // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
    // this phase's panel/builder/loader still never assign it (proven below).
    expect(flags).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = true;/);
    expect(`${PANEL}\n${BUILDER}\n${DEAL_QUERIES}`).not.toMatch(
      /CRM_LIVE_PERSISTENCE_ENABLED\s*=/,
    );
  });

  it('fabricates no Salesforce-style spine entities', () => {
    expect(PANEL).toMatch(/not seeded · not wired/i);
    for (const src of [PANEL, BUILDER, DEAL_QUERIES]) {
      expect(src).not.toMatch(/salesforce_account/i);
      expect(src).not.toMatch(/salesforce_contact/i);
      expect(src).not.toMatch(/const\s+(fakeContacts|sampleOrgs|mockRoles|demoActivities)/i);
    }
  });
});

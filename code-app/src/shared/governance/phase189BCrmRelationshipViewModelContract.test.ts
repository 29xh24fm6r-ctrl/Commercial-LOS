import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipGraphInput,
} from '../../crm/crmRelationshipViewModel';

/**
 * Phase 189B — CRM Relationship view-model governance pins.
 *
 * The view-model is pure and read-only. These static pins guarantee it stays
 * that way: no writes, no live-persistence flip, no route mounting, no
 * checklist/comms/handoff coupling, no SDK/client/write-adapter imports, and
 * no fabricated Salesforce-style spine data in its output.
 */

const MODULE_PATH = resolve(__dirname, '..', '..', 'crm', 'crmRelationshipViewModel.ts');
const MODULE = readFileSync(MODULE_PATH, 'utf8');

const FLAGS_PATH = resolve(__dirname, '..', '..', 'crm', 'crmFeatureFlags.ts');
const FLAGS = readFileSync(FLAGS_PATH, 'utf8');

const APP_PATH = resolve(__dirname, '..', '..', 'App.tsx');
const APP = readFileSync(APP_PATH, 'utf8');

const IMPORT_LINES = MODULE.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('read-only — no write verbs anywhere in the module', () => {
  it('contains no POST / PATCH / DELETE / PublishXml', () => {
    expect(MODULE).not.toMatch(/['"]POST['"]/);
    expect(MODULE).not.toMatch(/['"]PATCH['"]/);
    expect(MODULE).not.toMatch(/['"]DELETE['"]/);
    expect(MODULE).not.toMatch(/PublishXml/);
    expect(MODULE).not.toMatch(/PublishAllXml/);
  });

  it('makes no fetch / network call', () => {
    expect(MODULE).not.toMatch(/\bfetch\s*\(/);
    expect(MODULE).not.toMatch(/XMLHttpRequest/);
    expect(MODULE).not.toMatch(/api\/data\/v9/);
  });
});

describe('does not change the CRM_LIVE_PERSISTENCE_ENABLED default', () => {
  it('reflects the safe default (reset to false in crmFeatureFlags.ts)', () => {
    // Completion Phase A reset CRM_LIVE_PERSISTENCE_ENABLED to the SAFE default
    // (false) in crmFeatureFlags.ts; this phase's own module still never assigns
    // it (proven below).
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
  });

  it('the view-model only READS the flag — it never assigns it', () => {
    expect(MODULE).toMatch(/import \{ CRM_LIVE_PERSISTENCE_ENABLED \} from '\.\/crmFeatureFlags';/);
    expect(MODULE).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=/);
  });
});

describe('no route mounting / App.tsx change', () => {
  it('App.tsx does not import or mount the view-model', () => {
    expect(APP).not.toMatch(/crmRelationshipViewModel/);
    expect(APP).not.toMatch(/deriveCrmRelationshipViewModel/);
  });

  it('the module declares no routes and renders no JSX/router', () => {
    expect(MODULE).not.toMatch(/createBrowserRouter/);
    expect(MODULE).not.toMatch(/<Route/);
    expect(MODULE).not.toMatch(/react-router/);
  });
});

describe('no checklist / comms / handoff / SDK / write-adapter imports', () => {
  it('imports only pure local modules', () => {
    // The only import is the pure feature-flag constants module.
    for (const line of IMPORT_LINES) {
      expect(line).toMatch(/from '\.\/crmFeatureFlags';/);
    }
    expect(IMPORT_LINES.length).toBeGreaterThan(0);
  });

  it('does not import the Power Apps SDK, a client, or a Dataverse write adapter', () => {
    expect(MODULE).not.toMatch(/@microsoft\/power-apps/);
    expect(MODULE).not.toMatch(/getClient/);
    expect(MODULE).not.toMatch(/dataSourcesInfo/);
    expect(MODULE).not.toMatch(/crmLiveDataverseAdapter/);
    expect(MODULE).not.toMatch(/crmLiveDataverseTransport/);
    expect(MODULE).not.toMatch(/crmPersistenceAdapter/);
    expect(MODULE).not.toMatch(/crmControlledWritebackAdapter/);
  });

  it('does not import or reference a checklist / comms / handoff path', () => {
    // Note: a banker's `email` address is graph DATA (used for the --upn
    // cross-check), not a comms action — so these pins target comms
    // ACTIONS/MODULES, not the bare word "email".
    expect(MODULE).not.toMatch(/checklist/i);
    expect(MODULE).not.toMatch(/sendDocumentRequest/i);
    expect(MODULE).not.toMatch(/prepareDocumentRequestHandoff/i);
    expect(MODULE).not.toMatch(/handoff/i);
    expect(MODULE).not.toMatch(/send[A-Za-z]*Email/i);
    expect(MODULE).not.toMatch(/sendSms/i);
    expect(MODULE).not.toMatch(/mailto:/i);
    expect(MODULE).not.toMatch(/nodemailer|smtp/i);
    expect(MODULE).not.toMatch(/Outlook/i);
  });
});

describe('sample output fabricates no Salesforce-style spine data', () => {
  const sample: CrmRelationshipGraphInput = {
    deal: { id: 'd', name: 'Sample' },
    client: { id: 'c', name: 'Sample Client', borrowerType: 'Business', lookupClassification: 'real-lookup' },
    team: { id: 't', name: 'Team', lookupClassification: 'real-lookup' },
    assignedBanker: { id: 'b', name: 'Banker', teamId: 't', lookupClassification: 'real-lookup' },
  };

  it('reports the spine as not seeded / not wired and synthesizes no entities', () => {
    const vm = deriveCrmRelationshipViewModel(sample);
    expect(vm.spineSeeded).toBe(false);
    expect(vm.futureSpine.seeded).toBe(false);
    expect(vm.futureSpine.wired).toBe(false);
    for (const t of vm.futureSpine.tables) {
      // No table is wired; absent ones are honestly "not_seeded".
      expect(['not_seeded', 'present_not_wired']).toContain(t.status);
    }
  });

  it('the serialized output contains no fake contacts / orgs / roles / activities', () => {
    const vm = deriveCrmRelationshipViewModel(sample);
    const json = JSON.stringify(vm);
    // Only the honest stub label may mention these concepts; there are no
    // synthesized record collections.
    expect(vm).not.toHaveProperty('contacts');
    expect(vm).not.toHaveProperty('organizations');
    expect(vm).not.toHaveProperty('guarantors');
    expect(vm).not.toHaveProperty('principals');
    expect(vm).not.toHaveProperty('roles');
    expect(vm).not.toHaveProperty('activities');
    expect(vm).not.toHaveProperty('timelineEvents');
    // The canonical client is explicitly a stub, not a Salesforce account.
    expect(json).toMatch(/borrower_client_stub/);
    expect(json).not.toMatch(/salesforce_account/i);
    expect(json).not.toMatch(/salesforce_contact/i);
  });

  it('honestly labels the canonical client as a stub, not a full spine', () => {
    const vm = deriveCrmRelationshipViewModel(sample);
    expect(vm.canonicalClient?.kind).toBe('borrower_client_stub');
    expect(vm.canonicalClient?.note).toMatch(/NOT a Salesforce/i);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  inspectCrmSpineSchema,
  planCrmSpineSchema,
  runCrmSpineSchemaSeed,
  runCrmSpineSchemaAdapter,
  CRM_SPINE_SCHEMA_DEFAULT_MODE,
  CRM_SPINE_SEED_DISABLED_BY_DEFAULT,
} from '../../crm/crmSalesforceSpineSchemaAdapter';

/**
 * Phase 189K — Salesforce CRM spine schema adapter governance pins.
 *
 * Inspect/plan/disabled-seed ONLY. Static pins prove the adapter is pure (no
 * SDK/client/fetch import, no data-write verbs, no flag flip, no routes/UI), and
 * runtime pins prove that NO mode — inspect, plan, seed, or the default
 * dispatch — ever executes a live write or schema mutation.
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

const ADAPTER = read('crm', 'crmSalesforceSpineSchemaAdapter.ts');
const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');
const EXEC_WORKSPACE = tryRead('workspaces', 'ExecutiveWorkspace.tsx');

const importLines = (src: string) => src.match(/^\s*import\s[\s\S]*?from\s+'[^']+';/gm) ?? [];

describe('adapter is pure — no live write / network / SDK by default or otherwise', () => {
  it('executes no data-write verb and opens no network/SDK call', () => {
    expect(ADAPTER).not.toMatch(/method:\s*['"](POST|PATCH|DELETE)['"]/);
    expect(ADAPTER).not.toMatch(/PublishXml/);
    expect(ADAPTER).not.toMatch(/\bfetch\s*\(/);
    expect(ADAPTER).not.toMatch(/XMLHttpRequest/);
    expect(ADAPTER).not.toMatch(/api\/data\/v9/);
    expect(ADAPTER).not.toMatch(/\b(createRecord|updateRecord|deleteRecord|deleteMultiple|retrieveMultiple|executeMultiple)\b/);
  });

  it('imports only pure local CRM modules (no SDK/client/transport/adapter)', () => {
    const lines = importLines(ADAPTER);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(
        /from '\.\/(crmFeatureFlags|crmDataverseSchemaPlan|crmSalesforceSpineModel)';/,
      );
    }
    expect(ADAPTER).not.toMatch(/@microsoft\/power-apps/);
    expect(ADAPTER).not.toMatch(/generated\/services/);
    expect(ADAPTER).not.toMatch(/getClient|dataSourcesInfo/);
    expect(ADAPTER).not.toMatch(/crmLiveDataverseAdapter|crmLiveDataverseTransport|crmPersistenceAdapter/);
  });
});

describe('no mode executes a live write or schema mutation (runtime proof)', () => {
  it('seed is disabled by default and the default mode is inspect', () => {
    expect(CRM_SPINE_SEED_DISABLED_BY_DEFAULT).toBe(true);
    expect(CRM_SPINE_SCHEMA_DEFAULT_MODE).toBe('inspect');
  });

  it('inspect mutates nothing', () => {
    const r = inspectCrmSpineSchema({ snapshot: [] });
    expect(r.liveWritePerformed).toBe(false);
    expect(r.schemaMutated).toBe(false);
  });

  it('plan executes nothing', () => {
    const p = planCrmSpineSchema({ snapshot: [] });
    expect(p.executed).toBe(false);
    expect(p.liveWritePerformed).toBe(false);
    expect(p.schemaMutated).toBe(false);
  });

  it('seed never writes — not without a gate, not even with a fully satisfied gate', () => {
    const plan = planCrmSpineSchema({ snapshot: [] });
    const noGate = runCrmSpineSchemaSeed(plan);
    expect(noGate.executed).toBe(false);
    expect(noGate.gateSatisfied).toBe(false);

    const gated = runCrmSpineSchemaSeed(plan, {
      explicitlyConfirmed: true,
      acknowledgement: 'confirmed',
      liveCrmPersistenceEnabled: true,
    });
    expect(gated.gateSatisfied).toBe(true);
    expect(gated.executed).toBe(false);
    expect(gated.liveWritePerformed).toBe(false);
    expect(gated.schemaMutated).toBe(false);
  });

  it('the default dispatch runs inspect and performs no write', () => {
    const r = runCrmSpineSchemaAdapter();
    expect(r.mode).toBe('inspect');
    if (r.mode === 'inspect') expect(r.liveWritePerformed).toBe(false);
  });
});

describe('does not flip CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default is true (flipped by Phase 256B); the adapter never assigns it', () => {
    // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
    // this adapter still never assigns the flag.
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = true;/);
    expect(ADAPTER).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=[^=]/);
  });
});

describe('no routes / App / WorkspaceGate change / UI expansion', () => {
  it('the adapter is a pure module — no JSX, route, or router', () => {
    expect(ADAPTER).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
    expect(ADAPTER).not.toMatch(/from 'react'/);
    expect(ADAPTER).not.toMatch(/<\/[A-Za-z]/); // no JSX closing tag
  });

  it('App.tsx, WorkspaceGate, workspaceRoutes reference no spine schema adapter', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(/crmSalesforceSpineSchemaAdapter/);
    }
  });

  it('no role/exec deal workspace imports the schema adapter (no UI/mount expansion)', () => {
    for (const src of [BANKER_WORKSPACE, MANAGER_WORKSPACE, TEAM_WORKSPACE, EXEC_WORKSPACE]) {
      expect(src).not.toMatch(/crmSalesforceSpineSchemaAdapter/);
    }
  });
});

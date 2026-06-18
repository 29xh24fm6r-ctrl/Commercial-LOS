import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { runCrmSpineApply } from '../../crm/crmSalesforceSpineApplyOrchestrator';
import { persistCrmSpineRecords } from '../../crm/crmSalesforceSpinePersistenceAdapter';
import { linkNewDealToCrm } from '../../crm/crmSalesforceSpineNewDealLinkage';
import { buildCrmSpineAuditPayload } from '../../crm/crmSalesforceSpineAudit';

/**
 * Phase 193 — Lending department recovery (live CRM foundation) governance.
 *
 * Static pins prove the recovery modules carry no destructive verbs, no SDK/
 * fetch, no schema/migration files, no flag flip, no fake success, and no
 * route/App/WorkspaceGate/workspace blast radius. Runtime pins prove the default
 * behavior of every live path is no-write: dry-run executes nothing and live
 * paths block when the hard gates are unsatisfied.
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

const MODULE_FILES = [
  'crmSalesforceSpineLiveGates.ts',
  'crmSalesforceSpineAudit.ts',
  'crmSalesforceSpineApplyOrchestrator.ts',
  'crmSalesforceSpinePersistenceAdapter.ts',
  'crmSalesforceSpineNewDealLinkage.ts',
  'CrmSpineRecoveryConsole.tsx',
];
const SOURCES = MODULE_FILES.map((f) => ({ file: f, code: read('crm', f) }));
const CONSOLE = read('crm', 'CrmSpineRecoveryConsole.tsx');

const FLAGS = read('crm', 'crmFeatureFlags.ts');
const APP = read('App.tsx');
const WORKSPACE_GATE = read('bootstrap', 'WorkspaceGate.tsx');
const WORKSPACE_ROUTES = read('bootstrap', 'workspaceRoutes.ts');
const ADMIN_WORKSPACE = read('workspaces', 'AdminWorkspace.tsx');
const BANKER_WORKSPACE = read('deals', 'BankerDealWorkspace.tsx');
const MANAGER_WORKSPACE = read('manager', 'ManagerDealWorkspace.tsx');
const TEAM_WORKSPACE = read('team', 'TeamDealWorkspace.tsx');
const EXEC_WORKSPACE = tryRead('workspaces', 'ExecutiveWorkspace.tsx');

const MODULE_NAMES = /crmSalesforceSpine(LiveGates|Audit|ApplyOrchestrator|PersistenceAdapter|NewDealLinkage)|CrmSpineRecoveryConsole/;

describe('no destructive verbs / network / SDK in any recovery module', () => {
  it('contains no delete operation anywhere', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(deleteRecord|deleteMultiple)\b/);
      expect(code, file).not.toMatch(/method:\s*['"]DELETE['"]/);
      expect(code, file).not.toMatch(/\bDeleteEntity\b|\bDeleteAttribute\b|dropTable/);
    }
  });

  it('opens no fetch / network call and imports no Dataverse SDK / generated service', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
      expect(code, file).not.toMatch(/PublishXml/);
      expect(code, file).not.toMatch(/@microsoft\/power-apps/);
      expect(code, file).not.toMatch(/generated\/services|Cr664_\w+Service/);
      expect(code, file).not.toMatch(/getClient|dataSourcesInfo/);
    }
  });

  it('the console (component) wires no direct write verb or POST', () => {
    expect(CONSOLE).not.toMatch(/\b(createRecord|updateRecord)\b/);
    expect(CONSOLE).not.toMatch(/method:\s*['"](POST|PATCH)['"]/);
  });

  it('no recovery module emits a fabricated sync-success message', () => {
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/synced successfully|Salesforce updated|live write completed|connected successfully/i);
    }
  });
});

describe('default behavior is no-write (runtime)', () => {
  it('dry-run apply executes nothing', async () => {
    const r = await runCrmSpineApply({ mode: 'dry-run-apply', snapshot: [], actor: 'op', correlationId: 'g1' });
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
  });

  it('live apply blocks with no gate / no executor', async () => {
    const r = await runCrmSpineApply({ mode: 'live-apply', snapshot: [], actor: 'op', correlationId: 'g2' });
    expect(r.executed).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.overallOutcome).toBe('blocked_gate_not_satisfied');
  });

  it('live persistence blocks with no gate', async () => {
    const r = await persistCrmSpineRecords({
      mode: 'live',
      requests: [{ entity: 'account', fields: { cr664_name: 'X' }, sourceFacts: [{ statement: 's', sourceLogicalName: null, sourceRecordId: null }] }],
      actor: 'op',
      correlationId: 'g3',
    });
    expect(r.executed).toBe(false);
    expect(r.overallOutcome).toBe('blocked_gate_not_satisfied');
  });

  it('new-deal linkage is inert with no gate', async () => {
    const r = await linkNewDealToCrm({
      mode: 'live',
      deal: { dealId: 'd', dealName: 'N', clientId: 'c', clientName: 'Name' },
      actor: 'op',
      correlationId: 'g4',
    });
    expect(r.linkageAttempted).toBe(false);
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('every live path produces a deterministic audit payload with actor + correlation + outcome', () => {
    const a = buildCrmSpineAuditPayload({ correlationId: 'k', actor: 'op', targetEntity: 't', action: 'record-create', outcome: 'created', dryRun: false });
    const b = buildCrmSpineAuditPayload({ correlationId: 'k', actor: 'op', targetEntity: 't', action: 'record-create', outcome: 'created', dryRun: false });
    expect(a).toEqual(b);
    expect(a.actor).toBe('op');
    expect(a.correlationId).toBe('k');
    expect(a.outcome).toBe('created');
  });
});

describe('does not flip CRM_LIVE_PERSISTENCE_ENABLED', () => {
  it('flag default stays false; no recovery module assigns it', () => {
    expect(FLAGS).toMatch(/export const CRM_LIVE_PERSISTENCE_ENABLED = false;/);
    for (const { file, code } of SOURCES) {
      expect(code, file).not.toMatch(/CRM_LIVE_PERSISTENCE_ENABLED\s*=[^=]/);
    }
  });
});

describe('no schema/migration files', () => {
  it('this phase adds no SQL or migration files under src/crm', () => {
    const files = readdirSync(here('crm'));
    expect(files.some((f) => f.endsWith('.sql'))).toBe(false);
    expect(files.some((f) => /migration/i.test(f))).toBe(false);
  });
});

describe('no route / App / WorkspaceGate / workspace blast radius', () => {
  it('App.tsx, WorkspaceGate, workspaceRoutes reference no recovery module', () => {
    for (const src of [APP, WORKSPACE_GATE, WORKSPACE_ROUTES]) {
      expect(src).not.toMatch(MODULE_NAMES);
    }
  });

  it('no admin/banker/manager/team/executive workspace mounts a recovery module', () => {
    for (const src of [ADMIN_WORKSPACE, BANKER_WORKSPACE, MANAGER_WORKSPACE, TEAM_WORKSPACE, EXEC_WORKSPACE]) {
      expect(src).not.toMatch(MODULE_NAMES);
    }
  });

  it('the console declares no route/router', () => {
    expect(CONSOLE).not.toMatch(/createBrowserRouter|<Route\b|react-router/);
  });
});

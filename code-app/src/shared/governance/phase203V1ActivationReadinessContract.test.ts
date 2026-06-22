import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveV1ActivationReadiness } from '../../shared/readiness/v1ActivationReadinessModel';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';

/**
 * PHASE 203 — V1 activation readiness console contract.
 *
 * Pins the doc + admin-only mount + deterministic posture, and that the panel is
 * read-only (no action), with no route / entitlement widening.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_203_V1_ACTIVATION_READINESS_CONSOLE.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');
const PANEL = read('src/admin/V1ActivationReadinessPanel.tsx');
const MODEL = read('src/shared/readiness/v1ActivationReadinessModel.ts');
const ADMIN_WORKSPACE = read('src/workspaces/AdminWorkspace.tsx');
const APP = read('src/App.tsx');

describe('203 — doc + snapshot', () => {
  it('the Phase 203 doc + model + panel + tests exist', () => {
    for (const f of [
      DOC_REL,
      'src/shared/readiness/v1ActivationReadinessModel.ts',
      'src/shared/readiness/v1ActivationReadinessModel.test.ts',
      'src/admin/V1ActivationReadinessPanel.tsx',
      'src/admin/V1ActivationReadinessPanel.test.tsx',
    ]) {
      expect(existsSync(resolve(ROOT, f)), f).toBe(true);
    }
  });
  it('the snapshot references Phase 203', () => {
    expect(SNAPSHOT).toMatch(/PHASE_203_V1_ACTIVATION_READINESS_CONSOLE/);
  });
});

describe('203 — admin-only mount, no widening', () => {
  it('AdminWorkspace mounts the V1 activation readiness panel', () => {
    expect(ADMIN_WORKSPACE).toMatch(/import \{ V1ActivationReadinessPanel \} from '\.\.\/admin\/V1ActivationReadinessPanel'/);
    expect(ADMIN_WORKSPACE).toMatch(/<V1ActivationReadinessPanel\s*\/>/);
  });
  it('the admin workspace is reached only via the admin-gated route (no new route)', () => {
    expect(APP).toMatch(/<WorkspaceGate allowed=\{WORKSPACE_ROUTES\.admin\}>\s*<AdminWorkspace\s*\/>/);
    expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(5);
  });
  it('no non-admin workspace mounts the panel', () => {
    for (const rel of [
      'src/workspaces/BankerWorkspace.tsx',
      'src/workspaces/ManagerWorkspace.tsx',
      'src/workspaces/TeamWorkspace.tsx',
    ]) {
      expect(read(rel).includes('V1ActivationReadinessPanel'), rel).toBe(false);
    }
  });
});

describe('203 — panel is read-only / action-free', () => {
  it('the panel renders no button / action / write affordance', () => {
    expect(PANEL).not.toMatch(/<button/);
    expect(PANEL).not.toMatch(/onClick|onSubmit|onChange/);
    expect(PANEL).not.toMatch(/<input|<form|<textarea|<select/);
    expect(PANEL).not.toMatch(/createRecordAsync|updateRecordAsync|getClient|\bfetch\(/);
  });
  it('the model is pure / derives from constants (no SDK, no fetch)', () => {
    expect(MODEL).not.toMatch(/\bfetch\(|getClient|@microsoft\/power-apps/);
    expect(MODEL).toMatch(/CRM_LIVE_PERSISTENCE_ENABLED/);
    expect(MODEL).toMatch(/BANKER_CREATE_PILOT_ENABLED/);
  });
});

describe('203 — deterministic posture', () => {
  it('reports CONDITIONAL_GO with active surfaces + gated writes', () => {
    const r = deriveV1ActivationReadiness();
    expect(r.overallPosture).toBe('CONDITIONAL_GO');
    expect(r.ogbCrmStatus).toBe('ACTIVE');
    expect(r.internalLendingWorkflowStatus).toBe('ACTIVE');
    expect(r.newDealCreatePilot).toBe('ENABLED');
    expect(r.crmWriteback).toBe('GATED');
    expect(r.borrowerCommunications).toBe('GATED');
    expect(r.checklistGeneration).toBe('GATED');
    expect(r.broadWorkflowWrites).toBe('GATED');
    expect(r.externalConnectors).toBe('NOT_REQUIRED');
    expect(r.fakeSampleDataDependency).toBe('NOT_PRESENT');
    expect(r.schemaMigrationDependency).toBe('NOT_REQUIRED');
    expect(r.permissionRouteExpansion).toBe('NOT_PRESENT');
  });
});

describe('203 — doc content', () => {
  it('records purpose, gate derivation, posture, and verification', () => {
    expect(DOC).toMatch(/CONDITIONAL_GO/);
    expect(DOC).toMatch(/CRM_LIVE_PERSISTENCE_ENABLED/);
    expect(DOC).toMatch(/read-only/i);
    expect(DOC).toMatch(/no schema|no migration/i);
    expect(DOC).toMatch(/pnpm test/);
  });
  it('explains the conditional-go / no-go logic', () => {
    expect(DOC).toMatch(/CONDITIONAL.?GO/i);
    expect(DOC).toMatch(/NO.?GO/i);
  });
});

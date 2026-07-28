import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { deriveReleaseGovernanceSnapshot } from '../../admin/releaseGovernanceSnapshot';
import { evaluateBankerCreateRollout } from '../../deals/bankerNewDealCreateRollout';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 198 — Safe full-system launch readiness exposure contract.
 *
 * The Phase 197 readiness console is mounted inside the admin workspace only. It
 * inherits the existing admin route + identity gating, adds no new route, no
 * entitlement, and no action affordance, and does not move the recommendation
 * off CONDITIONAL_GO.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_198_SAFE_LAUNCH_READINESS_EXPOSURE.md';
const ADMIN_WORKSPACE = read('src/workspaces/AdminWorkspace.tsx');
const APP = read('src/App.tsx');
const CONSOLE_SRC = read('src/admin/FullSystemLaunchReadinessConsole.tsx');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

const WORKSPACE_FILES = [
  'src/workspaces/AdminWorkspace.tsx',
  'src/workspaces/BankerWorkspace.tsx',
  'src/workspaces/ManagerWorkspace.tsx',
  'src/workspaces/TeamWorkspace.tsx',
  'src/workspaces/ExecutiveWorkspace.tsx',
];

const FAKE_DATA_RE =
  /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|SAMPLE_DATA|DEMO_DATA|MOCK_DATA|FAKE_DATA)\b/;

describe('198 — doc + snapshot', () => {
  it('the Phase 198 doc exists', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the snapshot references Phase 198', () => {
    expect(SNAPSHOT).toMatch(/PHASE_198_SAFE_LAUNCH_READINESS_EXPOSURE/);
  });
});

describe('198 — admin-only mount inherits existing gating', () => {
  it('the admin workspace renders the authoritative final certification instead', () => {
    expect(ADMIN_WORKSPACE).not.toContain('FullSystemLaunchReadinessConsole');
    expect(ADMIN_WORKSPACE).toMatch(/<FinalOperatingCertificationPanel\s*\/>/);
  });

  it('the admin workspace is reached only through the admin-gated route', () => {
    expect(APP).toMatch(/<WorkspaceGate allowed=\{WORKSPACE_ROUTES\.admin\}>\s*<AdminWorkspace\s*\/>/);
  });

  it('the retired readiness console is not runtime-mounted in any workspace', () => {
    for (const rel of WORKSPACE_FILES) {
      const src = read(rel);
      const imports = src.includes('FullSystemLaunchReadinessConsole');
      expect(imports, rel).toBe(false);
    }
    expect(ADMIN_WORKSPACE).toContain('FinalOperatingCertificationPanel');
  });

  it('introduces no new workspace route (route count unchanged = 5)', () => {
    expect(Object.keys(WORKSPACE_ROUTES)).toEqual(['banker', 'team', 'manager', 'executive', 'admin']);
    expect((APP.match(/<WorkspaceGate allowed=/g) ?? []).length).toBe(5);
  });
});

describe('198 — console stays read-only / action-free', () => {
  it('the console source renders no button / action affordance', () => {
    expect(CONSOLE_SRC).not.toMatch(/<button/);
    expect(CONSOLE_SRC).not.toMatch(/onClick|onSubmit/);
    expect(CONSOLE_SRC).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync|getClient|\bfetch\(/);
  });

  it('the console renders the standing safety posture lines', () => {
    expect(CONSOLE_SRC).toMatch(/No live gate is flipped by this console\./);
    expect(CONSOLE_SRC).toMatch(/CRM writeback remains gated\./);
    expect(CONSOLE_SRC).toMatch(/Workflow writes remain gated\./);
    expect(CONSOLE_SRC).toMatch(/Borrower communications remain disabled\./);
    expect(CONSOLE_SRC).toMatch(/Checklist generation remains disabled\./);
  });
});

describe('198 — no drift', () => {
  it('the recommendation remains CONDITIONAL_GO', () => {
    expect(deriveReleaseGovernanceSnapshot().recommendation).toBe('CONDITIONAL_GO');
  });
  it('create + checklist gates remain false and rollout disabled by default', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });
  it('the admin workspace mount introduces no fake-data literal', () => {
    expect(ADMIN_WORKSPACE).not.toMatch(FAKE_DATA_RE);
  });
});

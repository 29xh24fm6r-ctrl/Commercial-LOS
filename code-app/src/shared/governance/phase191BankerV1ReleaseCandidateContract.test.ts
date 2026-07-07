import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import { evaluateBankerCreateRollout } from '../../deals/bankerNewDealCreateRollout';

/**
 * PHASE 191 — Banker V1 release-candidate hardening contract.
 *
 * Release-critical pins for the banker-facing LOS path: workspace entry →
 * New Deal create → deal review → tasks → documents → checklist → CRM facts →
 * credit memo preview → readiness/status. These tests enforce the go/no-go
 * matrix in docs/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING.md as
 * executable invariants. This phase enables NOTHING: no checklist generation,
 * no borrower comms, no fake data, no permission widening, no schema change.
 *
 * We assert against actual CODE (comments stripped) so safety docstrings that
 * legitimately name "email / borrower / handoff" never trip a comms pin.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const APP = read('src/App.tsx');
const WORKSPACE_ROUTES_SRC = read('src/bootstrap/workspaceRoutes.ts');
const BOOTSTRAP_FLOW = read('src/bootstrap/bootstrapFlow.ts');
const WORKSPACE_GATE = read('src/bootstrap/WorkspaceGate.tsx');
const BANKER_WORKSPACE = read('src/workspaces/BankerWorkspace.tsx');
const BANKER_SHELL = read('src/banker/BankerShell.tsx');
const LENDING_OS = read('src/banker/LendingOSLayout.tsx');
const NEW_DEAL_CREATE = read('src/banker/BankerNewDealCreate.tsx');
const DEAL_ROUTE = read('src/deals/DealRoute.tsx');
const DEAL_WORKSPACE = read('src/deals/BankerDealWorkspace.tsx');
const DEAL_DOCUMENTS = read('src/deals/DealDocuments.tsx');
const CHECKLIST_PANEL = read('src/deals/DocumentChecklistPilotPanel.tsx');
const CRM_PANEL = read('src/crm/CrmRelationshipPanel.tsx');
const CRM_DETAIL_CARDS = read('src/crm/CrmRelationshipDetailCards.tsx');
const PKG = read('package.json');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');
const DOC_REL = 'docs/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING.md';

/** Strip block + whole-line comments so safety DOCSTRINGS never trip a code pin. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Fake/sample/demo *data* identifiers that must never appear in production. */
const FAKE_DATA_RE =
  /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|SAMPLE_DATA|DEMO_DATA|MOCK_DATA|FAKE_DATA|FallbackDashboard|fallbackDashboard)\b/;

// ---------------------------------------------------------------------------
// 1. Banker workspace route exists + is reachable from workspace routing.
// ---------------------------------------------------------------------------
describe('191 — banker workspace route exists and is reachable', () => {
  it('the banker workspace route is defined', () => {
    expect(WORKSPACE_ROUTES.banker).toBe('/workspaces/banker');
    expect(WORKSPACE_ROUTES_SRC).toMatch(/banker:\s*'\/workspaces\/banker'/);
  });

  it('App mounts the banker route behind a fail-closed WorkspaceGate', () => {
    expect(APP).toMatch(/path=\{WORKSPACE_ROUTES\.banker\}/);
    expect(APP).toMatch(/<WorkspaceGate allowed=\{WORKSPACE_ROUTES\.banker\}>/);
    expect(APP).toMatch(/<BankerWorkspace\s*\/>/);
  });

  it('the deal workspace is reachable via the /deals/:dealId route', () => {
    expect(APP).toMatch(/path="\/deals\/:dealId"/);
    expect(APP).toMatch(/<DealRoute\s*\/>/);
    // Banker branch of the dispatcher mounts the banker deal workspace.
    expect(DEAL_ROUTE).toMatch(/route === WORKSPACE_ROUTES\.banker/);
    expect(DEAL_ROUTE).toMatch(/<BankerDealWorkspace/);
  });
});

// ---------------------------------------------------------------------------
// 2. Permission-before-render stays fail-closed; no fallback dashboard.
// ---------------------------------------------------------------------------
describe('191 — fail-closed permission + no fallback dashboard', () => {
  it('WorkspaceGate bounces unauthorized routes (never leaks a workspace)', () => {
    expect(WORKSPACE_GATE).toMatch(/<Navigate to=\{route\} replace \/>/);
  });

  it('BankerWorkspace blocks render until a banker identity resolves (BankerProvider)', () => {
    expect(BANKER_WORKSPACE).toMatch(/<BankerProvider>/);
    expect(BANKER_WORKSPACE).toMatch(/<BankerShell/);
  });

  it('bootstrap fails closed: no default workspace, no fallback dashboard', () => {
    expect(BOOTSTRAP_FLOW).toMatch(/no fallback dashboard/i);
    expect(WORKSPACE_ROUTES_SRC).toMatch(/Fail closed/i);
    // The catch-all route returns home (re-evaluates bootstrap), not a dashboard.
    expect(APP).toMatch(/path="\*" element=\{<Navigate to="\/" replace \/>\}/);
  });

  it('no banker-path source imports or defines a fallback/sample dashboard', () => {
    for (const src of [APP, BANKER_WORKSPACE, BANKER_SHELL, LENDING_OS, DEAL_WORKSPACE]) {
      expect(stripComments(src)).not.toMatch(FAKE_DATA_RE);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. No sample/demo/fake data in the production banker path.
// ---------------------------------------------------------------------------
describe('191 — no fake/sample/demo data in the production banker path', () => {
  const PROD_BANKER_FILES = [
    'src/banker/BankerShell.tsx',
    'src/banker/BankerWorkspace.tsx', // (re-export safety; see BankerWorkspace under workspaces)
    'src/workspaces/BankerWorkspace.tsx',
    'src/banker/LendingOSLayout.tsx',
    'src/banker/PersonalPipeline.tsx',
    'src/banker/dealQueries.ts',
    'src/banker/workQueue.ts',
    'src/deals/BankerDealWorkspace.tsx',
    'src/deals/DealDocuments.tsx',
  ].filter((rel) => existsSync(resolve(ROOT, rel)));

  it('production banker/deal sources contain no fake-data literals', () => {
    for (const rel of PROD_BANKER_FILES) {
      const code = stripComments(read(rel));
      expect(code, `${rel} must carry no fake-data literal`).not.toMatch(FAKE_DATA_RE);
    }
  });

  it('the banker workspace does not import a sample/demo/seed data module', () => {
    const importLines = (src: string) => (src.match(/^import[^;]*;/gm) ?? []).join('\n');
    for (const src of [BANKER_SHELL, BANKER_WORKSPACE, LENDING_OS]) {
      expect(importLines(src)).not.toMatch(/sample|demo|seed|mock|fixture|fake/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. New Deal create stays mounted, reachable, and certified-write governed.
// ---------------------------------------------------------------------------
describe('191 — New Deal create mounted + governed (fail-closed)', () => {
  it('BankerShell mounts the New Deal create surface', () => {
    expect(BANKER_SHELL).toMatch(/import \{ BankerNewDealCreate \} from '\.\/BankerNewDealCreate'/);
    expect(BANKER_SHELL).toMatch(/<BankerNewDealCreate\s*\/>/);
  });

  it('the create surface is governed by the certified Phase 181C rollout gate', () => {
    expect(NEW_DEAL_CREATE).toMatch(/evaluateBankerCreateRollout/);
  });

  it('the three create hard-gates are false by default → rollout is disabled (fail-closed)', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    // With no overrides the certified gate returns 'disabled' (no uncertified write).
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });
});

// ---------------------------------------------------------------------------
// 5. Deal workspace primary surfaces stay mounted.
// ---------------------------------------------------------------------------
describe('191 — deal workspace primary surfaces mounted', () => {
  it('imports + mounts overview, tasks, documents, credit memo, CRM, readiness', () => {
    // Imports present.
    for (const token of [
      "import { DealHeader } from './DealHeader'",
      "import { DealTasks } from './DealTasks'",
      "import { DealDocuments } from './DealDocuments'",
      "import { CreditMemo } from './CreditMemo'",
      "import { DealCrmRelationshipPanel } from '../crm/CrmRelationshipPanel'",
      "import { DealBlockers } from './DealBlockers'",
      "import { DealStageProgressionCard } from './DealStageProgressionCard'",
    ]) {
      expect(DEAL_WORKSPACE).toContain(token);
    }
  });

  it('renders each release-critical surface element', () => {
    for (const re of [
      /<DealHeader/,
      /<DealTasks/,
      /<DealDocuments/,
      /<CreditMemo/,
      /<DealCrmRelationshipPanel/,
      /<DealBlockers/,
      /<DealStageProgressionCard/,
    ]) {
      expect(DEAL_WORKSPACE).toMatch(re);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Document checklist pilot stays safe/controlled + comms-free.
// ---------------------------------------------------------------------------
describe('191 — document checklist pilot safe/controlled', () => {
  it('the panel is mounted banker-only, read-only (never in manager read-only mode)', () => {
    expect(DEAL_DOCUMENTS).toMatch(/!readOnly && banker && \(\s*<DocumentChecklistPilotPanel/);
    // No generate action wiring is passed from the production document surface.
    expect(DEAL_DOCUMENTS).not.toMatch(/onGenerate/);
    expect(DEAL_DOCUMENTS).not.toMatch(/generateActionEnabled/);
  });

  it('the panel renders disabled by default (generation never reachable from prod UI)', () => {
    expect(CHECKLIST_PANEL).toMatch(/const generateDisabled = true/);
    expect(CHECKLIST_PANEL).toMatch(
      /generateActionEnabled = DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED/,
    );
  });

  it('the checklist pilot path wires no borrower comms (code, sans docstring)', () => {
    const code = stripComments(CHECKLIST_PANEL);
    for (const re of [
      /\bemail\b/i,
      /\bsms\b/i,
      /\boutlook\b/i,
      /\bhandoff\b/i,
      /mailto:/i,
      /sendDocumentRequest|sendBorrower|BorrowerCommunication/,
    ]) {
      expect(code).not.toMatch(re);
    }
    // The panel imports only pure local + shared-UI + react modules.
    const specs = (CHECKLIST_PANEL.match(/from '([^']+)'/g) ?? []).map((m) =>
      m.replace(/^from '|'$/g, ''),
    );
    const allowed = new Set([
      'react',
      '../shared/Badge',
      '../shared/theme',
      './documentChecklistPilotViewModel',
      './documentChecklistPilotConfig',
    ]);
    for (const s of specs) expect(allowed.has(s), `unexpected import ${s}`).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. All checklist gates remain false.
// ---------------------------------------------------------------------------
describe('191 — checklist gates remain false', () => {
  it('the two pilot-UI gates are false; generation reset to safe default off (constants)', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });

  it('the two pilot-UI gates stay declared false; generation is false in source', () => {
    const config = read('src/deals/documentChecklistPilotConfig.ts');
    const flags = read('src/deals/dealOriginationFeatureFlags.ts');
    expect(config).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED = false as const/);
    expect(config).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED = false as const/);
    expect(flags).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED = false as const/);
  });
});

// ---------------------------------------------------------------------------
// 8. CRM relationship detail cards stay read-only; the panel's blocker-
//    resolution links are governed (no direct Dataverse client).
// ---------------------------------------------------------------------------
describe('191 — CRM relationship detail read-only; panel links are governed', () => {
  it('the CRM cards are mounted in the deal workspace', () => {
    expect(DEAL_WORKSPACE).toMatch(/<DealCrmRelationshipPanel/);
  });

  it('the CRM DETAIL CARDS remain strictly read-only (no write affordance or Dataverse client)', () => {
    // The detail cards are pure projection — they must never gain a write
    // affordance or touch the SDK.
    const code = stripComments(CRM_DETAIL_CARDS);
    expect(code).not.toMatch(/onClick|<button|onSave|onCreate|onUpdate|onDelete/i);
    expect(code).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(code).not.toMatch(/@microsoft\/power-apps|getClient/);
  });

  it('the CRM panel performs NO direct Dataverse write — blocker links route through the governed link action', () => {
    // The panel may render governed "Link CRM client" / "Assign owning team"
    // affordances to resolve a missing canonical client / owning team, but it
    // must never touch the Dataverse client directly: the write goes through
    // linkDealCrmEntity (fail-closed auth → update → readback → audit), whose
    // live deps dynamic-import the SDK outside this UI module.
    const code = stripComments(CRM_PANEL);
    expect(code).not.toMatch(/createRecordAsync|updateRecordAsync|deleteRecordAsync/);
    expect(code).not.toMatch(/@microsoft\/power-apps|getClient/);
    expect(code).toMatch(/linkDealCrmEntity/);
  });

  it('the CRM surfaces declare their read-only / governed posture', () => {
    expect(CRM_PANEL).toMatch(/read-only/i);
    expect(CRM_DETAIL_CARDS).toMatch(/read-only|no write affordance|No Dataverse/i);
  });
});

// ---------------------------------------------------------------------------
// 9. No route count regression.
// ---------------------------------------------------------------------------
describe('191 — no workspace route count regression', () => {
  it('exactly five workspace routes remain', () => {
    expect(Object.keys(WORKSPACE_ROUTES)).toEqual([
      'banker',
      'team',
      'manager',
      'executive',
      'admin',
    ]);
  });

  it('App mounts five gated workspace routes + the deal route', () => {
    const gateMounts = APP.match(/<WorkspaceGate allowed=/g) ?? [];
    expect(gateMounts.length).toBe(5);
    expect(APP).toMatch(/path="\/deals\/:dealId"/);
  });
});

// ---------------------------------------------------------------------------
// 10. Phase 190A build recovery stays wired; snapshot includes Phase 191 doc.
// ---------------------------------------------------------------------------
describe('191 — build recovery wired + release doc tracked', () => {
  it('the Phase 190A preflight remains wired into the build', () => {
    expect(PKG).toMatch(
      /"build":\s*"node scripts\/phase190A-power-artifact-preflight\.mjs --ensure && tsc -b && vite build"/,
    );
  });

  it('the Phase 191 release-candidate doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });

  it('the release-candidate snapshot references the Phase 191 doc', () => {
    expect(SNAPSHOT).toMatch(/PHASE_191_BANKER_V1_RELEASE_CANDIDATE_HARDENING/);
  });
});

// ---------------------------------------------------------------------------
// 11. The Phase 191 doc records the go/no-go matrix + safety statements.
// ---------------------------------------------------------------------------
describe('191 — doc records the go/no-go matrix + safety statements', () => {
  const DOC = read(DOC_REL);

  it('names the full banker V1 surface inventory', () => {
    for (const surface of [
      /workspace/i,
      /new deal/i,
      /deal detail|deal workspace/i,
      /tasks/i,
      /documents/i,
      /checklist/i,
      /credit memo/i,
      /CRM/,
      /readiness|status/i,
    ]) {
      expect(DOC).toMatch(surface);
    }
  });

  it('records a green/yellow/red certification status and P0/P1/P2 blockers', () => {
    expect(DOC).toMatch(/green/i);
    expect(DOC).toMatch(/yellow/i);
    expect(DOC).toMatch(/red/i);
    expect(DOC).toMatch(/P0/);
    expect(DOC).toMatch(/P1/);
    expect(DOC).toMatch(/P2/);
  });

  it('makes the explicit no-fake-data + no-borrower-comms statements', () => {
    expect(DOC).toMatch(/no fake.*data|no sample.*data|no fabricated/i);
    expect(DOC).toMatch(/no borrower comms|no borrower communication/i);
  });

  it('records the build-from-no-.power verification', () => {
    expect(DOC).toMatch(/\.power/);
    expect(DOC).toMatch(/pnpm build/);
    expect(DOC).toMatch(/phase190A|190A/i);
  });

  it('keeps the three checklist gates documented false', () => {
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_PILOT_UI_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED\s*=\s*false/);
    expect(DOC).toMatch(/DOCUMENT_CHECKLIST_GENERATION_ENABLED\s*=\s*false/);
  });

  it('states an explicit go/no-go recommendation', () => {
    expect(DOC).toMatch(/CONDITIONAL GO|NO-GO|\bGO\b/);
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveReleaseGovernanceSnapshot,
  type LaunchReadinessDomain,
} from '../../admin/releaseGovernanceSnapshot';
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
 * PHASE 197 — Full System Launch Readiness contract.
 *
 * Pins that the launch-readiness model honestly reports CONDITIONAL_GO for the
 * current fail-closed posture, that every required domain is present with the
 * right status + language, that the doc records the gated/safety posture, and
 * that no gate is flipped and no secret/PII is committed.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_197_FULL_SYSTEM_LAUNCH_READINESS.md';
const MODEL_REL = 'src/admin/releaseGovernanceSnapshot.ts';
const CONSOLE_REL = 'src/admin/FullSystemLaunchReadinessConsole.tsx';
const COMPONENT_TEST_REL = 'src/admin/FullSystemLaunchReadinessConsole.test.tsx';
const CONTRACT_TEST_REL = 'src/shared/governance/phase197FullSystemLaunchReadinessContract.test.ts';

const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

const readiness = deriveReleaseGovernanceSnapshot();
const byId = (id: string): LaunchReadinessDomain => {
  const d = readiness.domains.find((x) => x.id === id);
  if (!d) throw new Error(`domain ${id} missing`);
  return d;
};
const allText = (d: LaunchReadinessDomain): string =>
  [...d.details, ...d.requiredActions, ...d.safetyNotes].join('\n');

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_RE = /\bhttps?:\/\/[a-z]/i;
const USER_PATH_RE = /[A-Za-z]:\\Users\\|\/Users\/[a-z]|\/home\/[a-z]/i;

// ---------------------------------------------------------------------------
// 1. Files + snapshot.
// ---------------------------------------------------------------------------
describe('197 — files exist and snapshot tracks the phase', () => {
  it('the Phase 197 doc, model, and console files exist', () => {
    for (const rel of [DOC_REL, MODEL_REL, CONSOLE_REL, COMPONENT_TEST_REL, CONTRACT_TEST_REL]) {
      expect(existsSync(resolve(ROOT, rel)), rel).toBe(true);
    }
  });
  it('the release-candidate snapshot references Phase 197', () => {
    expect(SNAPSHOT).toMatch(/PHASE_197_FULL_SYSTEM_LAUNCH_READINESS/);
  });
});

// ---------------------------------------------------------------------------
// 2. Recommendation + domains.
// ---------------------------------------------------------------------------
describe('197 — model recommendation + domains', () => {
  it('deriveReleaseGovernanceSnapshot() returns CONDITIONAL_GO', () => {
    expect(readiness.recommendation).toBe('CONDITIONAL_GO');
    expect(readiness.label).toBe('CONDITIONAL GO');
  });

  it('all required domains exist', () => {
    const ids = readiness.domains.map((d) => d.id);
    for (const id of [
      'banker-workspace',
      'new-deal-create',
      'crm-salesforce-ncino',
      'workflow-factory',
      'credit-committee-compliance',
      'data-quality-no-fake-data',
      'permissions-entitlements',
      'operator-admin-readiness',
      'build-release',
      'final-launch-decision',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('Banker Workspace is ready', () => {
    const d = byId('banker-workspace');
    expect(d.status).toBe('ready');
    expect(allText(d)).toMatch(/built, governed, and permission controlled/i);
  });

  it('New Deal Create is conditional with gates-false / operator-enablement / no-actorless', () => {
    const d = byId('new-deal-create');
    expect(d.status).toBe('conditional');
    const t = allText(d);
    expect(t).toMatch(/global create gates remain false/i);
    expect(t).toMatch(/operator enablement/i);
    expect(t).toMatch(/no actorless create/i);
  });

  it('CRM / Salesforce / nCino is conditional: foundation built but writeback gated/fail-closed', () => {
    const d = byId('crm-salesforce-ncino');
    expect(d.status).toBe('conditional');
    const t = allText(d);
    expect(t).toMatch(/built, mounted, and certified/i);
    expect(t).toMatch(/CRM writeback remains gated|fail-closed/i);
  });

  it('Workflow is conditional: writes/generation remain fail-closed, no borrower send', () => {
    const d = byId('workflow-factory');
    expect(d.status).toBe('conditional');
    const t = allText(d);
    expect(t).toMatch(/fail-closed/i);
    expect(t).toMatch(/no borrower send path/i);
  });

  it('Credit/Committee/Compliance says Phase 192 + no fake approval + no fabricated source facts', () => {
    const d = byId('credit-committee-compliance');
    const t = allText(d);
    expect(t).toMatch(/Phase 192/);
    expect(t).toMatch(/no fake approval/i);
    expect(t).toMatch(/no fabricated source facts/i);
  });

  it('Data Quality says no sample/fake/demo data + missing data shown honestly', () => {
    const d = byId('data-quality-no-fake-data');
    const t = allText(d);
    expect(t).toMatch(/no sample \/ fake \/ demo data|no sample\/fake\/demo data/i);
    expect(t).toMatch(/missing data must be shown honestly/i);
  });

  it('Permissions is ready: permission-before-render + fail-closed', () => {
    const d = byId('permissions-entitlements');
    expect(d.status).toBe('ready');
    const t = allText(d);
    expect(t).toMatch(/permission-before-render/i);
    expect(t).toMatch(/fail closed|fail-closed/i);
  });

  it('Build/Release is ready and pins Phase 190A preflight', () => {
    const d = byId('build-release');
    expect(d.status).toBe('ready');
    expect(allText(d)).toMatch(/190A/);
  });

  it('Operator/Admin references Phase 195/196 + rollback + signoff', () => {
    const d = byId('operator-admin-readiness');
    const t = allText(d);
    expect(t).toMatch(/Phase 195/);
    expect(t).toMatch(/Phase 196/);
    expect(t).toMatch(/rollback/i);
    expect(t).toMatch(/signoff|sign off/i);
  });

  it('Final Launch Decision is conditional, says CONDITIONAL_GO, lists operator actions', () => {
    const d = byId('final-launch-decision');
    expect(d.status).toBe('conditional');
    expect(allText(d)).toMatch(/CONDITIONAL_GO/);
    expect(d.requiredActions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Gates remain false + rollout disabled.
// ---------------------------------------------------------------------------
describe('197 — no gate flipped', () => {
  it('create + pilot-UI gates remain false; checklist generation is gated', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });
  it('evaluateBankerCreateRollout() returns disabled by default', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });
});

// ---------------------------------------------------------------------------
// 4. Doc posture + safety statements.
// ---------------------------------------------------------------------------
describe('197 — doc posture statements', () => {
  it('records CONDITIONAL GO', () => {
    expect(DOC).toMatch(/CONDITIONAL GO/);
  });
  it('states no schema / no migration / no gate flip / no uncontrolled writes', () => {
    expect(DOC).toMatch(/no schema/i);
    expect(DOC).toMatch(/no migration/i);
    expect(DOC).toMatch(/no live gate flip|no gate flip|flips no gate/i);
    expect(DOC).toMatch(/no uncontrolled writes|no uncontrolled write/i);
  });
  it('states no borrower comms / no checklist generation / no CRM writeback', () => {
    expect(DOC).toMatch(/no borrower comms|no borrower communication/i);
    expect(DOC).toMatch(/no checklist generation/i);
    expect(DOC).toMatch(/no CRM writeback/i);
  });
  it('records the required operator actions to move to GO', () => {
    expect(DOC).toMatch(/required operator actions/i);
    expect(DOC).toMatch(/move .*CONDITIONAL GO to GO|to move to GO|to GO/i);
  });
});

// ---------------------------------------------------------------------------
// 5. No secrets / GUIDs / URLs / paths / PII in the new doc + source files.
// ---------------------------------------------------------------------------
describe('197 — no secrets / PII committed', () => {
  it('the doc + new source files contain no real GUIDs, URLs, or local user paths', () => {
    // The contract test file itself is excluded: it defines the detection
    // regexes (which are pattern text, not real secrets).
    for (const rel of [DOC_REL, MODEL_REL, CONSOLE_REL, COMPONENT_TEST_REL]) {
      const src = read(rel);
      expect(GUID_RE.test(src), `${rel} GUID`).toBe(false);
      expect(URL_RE.test(src), `${rel} URL`).toBe(false);
      expect(USER_PATH_RE.test(src), `${rel} path`).toBe(false);
    }
  });
});

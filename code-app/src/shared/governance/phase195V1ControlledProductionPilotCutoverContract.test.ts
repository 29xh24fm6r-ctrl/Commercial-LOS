import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * PHASE 195 — V1 controlled production pilot cutover contract.
 *
 * This phase is a runbook (docs) + this governance test. It adds NO production
 * code path, NO schema, NO migration, and flips NO gate. These pins enforce the
 * no-code-change posture and that the cutover runbook documents the required
 * preflight / enablement / smoke / evidence / rollback / stop-condition /
 * go-no-go content.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_195_V1_CONTROLLED_PRODUCTION_PILOT_CUTOVER.md';
const PKG = read('package.json');
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

// ---------------------------------------------------------------------------
// 1. Doc + snapshot + prior release docs.
// ---------------------------------------------------------------------------
describe('195 — cutover runbook exists and is tracked', () => {
  it('the Phase 195 cutover doc exists on disk', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the release-candidate snapshot references the Phase 195 doc', () => {
    expect(SNAPSHOT).toMatch(/PHASE_195_V1_CONTROLLED_PRODUCTION_PILOT_CUTOVER/);
  });
  it('the Phase 194 enablement doc remains present', () => {
    expect(existsSync(resolve(ROOT, 'docs/PHASE_194_CONTROLLED_LIVE_NEW_DEAL_CREATE_ENABLEMENT.md'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. No-code-change posture: gates unchanged + rollout disabled by default.
// ---------------------------------------------------------------------------
describe('195 — no-code-change posture (no gate flipped)', () => {
  it('the three global create gates remain false', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(read('src/deals/dealOriginationFeatureFlags.ts')).toMatch(/BANKER_NEW_DEAL_CREATE_ENABLED = false as const/);
    expect(read('src/deals/newDealCreateFeatureFlags.ts')).toMatch(/NEW_DEAL_CREATE_ADAPTER_ENABLED = false as const/);
    expect(read('src/admin/adminNewDealIntakeModel.ts')).toMatch(/NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED = false as const/);
  });

  it('evaluateBankerCreateRollout() returns disabled by default', () => {
    expect(evaluateBankerCreateRollout()).toBe('disabled');
  });

  it('the two pilot-UI gates remain false; generation is launched', () => {
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(true);
  });

  it('the Phase 190A build preflight remains wired into the build', () => {
    expect(PKG).toMatch(/"build":\s*"node scripts\/phase190A-power-artifact-preflight\.mjs --ensure && tsc -b && vite build"/);
  });
});

// ---------------------------------------------------------------------------
// 3. The runbook documents the required cutover content.
// ---------------------------------------------------------------------------
describe('195 — runbook content', () => {
  const DOC = read(DOC_REL);

  it('declares the no-goals (no code path, no schema/migration, no gate flip)', () => {
    expect(DOC).toMatch(/no production code path|does not[\s\S]*Add a production code path/i);
    expect(DOC).toMatch(/no schema|Change Dataverse schema/i);
    expect(DOC).toMatch(/migration/i);
    expect(DOC).toMatch(/BANKER_NEW_DEAL_CREATE_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_CREATE_ADAPTER_ENABLED/);
    expect(DOC).toMatch(/NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED/);
  });

  it('contains the required operator checklists', () => {
    expect(DOC).toMatch(/preflight checklist/i);
    expect(DOC).toMatch(/controlled enablement checklist/i);
    expect(DOC).toMatch(/smoke checklist/i);
    expect(DOC).toMatch(/evidence checklist/i);
    expect(DOC).toMatch(/rollback checklist/i);
    expect(DOC).toMatch(/stop conditions/i);
  });

  it('requires recorded pilot identities and forbids actorless create', () => {
    expect(DOC).toMatch(/pilot identities/i);
    expect(DOC).toMatch(/System User id/i);
    expect(DOC).toMatch(/No actorless create/i);
  });

  it('pins the safety invariants in the cutover steps', () => {
    expect(DOC).toMatch(/\/cr664_users\(<CoreUser>\)|\/cr664_users/);
    expect(DOC).toMatch(/\/systemusers/);
    expect(DOC).toMatch(/certified allow-list/i);
    expect(DOC).toMatch(/no borrower comms|no borrower communication/i);
    expect(DOC).toMatch(/checklist generation/i);
    expect(DOC).toMatch(/CRM write/i);
    expect(DOC).toMatch(/no fake\/sample\/demo|fake\/sample\/demo data/i);
  });

  it('records immediate, non-destructive rollback via the pilot switch', () => {
    expect(DOC).toMatch(/rollback is immediate and non-destructive/i);
    expect(DOC).toMatch(/BANKER_CREATE_PILOT_ENABLED/);
    expect(DOC).toMatch(/existing created deal remains accessible/i);
  });

  it('states V1.0 GO and NO-GO criteria and a recommendation', () => {
    expect(DOC).toMatch(/###?\s*GO/);
    expect(DOC).toMatch(/NO-GO/);
    expect(DOC).toMatch(/READY FOR CONTROLLED PILOT CUTOVER/i);
  });

  it('records the build-from-no-.power posture', () => {
    expect(DOC).toMatch(/\.power/);
    expect(DOC).toMatch(/build/i);
  });
});

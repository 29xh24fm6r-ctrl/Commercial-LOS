import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  deriveFinalV1ReleaseDecision,
  type FinalReleaseDecision,
} from '../../admin/finalV1ReleaseDecisionModel';
import {
  deriveFullSystemLaunchReadiness,
  type LaunchReadinessDomain,
} from '../../admin/fullSystemLaunchReadinessModel';
import { WORKSPACE_ROUTES } from '../../bootstrap/workspaceRoutes';
import { BANKER_NEW_DEAL_CREATE_ENABLED } from '../../deals/dealOriginationFeatureFlags';
import { NEW_DEAL_CREATE_ADAPTER_ENABLED } from '../../deals/newDealCreateFeatureFlags';
import { NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED } from '../../admin/adminNewDealIntakeModel';
import {
  DOCUMENT_CHECKLIST_PILOT_UI_ENABLED,
  DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED,
} from '../../deals/documentChecklistPilotConfig';
import { DOCUMENT_CHECKLIST_GENERATION_ENABLED } from '../../deals/dealOriginationFeatureFlags';

/**
 * PHASE 201 — Final V1.0 release decision contract.
 *
 * Pins the deterministic, evidence-driven final decision: default
 * CONDITIONAL_GO; GO is impossible without all-ready domains + complete evidence
 * + final signoff; a blocker or forbidden condition forces NO_GO. Also pins the
 * release docs, gate posture, action-free console, and no widening.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_201_V1_FINAL_RELEASE_DECISION.md';
const MODEL_REL = 'src/admin/finalV1ReleaseDecisionModel.ts';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');
const CONSOLE_SRC = read('src/admin/FullSystemLaunchReadinessConsole.tsx');
const APP = read('src/App.tsx');

const VALID: readonly FinalReleaseDecision[] = ['GO', 'CONDITIONAL_GO', 'NO_GO'];

/** A set of domains all marked ready (for the positive GO path). */
const ALL_READY: LaunchReadinessDomain[] = deriveFullSystemLaunchReadiness().domains.map((d) => ({
  ...d,
  status: 'ready',
}));
/** Same set but with one blocked domain. */
const ONE_BLOCKED: LaunchReadinessDomain[] = ALL_READY.map((d, i) =>
  i === 0 ? { ...d, status: 'blocked' } : d,
);
/** All ready but one still conditional. */
const ONE_CONDITIONAL: LaunchReadinessDomain[] = ALL_READY.map((d, i) =>
  i === 0 ? { ...d, status: 'conditional' } : d,
);

const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_RE = /\bhttps?:\/\/[a-z]/i;
const USER_PATH_RE = /[A-Za-z]:\\Users\\|\/Users\/[a-z]|\/home\/[a-z]/i;

const REQUIRED_SECTIONS = [
  'Final Decision',
  'Decision Date',
  'Evidence Sources',
  'Launch Domain Status',
  'Required Operator Signoffs',
  'Remaining Risks',
  'Explicit Non-Goals',
  'Gate Constants Verified',
  'Build / Test Verification',
  'Final Recommendation Rationale',
];

describe('201 — doc + model + snapshot exist', () => {
  it('the Phase 201 doc + model + contract test exist', () => {
    for (const rel of [DOC_REL, MODEL_REL, 'src/shared/governance/phase201V1FinalReleaseDecisionContract.test.ts']) {
      expect(existsSync(resolve(ROOT, rel)), rel).toBe(true);
    }
  });
  it('the snapshot references Phase 201 and the prior final-release phases', () => {
    expect(SNAPSHOT).toMatch(/PHASE_201_V1_FINAL_RELEASE_DECISION/);
    expect(SNAPSHOT).toMatch(/PHASE_200_V1_CUTOVER_EXECUTION_EVIDENCE/);
    expect(SNAPSHOT).toMatch(/PHASE_199_CERTIFIED_NEW_DEAL_CREATE_PILOT/);
    expect(SNAPSHOT).toMatch(/PHASE_198_SAFE_LAUNCH_READINESS_EXPOSURE/);
  });
});

describe('201 — deterministic decision values', () => {
  it('the default decision is one of GO / CONDITIONAL_GO / NO_GO', () => {
    expect(VALID).toContain(deriveFinalV1ReleaseDecision().decision);
  });
  it('the current posture decision is never a hardcoded GO', () => {
    // With the live-write gates reset to SAFE DEFAULTS (checklist generation
    // disabled, no broad create global flipped), there is no forbidden-for-GO
    // condition; the foundation is launch-ready but evidence/signoff remain
    // unresolved, so the live decision is CONDITIONAL_GO — never a hardcoded GO.
    expect(deriveFinalV1ReleaseDecision().decision).toBe('CONDITIONAL_GO');
  });
});

describe('201 — GO is impossible unless every condition holds', () => {
  it('GO cannot occur with unresolved conditional domains', () => {
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ONE_CONDITIONAL,
      allEvidenceComplete: true,
      finalSignoffPresent: true,
    });
    // GO never reachable: an unresolved conditional domain blocks GO, and the
    // launched live gate state independently forces NO_GO.
    expect(d.decision).not.toBe('GO');
  });

  it('GO cannot occur without complete (Phase 200) evidence', () => {
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ALL_READY,
      allEvidenceComplete: false,
      finalSignoffPresent: true,
    });
    expect(d.decision).not.toBe('GO');
  });

  it('GO cannot occur without the final signoff', () => {
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ALL_READY,
      allEvidenceComplete: true,
      finalSignoffPresent: false,
    });
    expect(d.decision).not.toBe('GO');
  });

  it('GO cannot occur if a forbidden condition (fake data / unsafe gate) is detected', () => {
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ALL_READY,
      allEvidenceComplete: true,
      finalSignoffPresent: true,
      forbiddenConditionDetected: true,
    });
    expect(d.decision).toBe('NO_GO');
  });

  it('all-ready + evidence + signoff yields GO only because no forbidden gate is set', () => {
    // With the live-write gates at SAFE DEFAULTS there is no forbidden-for-GO
    // condition, so the only path to GO is the full conjunction: every domain
    // ready AND complete evidence AND final signoff. Given that override, the
    // model reaches GO — but it can never be forced there without all conditions.
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ALL_READY,
      allEvidenceComplete: true,
      finalSignoffPresent: true,
    });
    expect(d.decision).toBe('GO');
  });
});

describe('201 — NO_GO is forced on blockers', () => {
  it('a blocked required domain forces NO_GO', () => {
    const d = deriveFinalV1ReleaseDecision({
      domainsOverride: ONE_BLOCKED,
      allEvidenceComplete: true,
      finalSignoffPresent: true,
    });
    expect(d.decision).toBe('NO_GO');
    expect(d.blockingDomains.length).toBeGreaterThan(0);
  });
});

describe('201 — all 10 domains represented + gates + no widening', () => {
  it('the readiness model still derives all 10 domains', () => {
    expect(deriveFullSystemLaunchReadiness().domains).toHaveLength(10);
  });
  it('create + pilot-UI gates remain false; checklist generation is gated', () => {
    expect(BANKER_NEW_DEAL_CREATE_ENABLED).toBe(false);
    expect(NEW_DEAL_CREATE_ADAPTER_ENABLED).toBe(false);
    expect(NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_PILOT_UI_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_UI_GENERATE_ACTION_ENABLED).toBe(false);
    expect(DOCUMENT_CHECKLIST_GENERATION_ENABLED).toBe(false);
  });
  it('no route widening (5 workspace routes) and console stays action-free', () => {
    expect(Object.keys(WORKSPACE_ROUTES)).toHaveLength(5);
    expect((APP.match(/<WorkspaceGate allowed=/g) ?? []).length).toBe(5);
    expect(CONSOLE_SRC).not.toMatch(/<button/);
    expect(CONSOLE_SRC).not.toMatch(/onClick|onSubmit/);
  });
});

describe('201 — doc content + hygiene', () => {
  it('records all required sections', () => {
    for (const s of REQUIRED_SECTIONS) expect(DOC.includes(s), s).toBe(true);
  });
  it('records a valid final decision value + CONDITIONAL_GO', () => {
    expect(DOC).toMatch(/release recommendation: (GO|CONDITIONAL_GO|NO_GO)/);
    expect(DOC).toMatch(/CONDITIONAL_GO/);
  });
  it('states the non-goals (no schema / migration / widening / hardcoded GO)', () => {
    expect(DOC).toMatch(/no schema change/i);
    expect(DOC).toMatch(/no migration/i);
    expect(DOC).toMatch(/no entitlement widening/i);
    expect(DOC).toMatch(/no hardcoded GO/i);
    expect(DOC).toMatch(/no borrower communication/i);
    expect(DOC).toMatch(/no CRM \/ workflow writes|no CRM\/workflow writes/i);
  });
  it('contains no real GUIDs, URLs, or local user paths (doc + model)', () => {
    for (const src of [DOC, read(MODEL_REL)]) {
      expect(GUID_RE.test(src)).toBe(false);
      expect(URL_RE.test(src)).toBe(false);
      expect(USER_PATH_RE.test(src)).toBe(false);
    }
  });
});

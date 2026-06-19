import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveFullSystemLaunchReadiness } from '../../admin/fullSystemLaunchReadinessModel';

/**
 * PHASE 200 — V1 cutover execution evidence contract.
 *
 * Pins that the cutover evidence document exists with all required sections, a
 * gate-posture table covering all 10 launch domains, real (non-placeholder)
 * evidence entries, no fake data, no secrets/GUIDs/URLs/paths, and that the
 * launch recommendation stays deterministic CONDITIONAL_GO with the final
 * decision still conditional.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const DOC_REL = 'docs/PHASE_200_V1_CUTOVER_EXECUTION_EVIDENCE.md';
const DOC = existsSync(resolve(ROOT, DOC_REL)) ? read(DOC_REL) : '';
const SNAPSHOT = read('src/shared/governance/releaseCandidateSnapshot.test.ts');

const REQUIRED_SECTIONS = [
  'Executive Summary',
  'Current Launch Recommendation',
  'Gate Posture',
  'New Deal Create Pilot Verification',
  'CRM / Salesforce / nCino Readiness',
  'Workflow Factory Readiness',
  'Credit / Committee / Compliance Readiness',
  'Data Quality / No Fake Data Verification',
  'Operator / Admin Readiness',
  'Build and Test Evidence',
  'Known Remaining Conditions',
  'Final Cutover Result',
];

const LAUNCH_DOMAINS = [
  'Banker Workspace',
  'Permissions / Entitlements',
  'Build / Release',
  'New Deal Create',
  'CRM / Salesforce / nCino',
  'Workflow Factory',
  'Credit / Committee / Compliance',
  'Data Quality / No Fake Data',
  'Operator / Admin Readiness',
  'Final V1.0 Launch Decision',
];

const FAKE_DATA_RE =
  /\b(sampleDeals|demoData|mockClients|fakeBorrower|sampleData|seedData|SAMPLE_DATA|DEMO_DATA|MOCK_DATA|FAKE_DATA)\b/;
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_RE = /\bhttps?:\/\/[a-z]/i;
const USER_PATH_RE = /[A-Za-z]:\\Users\\|\/Users\/[a-z]|\/home\/[a-z]/i;

describe('200 — doc exists + snapshot', () => {
  it('the Phase 200 cutover evidence doc exists', () => {
    expect(existsSync(resolve(ROOT, DOC_REL))).toBe(true);
  });
  it('the snapshot references Phase 200', () => {
    expect(SNAPSHOT).toMatch(/PHASE_200_V1_CUTOVER_EXECUTION_EVIDENCE/);
  });
});

describe('200 — required content', () => {
  it('contains all required sections', () => {
    for (const s of REQUIRED_SECTIONS) {
      expect(DOC.includes(s), s).toBe(true);
    }
  });

  it('the gate posture table includes all 10 launch domains', () => {
    for (const d of LAUNCH_DOMAINS) {
      expect(DOC.includes(d), d).toBe(true);
    }
  });

  it('evidence entries are structured and not placeholder-only', () => {
    for (const field of ['Check:', 'Result:', 'Evidence:', 'Residual Risk:', 'Owner:']) {
      expect(DOC.includes(field), field).toBe(true);
    }
    // Multiple real evidence blocks, each with a PASS/result — not a stub.
    expect((DOC.match(/Result:/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((DOC.match(/Owner:/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(DOC).toMatch(/PASS/);
  });

  it('records CONDITIONAL_GO and keeps the Final V1.0 Launch Decision conditional', () => {
    expect(DOC).toMatch(/Current recommendation:\s*\*\*CONDITIONAL_GO\*\*/);
    expect(DOC).toMatch(/Final V1\.0 Launch Decision \| conditional/);
  });

  it('states no schema / no migration / no fake data / gated writes', () => {
    expect(DOC).toMatch(/no schema/i);
    expect(DOC).toMatch(/no migration/i);
    expect(DOC).toMatch(/no fake data/i);
    expect(DOC).toMatch(/gated|fail-closed/i);
  });
});

describe('200 — hygiene', () => {
  it('introduces no fake-data identifiers', () => {
    expect(DOC).not.toMatch(FAKE_DATA_RE);
  });
  it('contains no real GUIDs, URLs, or local user paths', () => {
    expect(GUID_RE.test(DOC)).toBe(false);
    expect(URL_RE.test(DOC)).toBe(false);
    expect(USER_PATH_RE.test(DOC)).toBe(false);
  });
});

describe('200 — recommendation stays deterministic', () => {
  it('deriveFullSystemLaunchReadiness() remains CONDITIONAL_GO', () => {
    expect(deriveFullSystemLaunchReadiness().recommendation).toBe('CONDITIONAL_GO');
  });
});

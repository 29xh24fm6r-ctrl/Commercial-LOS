import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 113 — Microsoft Environment Landing Plan governance pin.
 *
 * No production code change in Phase 113. This file is the
 * lightweight CI guard that the Phase 113 deployment plan stays
 * in place and that the three sibling docs that should reference
 * it actually do. It pins:
 *
 *   1. The Phase 113 doc exists on disk.
 *   2. The Phase 113 doc covers the seven required structural
 *      sections (prerequisites, command checklist, first-launch
 *      validation, failure triage, solo-operator sequence, plus
 *      the current-facts and deployment-paths sections that
 *      anchor the rest).
 *   3. Phase 111 references Phase 113 as a prerequisite to real
 *      operator validation.
 *   4. Phase 112 references Phase 113 as a prerequisite before
 *      running the script.
 *   5. STABILIZATION_CHECKLIST references Phase 113 as the
 *      current real blocker.
 *
 * The pin does NOT scan command syntax or in-environment state.
 * That's the operator's job in the §G solo-operator sequence.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('Phase 113 — Microsoft Environment Landing Plan doc exists and is structurally complete', () => {
  it('docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md exists on disk', () => {
    expect(
      existsSync(
        resolve(REPO_ROOT, 'docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md'),
      ),
    ).toBe(true);
  });

  const REQUIRED_SECTION_HEADINGS: readonly { name: string; re: RegExp }[] = [
    {
      name: 'A. Current repository facts',
      re: /^##\s+A\.\s+Current repository facts/m,
    },
    {
      name: 'B. Required Microsoft prerequisites',
      re: /^##\s+B\.\s+Required Microsoft prerequisites/m,
    },
    {
      name: 'C. Deployment path options',
      re: /^##\s+C\.\s+Deployment path options/m,
    },
    {
      name: 'D. Exact command checklist',
      re: /^##\s+D\.\s+Exact command checklist/m,
    },
    {
      name: 'E. First-launch validation checklist',
      re: /^##\s+E\.\s+First-launch validation checklist/m,
    },
    {
      name: 'F. Failure triage table',
      re: /^##\s+F\.\s+Failure triage table/m,
    },
    {
      name: 'G. One-person execution mode (solo operator sequence)',
      re: /^##\s+G\.\s+One-person execution mode/m,
    },
  ];

  for (const { name, re } of REQUIRED_SECTION_HEADINGS) {
    it(`covers section "${name}"`, () => {
      const doc = readDoc('docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md');
      expect(re.test(doc), `expected section heading "${name}" in Phase 113 doc`).toBe(true);
    });
  }

  it('command checklist (§D) actually contains pac CLI commands the operator runs', () => {
    const doc = readDoc('docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md');
    // Belt-and-suspenders: the §D checklist must reference the four
    // pac commands the operator needs. These four together are the
    // minimum surface that proves §D is concrete, not abstract.
    expect(doc).toMatch(/pac\s+--version/);
    expect(doc).toMatch(/pac\s+auth\s+create/);
    expect(doc).toMatch(/pac\s+admin\s+list/);
    expect(doc).toMatch(/pac\s+code\s+push/);
  });

  it('failure triage table (§F) covers the brief\'s required failure modes', () => {
    const doc = readDoc('docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md');
    // The Phase 113 brief enumerated ten failure modes. Pin that
    // each appears in §F by name.
    const REQUIRED_FAILURES: readonly RegExp[] = [
      /JSON Parse error.*Unexpected EOF/i,
      /App blank\s*\/\s*frozen/i,
      /Workspace\s*\/\s*routing not resolved/i,
      /Generated service import failure/i,
      /Connector unavailable/i,
      /Dataverse table missing/i,
      /Permission denied/i,
      /Solution import failure/i,
      /Environment variable missing/i,
      /Office 365 Outlook consent failure/i,
    ];
    for (const re of REQUIRED_FAILURES) {
      expect(re.test(doc), `Phase 113 §F missing failure entry: ${re}`).toBe(true);
    }
  });

  it('solo-operator sequence (§G) covers the seven steps the brief requires', () => {
    const doc = readDoc('docs/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN.md');
    // The brief named seven solo-operator steps. Pin each by name.
    const REQUIRED_G_STEPS: readonly RegExp[] = [
      /create\s*\/\s*confirm.*environment/i,
      /prove\s+the\s+schema/i,
      /prove\s+app\s+package\s*\/\s*publish/i,
      /prove\s+app\s+launches/i,
      /prove\s+DRY_RUN\s+works/i,
      /prove\s+LIVE\s+smoke\s+test/i,
      /run\s+Phase\s+112\s+operator\s+validation/i,
    ];
    for (const re of REQUIRED_G_STEPS) {
      expect(re.test(doc), `Phase 113 §G missing step: ${re}`).toBe(true);
    }
  });
});

describe('Phase 113 — sibling docs reference Phase 113 as the current true blocker', () => {
  it('PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md references the Phase 113 plan AND names it as a prerequisite to operator validation', () => {
    const doc = readDoc('docs/PHASE_111_RELEASE_CANDIDATE_SNAPSHOT.md');
    expect(doc).toMatch(/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN\.md/);
    // Must call out that environment landing is a prerequisite.
    expect(doc).toMatch(
      /environment\s+landing\s+(?:is|must\s+complete|is\s+the\s+current\s+blocker|is\s+complete)/i,
    );
  });

  it('PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md references the Phase 113 plan AND names it as a prerequisite to running the script', () => {
    const doc = readDoc('docs/PHASE_112_OPERATOR_RC_VALIDATION_SCRIPT.md');
    expect(doc).toMatch(/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN\.md/);
    // Must explicitly say the script cannot run until Phase 113 is
    // complete.
    expect(doc).toMatch(
      /Phase\s+113.*(?:complete|prerequisite|landing|before)/i,
    );
  });

  it('STABILIZATION_CHECKLIST.md references the Phase 113 plan AND names environment landing as the current real blocker', () => {
    const doc = readDoc('docs/STABILIZATION_CHECKLIST.md');
    expect(doc).toMatch(/PHASE_113_MICROSOFT_ENVIRONMENT_LANDING_PLAN\.md/);
    // Must explicitly note environment landing as the current
    // blocker (not feature readiness). Both phrases must appear,
    // in either order — the doc may say either
    // "BLOCKER: environment landing" or "environment landing
    // is the blocker".
    expect(doc).toMatch(/environment\s+landing/i);
    expect(doc).toMatch(/(?:blocker|prerequisite|required|gate)/i);
    // Defensive: the doc must NOT claim the current blocker is
    // "feature readiness" — that would mis-route the operator.
    expect(doc).toMatch(/not\s+feature\s+readiness/i);
  });
});

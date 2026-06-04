import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCopilotAdapter } from '../../copilot/copilotAssistantAdapter';

/**
 * Phase 131A — Release-candidate validation governance pins.
 *
 * Locks the launch contract for the controlled team pilot:
 *   §1  the release-candidate validation doc exists and pins the top
 *       commit + the go/no-go + rollback sections;
 *   §2  every top-level workspace surface is documented in it;
 *   §3  the Copilot live connector stays NOT configured (default
 *       adapter), so the pilot ships inert-by-construction;
 *   §4  the local agent workspace (.claude/) is git-ignored so it can
 *       never be committed into the release bundle.
 *
 * Pure static-source + a pure adapter check. No SDK, no render.
 */

const REPO_SRC = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(REPO_SRC, '..');

function readRoot(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

const RC_DOC = 'docs/PHASE_131A_RELEASE_CANDIDATE_VALIDATION.md';

// The six live Platform Workspace names the deployed environment seeds
// (the top-level workspace surfaces a pilot user can land on).
const WORKSPACE_NAMES = [
  'Banker Workspace',
  'Team Workspace',
  'Manager Command Center',
  'Portfolio Management',
  'Executive Dashboard',
  'Admin Control Center',
] as const;

// ---------------------------------------------------------------------------
// §1 — the RC validation doc exists with the required sections
// ---------------------------------------------------------------------------

describe('Phase 131A §1 — release-candidate validation doc', () => {
  it('exists and pins the validated top commit', () => {
    const doc = readRoot(RC_DOC);
    expect(doc.length).toBeGreaterThan(0);
    expect(doc).toMatch(/5939799/);
  });

  it('carries the operator-critical sections (deploy / go-no-go / rollback / feedback)', () => {
    const doc = readRoot(RC_DOC);
    expect(doc).toMatch(/pac code push/);
    expect(doc).toMatch(/Go\s*\/\s*No-Go/i);
    expect(doc).toMatch(/Rollback/i);
    expect(doc).toMatch(/feedback/i);
  });
});

// ---------------------------------------------------------------------------
// §2 — every top-level workspace surface is documented
// ---------------------------------------------------------------------------

describe('Phase 131A §2 — workspace surfaces documented', () => {
  for (const name of WORKSPACE_NAMES) {
    it(`documents the "${name}" surface`, () => {
      expect(readRoot(RC_DOC)).toContain(name);
    });
  }

  it('documents the per-deal cockpit', () => {
    expect(readRoot(RC_DOC)).toMatch(/per-deal cockpit/i);
  });
});

// ---------------------------------------------------------------------------
// §3 — Copilot live connector remains not configured
// ---------------------------------------------------------------------------

describe('Phase 131A §3 — Copilot stays not-configured for the pilot', () => {
  it('the default adapter is not_configured', () => {
    expect(getCopilotAdapter().mode).toBe('not_configured');
  });

  it('the RC doc states the not-configured expectation', () => {
    expect(readRoot(RC_DOC)).toMatch(/not[\s-]configured/i);
  });
});

// ---------------------------------------------------------------------------
// §4 — .claude/ is git-ignored (never committed into the bundle)
// ---------------------------------------------------------------------------

describe('Phase 131A §4 — local agent workspace is git-ignored', () => {
  it('.gitignore lists .claude/', () => {
    const gitignore = readRoot('.gitignore');
    expect(gitignore).toMatch(/^\.claude\/?\s*$/m);
  });
});

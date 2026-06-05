import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 138A — Copilot completion certification governance.
 *
 * Phase 138A is docs + governance only. These pins lock the completion
 * certification content (137A–137M complete, live not enabled, gates,
 * repo-done vs live-done), re-confirm src/copilot has no drift, and prove
 * no runtime / server / schema source was added.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CERT_DOC = 'docs/PHASE_138A_COPILOT_COMPLETION_CERTIFICATION.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The completion certification exists and records the final status
// ---------------------------------------------------------------------------

describe('Phase 138A — completion certification doc exists', () => {
  it(`${CERT_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, CERT_DOC))).toBe(true);
  });
});

describe('Phase 138A — the certification records the final Copilot status', () => {
  const doc = readDoc(CERT_DOC);

  it('references every phase from 137A through 137M', () => {
    for (const p of [
      '137A', '137B', '137C', '137D', '137E', '137F', '137G',
      '137H', '137I', '137J', '137K', '137L', '137M',
    ]) {
      expect(doc, `phase ${p}`).toMatch(new RegExp(p));
    }
  });

  it('states Copilot readiness is complete but live enablement is not active', () => {
    expect(doc).toMatch(/Copilot readiness is complete/i);
    expect(doc).toMatch(/live enablement is intentionally NOT active/i);
  });

  it('states the runtime default remains not_configured', () => {
    expect(doc).toMatch(/Runtime default remains `?not_configured`?/i);
  });

  it('states no model calls / Dataverse writes / schema creation / Custom API invocation / plugin or Azure Function deployment', () => {
    expect(doc).toMatch(/no model call/i);
    expect(doc).toMatch(/no Dataverse write/i);
    expect(doc).toMatch(/no schema creation/i);
    expect(doc).toMatch(/no\s+Custom\s+API invocation/i);
    expect(doc).toMatch(/no plugin ?\/ ?Azure Function deployment/i);
  });

  it('lists the remaining external live-enablement gates', () => {
    expect(doc).toMatch(/Remaining live-enablement gates/i);
    expect(doc).toMatch(/BLOCKED ?\/ ?EXTERNAL/i);
    expect(doc).toMatch(/DLP \+ model policy approval/i);
    expect(doc).toMatch(/Azure OpenAI deployment approval/i);
    expect(doc).toMatch(/cr664_copilotauditevent[\s\S]{0,30}creation/i);
    expect(doc).toMatch(/cr664_RunLosCopilotAssist[\s\S]{0,30}creation/i);
    expect(doc).toMatch(/Server handler deployment/i);
    expect(doc).toMatch(/Production review/i);
  });

  it('defines repo-side done vs live done', () => {
    expect(doc).toMatch(/Definition of done/i);
    expect(doc).toMatch(/Repo-side Copilot readiness is DONE when/i);
    expect(doc).toMatch(/Live Copilot is NOT done/i);
  });

  it('recommends returning to core LOS product work unless governance approves next gates', () => {
    expect(doc).toMatch(/Recommended next action/i);
    expect(doc).toMatch(/return to core LOS product work/i);
    expect(doc).toMatch(/unless security ?\/ ?compliance approves/i);
    expect(doc).toMatch(/test tenant/i);
  });

  it('states the explicit non-goals (no live enablement in 138A)', () => {
    expect(doc).toMatch(/No live enablement in 138A/i);
    expect(doc).toMatch(/No schema creation\./i);
    expect(doc).toMatch(/No runtime UI change\./i);
  });

  it('includes the runtime truth table (default not_configured, isLive false)', () => {
    expect(doc).toMatch(/Runtime truth table/i);
    expect(doc).toMatch(/`?isLive`? by default[\s\S]{0,40}false/i);
  });
});

// ---------------------------------------------------------------------------
// 2. No runtime / server / schema source was added; src/copilot has no drift
// ---------------------------------------------------------------------------

describe('Phase 138A — default runtime stays not_configured', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('Phase 138A — no plugin / Azure Function / migration / schema source under src/', () => {
  const files = walk(resolve(REPO_ROOT, 'src'));

  it('no .cs / .csproj / .fsproj / .sln files', () => {
    expect(files.filter((f) => /\.(cs|csproj|fsproj|sln)$/i.test(f))).toEqual([]);
  });

  it('no Azure Function / migration / schema project files', () => {
    expect(
      files.filter(
        (f) =>
          /(^|[\\/])(function\.json|host\.json|local\.settings\.json)$/i.test(f) ||
          /\.sql$/i.test(f) ||
          /migration/i.test(f),
      ),
    ).toEqual([]);
  });
});

const COPILOT_DIR = resolve(REPO_ROOT, 'src', 'copilot');

function copilotSourceFiles(): string[] {
  return readdirSync(COPILOT_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((f) => `src/copilot/${f}`);
}

function code(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('Phase 138A — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotConnector.ts');
  });

  for (const rel of files) {
    it(`${rel} has no fetch / Azure OpenAI / secret / send / write reference`, () => {
      const c = code(rel);
      expect(c, `${rel}: fetch(`).not.toMatch(/\bfetch\(/);
      expect(c, `${rel}: XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(c, `${rel}: api.openai.com`).not.toMatch(/api\.openai\.com/i);
      expect(c, `${rel}: openai.azure.com`).not.toMatch(/openai\.azure\.com/i);
      expect(c, `${rel}: secret env`).not.toMatch(/AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/);
      expect(c, `${rel}: api key literal`).not.toMatch(/api[_-]?key\s*[:=]/i);
      expect(c, `${rel}: SendEmail`).not.toMatch(/SendEmail/i);
      expect(c, `${rel}: Office365`).not.toMatch(/Office365/i);
      expect(c, `${rel}: Graph`).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(c, `${rel}: Teams`).not.toMatch(/MicrosoftTeams|teams\.microsoft/i);
      expect(c, `${rel}: generated import`).not.toMatch(/from ['"][^'"]*\/generated\//);
      expect(c, `${rel}: write call`).not.toMatch(/\.(create|update|patch|delete)\s*\(/);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. The full 137A–137M doc set is still present (handoff package intact)
// ---------------------------------------------------------------------------

describe('Phase 138A — the full 137A–137M Copilot doc set is intact', () => {
  const DOCS = [
    'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md',
    'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md',
    'docs/PHASE_137C_COPILOT_CONNECTOR_SKELETON.md',
    'docs/PHASE_137D_COPILOT_TRANSPORT_SEAM.md',
    'docs/PHASE_137E_COPILOT_CUSTOM_API_TRANSPORT_STUB.md',
    'docs/PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md',
    'docs/PHASE_137G_COPILOT_CUSTOM_API_METADATA_SCRIPT.md',
    'docs/PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md',
    'docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md',
    'docs/PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md',
    'docs/PHASE_137K_COPILOT_AUDIT_LOGGER_SKELETON.md',
    'docs/PHASE_137L_COPILOT_SERVER_HANDLER_READINESS_BUNDLE.md',
    'docs/PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md',
  ];
  for (const rel of DOCS) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137M — Copilot governance checkpoint packet governance.
 *
 * Phase 137M is docs + governance only. These pins lock the checkpoint
 * packet content (the 137A–137L summary, gates, audit-before-model rule,
 * blockers, decision fork, operator checklist), re-confirm src/copilot has
 * no drift, and prove the phase added no runtime source.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CHECKPOINT_DOC = 'docs/PHASE_137M_COPILOT_GOVERNANCE_CHECKPOINT.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The checkpoint packet exists and records the governance summary
// ---------------------------------------------------------------------------

describe('Phase 137M — governance checkpoint doc exists', () => {
  it(`${CHECKPOINT_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, CHECKPOINT_DOC))).toBe(true);
  });
});

describe('Phase 137M — the checkpoint packet records the full runway', () => {
  const doc = readDoc(CHECKPOINT_DOC);

  it('references every phase from 137A through 137L', () => {
    for (const p of [
      '137A',
      '137B',
      '137C',
      '137D',
      '137E',
      '137F',
      '137G',
      '137H',
      '137I',
      '137J',
      '137K',
      '137L',
    ]) {
      expect(doc, `phase ${p}`).toMatch(new RegExp(p));
    }
  });

  it('states the runtime remains not_configured and nothing live exists', () => {
    expect(doc).toMatch(/Runtime default remains `?not_configured`?/i);
    expect(doc).toMatch(/architected but NOT live/i);
    expect(doc).toMatch(
      /no model calls,?[\s\S]{0,160}no Dataverse writes/i,
    );
    expect(doc).toMatch(/no schema creation/i);
    expect(doc).toMatch(/no live\s+transport/i);
  });

  it('documents the Browser → Dataverse Custom API → server-side Azure OpenAI architecture', () => {
    expect(doc).toMatch(
      /Browser → Dataverse Custom API[\s\S]{0,80}server-side[\s\S]{0,40}Azure OpenAI/i,
    );
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
  });

  it('rejects browser-direct Azure OpenAI, fake responses, autonomous writes, and client secrets', () => {
    expect(doc).toMatch(/Browser-direct Azure OpenAI[\s\S]{0,40}rejected/i);
    expect(doc).toMatch(/Fake local AI responses[\s\S]{0,40}rejected/i);
    expect(doc).toMatch(/Autonomous write agent[\s\S]{0,40}rejected/i);
    expect(doc).toMatch(/Unmanaged client secrets[\s\S]{0,40}rejected/i);
  });

  it('requires the audit-before-model rule', () => {
    expect(doc).toMatch(/Audit-before-model rule/i);
    expect(doc).toMatch(/No Azure OpenAI \/ model call before `?audit_start`? succeeds/i);
    expect(doc).toMatch(/audit_unavailable/);
  });

  it('requires DLP / model-policy approval before live enablement', () => {
    expect(doc).toMatch(/Gate 1 — DLP and Azure OpenAI model policy approval/i);
  });

  it('lists all nine governance gates', () => {
    for (let g = 1; g <= 9; g += 1) {
      expect(doc, `Gate ${g}`).toMatch(new RegExp(`Gate ${g}`));
    }
  });

  it('lists the remaining blockers', () => {
    expect(doc).toMatch(/Remaining blockers/i);
    expect(doc).toMatch(/Audit table \(`?cr664_copilotauditevent`?\) not created/i);
    expect(doc).toMatch(/Custom API \(`?cr664_RunLosCopilotAssist`?\) not created/i);
    expect(doc).toMatch(/Server handler not deployed/i);
  });

  it('includes a decision fork (three options)', () => {
    expect(doc).toMatch(/Decision fork/i);
    expect(doc).toMatch(/Option 1/);
    expect(doc).toMatch(/Option 2/);
    expect(doc).toMatch(/Option 3/);
  });

  it('includes an operator acceptance checklist', () => {
    expect(doc).toMatch(/Operator acceptance checklist/i);
    expect(doc).toMatch(/git working tree clean/i);
    expect(doc).toMatch(/disable switch verified/i);
    expect(doc).toMatch(/test tenant only/i);
  });

  it('states the explicit non-goals (no live enablement in 137M)', () => {
    expect(doc).toMatch(/No live enablement in 137M/i);
    expect(doc).toMatch(/No schema creation\./i);
    expect(doc).toMatch(/No runtime behavior change\./i);
  });

  it('includes the 137A–137L artifact table with live-risk status', () => {
    expect(doc).toMatch(/Live-risk status/i);
    expect(doc).toMatch(/Safe/);
  });
});

// ---------------------------------------------------------------------------
// 2. This phase added no runtime source (docs + governance tests only)
// ---------------------------------------------------------------------------

describe('Phase 137M — default runtime stays not_configured', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
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

describe('Phase 137M — src/copilot still has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotServerHandler.ts');
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

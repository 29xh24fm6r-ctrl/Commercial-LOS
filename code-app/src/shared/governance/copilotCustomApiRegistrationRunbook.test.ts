import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137F — Copilot Dataverse Custom API registration RUNBOOK governance.
 *
 * Phase 137F is docs + governance only — it defines the Dataverse-side
 * registration target and server contract WITHOUT creating anything. These
 * pins lock the runbook content and re-confirm that src/copilot still has
 * no live/network/secret/write drift and the default stays not_configured.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const RUNBOOK_DOC = 'docs/PHASE_137F_COPILOT_CUSTOM_API_REGISTRATION_RUNBOOK.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The runbook doc exists and records the registration + server contract
// ---------------------------------------------------------------------------

describe('Phase 137F — registration runbook doc exists', () => {
  it(`${RUNBOOK_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, RUNBOOK_DOC))).toBe(true);
  });
});

describe('Phase 137F — the runbook records the registration + server contract', () => {
  const doc = readDoc(RUNBOOK_DOC);

  it('names the cr664_RunLosCopilotAssist Custom API and the cr664 publisher prefix', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
    expect(doc).toMatch(/Publisher prefix/i);
    expect(doc).toMatch(/cr664/);
  });

  it('states no Custom API is created in this phase and runtime remains not_configured', () => {
    expect(doc).toMatch(/No Custom API is created in this phase/i);
    expect(doc).toMatch(/No plugin \/ Azure Function is deployed/i);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });

  it('requires server-side Azure OpenAI only and forbids browser-direct Azure OpenAI', () => {
    expect(doc).toMatch(/Call Azure OpenAI server-side only/i);
    expect(doc).toMatch(/never client-side/i);
    // The server-side boundary is explicit; the call never originates in the browser.
    expect(doc).toMatch(/Execution[\s\S]*?Server-side/i);
  });

  it('requires the audit/event ledger before live enablement', () => {
    expect(doc).toMatch(
      /audit \/ event ledger record must be written before live\s+enablement/i,
    );
    expect(doc).toMatch(/correlationId/);
    expect(doc).toMatch(/audit_unavailable/);
  });

  it('requires DLP / model-policy approval', () => {
    expect(doc).toMatch(/DLP \/ model-policy approval|DLP approval/i);
    expect(doc).toMatch(/model policy|model-policy|model \/ deployment policy/i);
  });

  it('requires no autonomous writes and proposal-only with requireConfirmation', () => {
    expect(doc).toMatch(/No autonomous\s+writes/i);
    expect(doc).toMatch(/Never execute writes directly/i);
    expect(doc).toMatch(/requireConfirmation: true/i);
  });

  it('includes the full fail-closed failure matrix', () => {
    for (const code of [
      'missing_config',
      'policy_blocked',
      'dlp_blocked',
      'model_unavailable',
      'context_too_large',
      'unsafe_output',
      'audit_unavailable',
      'connector_exception',
    ]) {
      expect(doc, `failure code ${code}`).toMatch(new RegExp(code));
    }
  });

  it('lists the future implementation phases (137G–137K)', () => {
    expect(doc).toMatch(/Future implementation phases/i);
    for (const p of ['137G', '137H', '137I', '137J', '137K']) {
      expect(doc, p).toMatch(new RegExp(p));
    }
  });

  it('declares the out-of-scope guardrails (no creation / no live traffic / no runtime change)', () => {
    expect(doc).toMatch(/No Custom API creation\./i);
    expect(doc).toMatch(/No live traffic\./i);
    expect(doc).toMatch(/No client runtime behavior change\./i);
  });

  it('marks any pac/deployment step as future/manual and NOT executed in this phase', () => {
    expect(doc).toMatch(/no write is performed in this phase/i);
    expect(doc).toMatch(/must NOT be executed/i);
    expect(doc).toMatch(/test tenant/i);
  });
});

// ---------------------------------------------------------------------------
// 2. src/copilot still has no live / network / secret / write drift
// ---------------------------------------------------------------------------

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

describe('Phase 137F — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotDataverseCustomApiTransport.ts');
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

  it('the default Copilot connector mode remains not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

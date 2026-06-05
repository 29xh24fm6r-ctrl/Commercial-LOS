import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137H — Copilot server-side plugin / Azure Function skeleton SPEC
 * governance.
 *
 * Phase 137H is docs + governance only. These pins lock the server-side
 * contract content, re-confirm src/copilot has no live/network/secret/write
 * drift, and prove no plugin / Azure Function project source was added.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SPEC_DOC = 'docs/PHASE_137H_COPILOT_SERVER_SIDE_SKELETON_SPEC.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The skeleton spec doc exists and records the server-side contract
// ---------------------------------------------------------------------------

describe('Phase 137H — server-side skeleton spec doc exists', () => {
  it(`${SPEC_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, SPEC_DOC))).toBe(true);
  });
});

describe('Phase 137H — the spec records the server-side handler contract', () => {
  const doc = readDoc(SPEC_DOC);

  it('declares itself server-side skeleton/spec only, runtime not_configured', () => {
    expect(doc).toMatch(/server-side skeleton ?\/ ?spec only/i);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
    expect(doc).toMatch(/no plugin project[\s\S]*?Azure Function/i);
  });

  it('names the cr664_RunLosCopilotAssist Custom API', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist/);
  });

  it('recommends a Dataverse plugin as primary and an Azure Function as acceptable alternative', () => {
    expect(doc).toMatch(/Recommended primary implementation/i);
    expect(doc).toMatch(/Dataverse plugin[\s\S]*?recommended/i);
    expect(doc).toMatch(/Acceptable handler forms/i);
    expect(doc).toMatch(/Azure Function/);
    expect(doc).toMatch(/Prefer the Dataverse plugin/i);
    expect(doc).toMatch(/Prefer the Azure Function/i);
  });

  it('defines an ordered server-side pipeline (14 stages)', () => {
    expect(doc).toMatch(/Server-side handler pipeline/i);
    expect(doc).toMatch(/Parse request JSON/i);
    expect(doc).toMatch(/Validate the request schema/i);
    expect(doc).toMatch(/Call Azure OpenAI server-side/i);
    expect(doc).toMatch(/Write the audit START event/i);
    expect(doc).toMatch(/Fail closed on any exception/i);
    // numbered stages exist (1 … 14).
    expect(doc).toMatch(/(^|\n)\s*1\.\s/);
    expect(doc).toMatch(/(^|\n)\s*14\.\s/);
  });

  it('requires request validation against the Phase 137B contract', () => {
    expect(doc).toMatch(/Request validation contract/i);
    expect(doc).toMatch(/banker \| manager \| portfolio \| team \| executive/);
    expect(doc).toMatch(/requireConfirmation === true/);
    expect(doc).toMatch(/context_too_large/);
    expect(doc).toMatch(/No raw borrower documents/i);
  });

  it('requires policy enforcement (no cross-deal lookup, no write execution)', () => {
    expect(doc).toMatch(/Policy enforcement contract/i);
    expect(doc).toMatch(/No cross-workspace ?\/ ?cross-deal lookup/i);
    expect(doc).toMatch(/No write execution/i);
    expect(doc).toMatch(/governedWritePath/);
    expect(doc).toMatch(/explain_only/);
  });

  it('requires server-side Azure OpenAI only (no client keys, managed identity)', () => {
    expect(doc).toMatch(/Azure OpenAI boundary/i);
    expect(doc).toMatch(/Server-side only/i);
    expect(doc).toMatch(/No client ?\/ ?browser API keys/i);
    expect(doc).toMatch(/[Mm]anaged identity/);
    expect(doc).toMatch(/Unsafe or unparseable output fails closed/i);
  });

  it('requires audit start + completion and audit_unavailable fail-closed', () => {
    expect(doc).toMatch(/Audit START before the model call/i);
    expect(doc).toMatch(/Audit COMPLETION after the response/i);
    expect(doc).toMatch(/fail closed[\s\S]*?audit_unavailable|audit_unavailable[\s\S]*?fail/i);
    expect(doc).toMatch(/correlationId/);
  });

  it('requires proposal-only with no write execution', () => {
    expect(doc).toMatch(/Actions are proposals only/i);
    expect(doc).toMatch(/never[\s\S]{0,40}create\/update\/delete|No write execution/i);
    expect(doc).toMatch(/requireConfirmation: true/);
  });

  it('includes the full fail-closed matrix (8 codes)', () => {
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
      expect(doc, `fail-closed code ${code}`).toMatch(new RegExp(code));
    }
  });

  it('includes language-neutral pseudocode with failClosed(code, reason) but no runnable plugin/function code', () => {
    expect(doc).toMatch(/Language-neutral pseudocode only/i);
    expect(doc).toMatch(/not runnable code/i);
    expect(doc).toMatch(/failClosed\(code, reason\)/);
    // No actual plugin / Azure Function runnable-code markers.
    expect(doc).not.toMatch(/\bIPlugin\b/);
    expect(doc).not.toMatch(/Microsoft\.Xrm\.Sdk/);
    expect(doc).not.toMatch(/module\.exports/);
    expect(doc).not.toMatch(/app\.http\(/);
  });

  it('declares the out-of-scope guardrails and the next phases', () => {
    expect(doc).toMatch(/No plugin code\./i);
    expect(doc).toMatch(/No Azure Function code\./i);
    expect(doc).toMatch(/No live traffic\./i);
    expect(doc).toMatch(/No client runtime change\./i);
    expect(doc).toMatch(/137I/);
    expect(doc).toMatch(/137L/);
  });
});

// ---------------------------------------------------------------------------
// 2. No plugin / Azure Function project source was added under src/
// ---------------------------------------------------------------------------

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

describe('Phase 137H — no server / plugin / Azure Function source was added under src/', () => {
  const files = walk(resolve(REPO_ROOT, 'src'));

  it('contains no .cs / .csproj / .fsproj plugin-project files', () => {
    const offenders = files.filter((f) => /\.(cs|csproj|fsproj|sln)$/i.test(f));
    expect(offenders).toEqual([]);
  });

  it('contains no Azure Function project files (function.json / host.json / local.settings.json)', () => {
    const offenders = files.filter((f) =>
      /(^|[\\/])(function\.json|host\.json|local\.settings\.json)$/i.test(f),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. src/copilot still has no live / network / secret / write drift
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

describe('Phase 137H — src/copilot has no live / network / secret / write drift', () => {
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

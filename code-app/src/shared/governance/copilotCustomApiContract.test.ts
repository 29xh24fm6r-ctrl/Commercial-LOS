import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137B — Copilot Custom API CONTRACT pins.
 *
 * Phase 137B is docs + tests only — it defines the FUTURE server-side
 * Dataverse Custom API contract without implementing it. These pins lock:
 *
 *   1. The contract doc exists and defines the Custom API boundary,
 *      request/response shapes, allowlisted action types, audit
 *      requirements, security gates, and fail-closed errors — and states
 *      the runtime stays not_configured with no implementation in 137B.
 *
 *   2. src/copilot has NOT drifted into an implementation — no
 *      browser-direct Azure OpenAI, no secrets, no send/write surfaces,
 *      and the default connector mode is still not_configured.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CONTRACT_DOC = 'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The contract doc exists and defines the future server-side contract
// ---------------------------------------------------------------------------

describe('Phase 137B — Custom API contract doc exists', () => {
  it(`${CONTRACT_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, CONTRACT_DOC))).toBe(true);
  });
});

describe('Phase 137B — the contract doc defines the future server-side contract', () => {
  const doc = readDoc(CONTRACT_DOC);

  it('declares itself contract/spec only with runtime staying not_configured', () => {
    expect(doc).toMatch(/Contract ?\/ ?spec only/i);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
    expect(doc).toMatch(
      /No connector code, Custom API, plugin, Azure Function, secrets,\s+schema, or live mode is created here/i,
    );
  });

  it('names the Custom API boundary (browser → Dataverse Custom API → server-side Azure OpenAI)', () => {
    expect(doc).toMatch(/cr664_RunLosCopilotAssist|cr664_RunCopilotAssist/);
    expect(doc).toMatch(/The browser calls the Dataverse Custom API only/i);
    expect(doc).toMatch(/calls Azure OpenAI server-side/i);
    expect(doc).toMatch(/browser never calls Azure OpenAI directly/i);
    expect(doc).toMatch(/Secrets stay server-side only/i);
  });

  it('defines the request contract (already-authorized, minimized, no cross-deal lookup)', () => {
    expect(doc).toMatch(/Request contract/i);
    expect(doc).toMatch(/"workspace": "banker\|manager\|portfolio\|team\|executive"/);
    expect(doc).toMatch(/"correlationId"/);
    expect(doc).toMatch(/already-authorized UI ?\/ ?view-model context only/i);
    expect(doc).toMatch(/must be minimized ?\/ ?redacted/i);
    expect(doc).toMatch(/No raw borrower documents/i);
    expect(doc).toMatch(/No cross-workspace or cross-deal lookup/i);
  });

  it('defines the response contract (proposals only, allowlisted, discloses mode, fail-closed)', () => {
    expect(doc).toMatch(/Response contract/i);
    expect(doc).toMatch(/"proposals"/);
    expect(doc).toMatch(/"requireConfirmation": true/);
    expect(doc).toMatch(/"governedWritePath"/);
    expect(doc).toMatch(/Proposals only — no autonomous execution/i);
    expect(doc).toMatch(/must disclose live ?\/ ?not-live mode/i);
    expect(doc).toMatch(/Fail-closed responses use `?disabled`? ?\/ ?`?not_configured`?/i);
  });

  it('requires proposals-only with confirmation and an allowlisted action set', () => {
    expect(doc).toMatch(/All proposals require confirmation/i);
    expect(doc).toMatch(/Action types must be allowlisted/i);
    for (const t of [
      'request_document',
      'draft_borrower_message',
      'create_task',
      'flag_for_review',
      'prepare_credit_memo',
      'explain_only',
    ]) {
      expect(doc, `action type ${t}`).toMatch(new RegExp(t));
    }
    // No write executes without a governed write path + confirmation.
    expect(doc).toMatch(
      /No write executes from a Copilot response[\s\S]*?governedWritePath[\s\S]*?confirmation/i,
    );
  });

  it('requires audit/event logging with the required fields', () => {
    expect(doc).toMatch(/Audit ?\/ ?event logging requirements/i);
    expect(doc).toMatch(/canonical ledger ?\/ ?event table/i);
    expect(doc).toMatch(/correlationId/);
    expect(doc).toMatch(/redacted prompt hash or summary/i);
    expect(doc).toMatch(/final governed write id/i);
    expect(doc).toMatch(/errors ?\/ ?fail-closed reason/i);
  });

  it('defines the security/policy gates (no client secrets, DLP, disable switch, no new scope)', () => {
    expect(doc).toMatch(/Security and policy gates/i);
    expect(doc).toMatch(/No new Dataverse scope/i);
    expect(doc).toMatch(/DLP approval required/i);
    expect(doc).toMatch(/No secrets in client/i);
    expect(doc).toMatch(/Disable switch required/i);
  });

  it('defines the fail-closed error contract', () => {
    expect(doc).toMatch(/Error ?\/ ?fail-closed contract/i);
    for (const e of [
      'missing_config',
      'policy_blocked',
      'dlp_blocked',
      'model_unavailable',
      'context_too_large',
      'unsafe_output',
      'audit_unavailable',
      'connector_exception',
    ]) {
      expect(doc, `error ${e}`).toMatch(new RegExp(e));
    }
    expect(doc).toMatch(/never fake output, never throw the UI into a crash/i);
  });

  it('forbids browser-direct Azure OpenAI and client secrets', () => {
    expect(doc).toMatch(/No browser-direct\s+Azure OpenAI/i);
    expect(doc).toMatch(/api\.openai\.com/i);
    expect(doc).toMatch(/openai\.azure\.com/i);
    expect(doc).toMatch(/from the\s+client/i);
    expect(doc).toMatch(/never exposed to the client bundle/i);
  });

  it('lists out-of-scope (no implementation/endpoint/schema/secrets/live traffic) and the 137C checklist', () => {
    expect(doc).toMatch(/Out of scope/i);
    expect(doc).toMatch(/No implementation\./i);
    expect(doc).toMatch(/No endpoint creation\./i);
    expect(doc).toMatch(/No schema ?\/ ?migration\./i);
    expect(doc).toMatch(/No secrets ?\/ ?config\./i);
    expect(doc).toMatch(/No live traffic\./i);
    expect(doc).toMatch(/Implementation checklist for Phase 137C/i);
    expect(doc).toMatch(/Keep the default \*?\*?`?not_configured`?/i);
  });
});

// ---------------------------------------------------------------------------
// 2. src/copilot has NOT drifted into an implementation (137B is docs+tests)
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

describe('Phase 137B — src/copilot has no Custom API / live-connector implementation drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotConnector.ts');
  });

  for (const rel of files) {
    it(`${rel} has no Azure OpenAI / secret / send / write drift`, () => {
      const c = code(rel);
      expect(c, `${rel}: api.openai.com`).not.toMatch(/api\.openai\.com/i);
      expect(c, `${rel}: openai.azure.com`).not.toMatch(/openai\.azure\.com/i);
      expect(c, `${rel}: fetch(`).not.toMatch(/\bfetch\(/);
      expect(c, `${rel}: secret key`).not.toMatch(
        /AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/,
      );
      expect(c, `${rel}: api key literal`).not.toMatch(/api[_-]?key\s*[:=]/i);
      expect(c, `${rel}: SendEmail`).not.toMatch(/SendEmail/i);
      expect(c, `${rel}: Office365`).not.toMatch(/Office365/i);
      expect(c, `${rel}: Graph`).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(c, `${rel}: Teams`).not.toMatch(/MicrosoftTeams|teams\.microsoft/i);
      expect(c, `${rel}: generated import`).not.toMatch(
        /from ['"][^'"]*\/generated\//,
      );
      expect(c, `${rel}: write call`).not.toMatch(
        /\.(create|update|patch|delete)\s*\(/,
      );
    });
  }

  it('the default connector mode is still not_configured (no default live mode)', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

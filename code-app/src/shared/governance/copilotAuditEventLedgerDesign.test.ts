import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137I — Copilot audit / event ledger DESIGN governance.
 *
 * Phase 137I is docs + governance only. These pins lock the audit-ledger
 * design content (the audit-before-model rule, the proposed table/fields,
 * the lifecycle, the privacy rules), re-confirm src/copilot has no
 * live/network/secret/write drift, and prove no table/migration/plugin
 * source was added.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DESIGN_DOC = 'docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The design doc exists and records the audit-ledger contract
// ---------------------------------------------------------------------------

describe('Phase 137I — audit/event ledger design doc exists', () => {
  it(`${DESIGN_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, DESIGN_DOC))).toBe(true);
  });
});

describe('Phase 137I — the design records the audit-ledger contract', () => {
  const doc = readDoc(DESIGN_DOC);

  it('declares itself design-only, no table creation, runtime not_configured', () => {
    expect(doc).toMatch(/audit ?\/ ?event ledger design only/i);
    expect(doc).toMatch(/No Dataverse table creation\./i);
    expect(doc).toMatch(/No table is created in Phase 137I/i);
    expect(doc).toMatch(/Runtime remains `?not_configured`?/i);
  });

  it('requires audit_start before any Azure OpenAI / model call', () => {
    expect(doc).toMatch(/Audit-before-model rule/i);
    expect(doc).toMatch(
      /write an `?audit_start`? event before any Azure\s+OpenAI ?\/ ?model call/i,
    );
    expect(doc).toMatch(/No model call may occur before `?audit_start`? succeeds/i);
  });

  it('requires audit_unavailable fail-closed when audit_start cannot be written', () => {
    expect(doc).toMatch(
      /cannot be written[\s\S]{0,120}audit_unavailable|audit_unavailable[\s\S]{0,120}no model call/i,
    );
    expect(doc).toMatch(/failClosedCode: audit_unavailable/);
  });

  it('decides the ledger/table ownership (existing cr664_AuditEvent vs dedicated cr664_copilotauditevent)', () => {
    expect(doc).toMatch(/Ledger ?\/ ?table ownership decision/i);
    expect(doc).toMatch(/cr664_AuditEvent/);
    expect(doc).toMatch(/cr664_copilotauditevent/);
    expect(doc).toMatch(/dedicated/i);
  });

  it('defines the required audit fields (correlation, event type, user, workspace, surface, hashes, mode, model, proposals, fail-closed, governed write)', () => {
    for (const field of [
      'cr664_correlationid',
      'cr664_eventtype',
      'cr664_userupn',
      'cr664_userprofileid',
      'cr664_workspacename',
      'cr664_workspace',
      'cr664_surface',
      'cr664_dealid',
      'cr664_promptkind',
      'cr664_redactedpromptsummary',
      'cr664_prompthash',
      'cr664_contextsummary',
      'cr664_contexthash',
      'cr664_mode',
      'cr664_policyversion',
      'cr664_modeldeployment',
      'cr664_modelversion',
      'cr664_proposalsjson',
      'cr664_proposalcount',
      'cr664_failclosedcode',
      'cr664_confirmationstatus',
      'cr664_governedwritepath',
      'cr664_governedwriteid',
      'cr664_payloadversion',
    ]) {
      expect(doc, `field ${field}`).toMatch(new RegExp(field));
    }
  });

  it('separates required-at-start vs required-at-completion vs after-confirmation fields', () => {
    expect(doc).toMatch(/Required at `?audit_start`?/i);
    expect(doc).toMatch(/Required at `?audit_completion`?/i);
    expect(doc).toMatch(/Populated only after confirmation ?\/ ?write completion/i);
  });

  it('forbids raw borrower documents, secrets, tokens, API keys in any field', () => {
    expect(doc).toMatch(/Must NEVER contain raw borrower documents or secrets/i);
    expect(doc).toMatch(/No raw borrower document content/i);
    expect(doc).toMatch(/no\s+secrets,\s+no tokens,\s+no API keys/i);
  });

  it('defines the lifecycle events (audit_start, audit_completion, audit_fail_closed, proposal_confirmed, governed_write_completed)', () => {
    expect(doc).toMatch(/Event lifecycle/i);
    for (const ev of [
      'audit_start',
      'audit_completion',
      'audit_fail_closed',
      'proposal_confirmed',
      'governed_write_completed',
    ]) {
      expect(doc, `event ${ev}`).toMatch(new RegExp(ev));
    }
  });

  it('defines indexes and explicitly forbids uniqueness on the correlation id', () => {
    expect(doc).toMatch(/Required indexes ?\/ ?uniqueness/i);
    expect(doc).toMatch(/Index on `?cr664_correlationid`?/i);
    expect(doc).toMatch(/No uniqueness on `?cr664_correlationid`?/i);
  });

  it('defines proposal linkage to governed writes (no direct write from model output)', () => {
    expect(doc).toMatch(/Proposal linkage/i);
    expect(doc).toMatch(/governedWritePath/);
    expect(doc).toMatch(/requireConfirmation: true/);
    expect(doc).toMatch(/No write executes from model output directly/i);
  });

  it('includes the fail-closed codes and the out-of-scope + future phases', () => {
    for (const code of [
      'audit_unavailable',
      'connector_exception',
      'policy_blocked',
      'dlp_blocked',
      'unsafe_output',
    ]) {
      expect(doc, `code ${code}`).toMatch(new RegExp(code));
    }
    expect(doc).toMatch(/No migration\./i);
    expect(doc).toMatch(/No live enablement\./i);
    expect(doc).toMatch(/137J/);
    expect(doc).toMatch(/137N/);
  });
});

// ---------------------------------------------------------------------------
// 2. No table / migration / plugin / Azure Function source was added
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
    if (s.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('Phase 137I — no table / migration / plugin / Azure Function source was added under src/', () => {
  const files = walk(resolve(REPO_ROOT, 'src'));

  it('contains no .cs / .csproj / .fsproj / .sln plugin-project files', () => {
    expect(files.filter((f) => /\.(cs|csproj|fsproj|sln)$/i.test(f))).toEqual([]);
  });

  it('contains no Azure Function or migration/schema project files', () => {
    const offenders = files.filter((f) =>
      /(^|[\\/])(function\.json|host\.json|local\.settings\.json)$/i.test(f) ||
      /\.(sql)$/i.test(f) ||
      /migration/i.test(f),
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

describe('Phase 137I — src/copilot has no live / network / secret / write drift', () => {
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

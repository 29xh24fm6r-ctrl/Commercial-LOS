import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  COPILOT_AUDIT_TABLE_LOGICAL_NAME,
  buildCopilotAuditStartEvent,
  createDisabledCopilotAuditLogger,
} from '../../copilot/copilotAuditLogger';
import { getCopilotConnector } from '../../copilot/copilotConnector';
import type { CopilotCustomApiRequest } from '../../copilot/copilotCustomApiContract';

/**
 * Phase 137K — Copilot audit-logger SKELETON governance.
 *
 * Phase 137K adds an inert app-side audit-logger interface + disabled
 * no-op logger. These pins lock that it stays a skeleton: no live write,
 * default not_configured, no server/plugin source, no src/copilot drift,
 * and the 137I/137J docs are still honored.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function request(): CopilotCustomApiRequest {
  return {
    workspace: 'executive',
    surface: 'workspace',
    mode: 'proposal_only',
    user: { upn: 'x@y.com' },
    context: {},
    prompt: { kind: 'summarize' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-gov',
  };
}

describe('Phase 137K — the audit-logger skeleton exists and targets cr664_copilotauditevent', () => {
  it('the logger module exists on disk', () => {
    expect(existsSync(resolve(REPO_ROOT, 'src/copilot/copilotAuditLogger.ts'))).toBe(true);
  });

  it('the audit table is cr664_copilotauditevent', () => {
    expect(COPILOT_AUDIT_TABLE_LOGICAL_NAME).toBe('cr664_copilotauditevent');
  });
});

describe('Phase 137K — no live Dataverse write exists; the disabled logger fails closed', () => {
  it('the disabled logger returns audit_unavailable and never an event id', async () => {
    const res = await createDisabledCopilotAuditLogger('disabled by default').writeEvent(
      buildCopilotAuditStartEvent(request(), { redactedPromptSummary: 'x', contextSummary: 'y' }),
    );
    expect(res.ok).toBe(false);
    expect(res.failClosedCode).toBe('audit_unavailable');
    expect(res.eventId).toBeUndefined();
  });

  it('the logger source performs no IO and builds no Dataverse client / network call', () => {
    const code = readFileSync(resolve(REPO_ROOT, 'src/copilot/copilotAuditLogger.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/import\.meta\.env/);
    expect(code).not.toMatch(/new\s+[A-Za-z]*Client\b/);
    expect(code).not.toMatch(/\.(create|update|patch|delete)\s*\(/);
  });
});

describe('Phase 137K — default runtime stays not_configured', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

// ---------------------------------------------------------------------------
// No server / plugin / Azure Function source was added under src/
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

describe('Phase 137K — no server / plugin / Azure Function / migration source under src/', () => {
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

// ---------------------------------------------------------------------------
// src/copilot still has no live / network / secret / write drift
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

describe('Phase 137K — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotAuditLogger.ts');
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

describe('Phase 137K — the prior 137I / 137J docs are still honored', () => {
  for (const rel of [
    'docs/PHASE_137I_COPILOT_AUDIT_EVENT_LEDGER_DESIGN.md',
    'docs/PHASE_137J_COPILOT_AUDIT_TABLE_METADATA_SCRIPT.md',
  ]) {
    it(`${rel} still exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

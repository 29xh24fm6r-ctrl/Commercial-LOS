import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import {
  createDisabledCopilotLiveHarness,
  evaluateCopilotLiveReadiness,
} from '../../copilot/copilotLiveTransportHarness';
import { runCopilotServerHandler } from '../../copilot/copilotServerHandler';
import { getCopilotConnector } from '../../copilot/copilotConnector';
import type { CopilotCustomApiRequest } from '../../copilot/copilotCustomApiContract';

/**
 * Phase 137L — Copilot server-handler readiness BUNDLE governance.
 *
 * Pins that Phase 137L stays a disabled readiness bundle: the server
 * handler fails closed before the model boundary, the live harness is never
 * ready, the default runtime stays not_configured, no server/plugin source
 * was added, src/copilot has no drift, and the 137L doc states no live
 * enablement.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const BUNDLE_FILES = [
  'src/copilot/copilotServerHandler.ts',
  'src/copilot/copilotLiveTransportHarness.ts',
] as const;

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

describe('Phase 137L — the readiness bundle skeleton exists', () => {
  for (const rel of BUNDLE_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

describe('Phase 137L — disabled server handler fails closed (audit-before-model)', () => {
  it('fails closed with audit_unavailable and never invokes the model', async () => {
    const res = await runCopilotServerHandler(request());
    expect(res.response.failClosedCode).toBe('audit_unavailable');
    expect(res.response.isLive).toBe(false);
    expect(res.response.proposals).toEqual([]);
    expect(res.response.answer).toBeUndefined();
    expect(res.modelInvoked).toBe(false);
  });
});

describe('Phase 137L — live harness is never ready', () => {
  it('evaluateCopilotLiveReadiness reports ready:false with blockers', () => {
    const r = evaluateCopilotLiveReadiness();
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThanOrEqual(5);
  });

  it('the composed disabled harness resolves not_configured and is not ready', () => {
    const h = createDisabledCopilotLiveHarness();
    expect(h.config.mode).toBe('not_configured');
    expect(h.readiness.ready).toBe(false);
  });
});

describe('Phase 137L — default runtime stays not_configured', () => {
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

describe('Phase 137L — no server / plugin / Azure Function / migration source under src/', () => {
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

describe('Phase 137L — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotServerHandler.ts');
    expect(files).toContain('src/copilot/copilotLiveTransportHarness.ts');
  });

  for (const rel of files) {
    it(`${rel} has no fetch / Azure OpenAI / secret / send / write reference`, () => {
      const c = code(rel);
      expect(c, `${rel}: fetch(`).not.toMatch(/\bfetch\(/);
      expect(c, `${rel}: XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(c, `${rel}: api.openai.com`).not.toMatch(/api\.openai\.com/i);
      expect(c, `${rel}: openai.azure.com`).not.toMatch(/openai\.azure\.com/i);
      expect(c, `${rel}: import.meta.env`).not.toMatch(/import\.meta\.env/);
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

describe('Phase 137L — the doc states no live enablement', () => {
  const doc = readFileSync(
    resolve(REPO_ROOT, 'docs/PHASE_137L_COPILOT_SERVER_HANDLER_READINESS_BUNDLE.md'),
    'utf8',
  );
  it('explicitly states no live enablement in 137L', () => {
    expect(doc).toMatch(/No live enablement in (Phase )?137L/i);
  });
});

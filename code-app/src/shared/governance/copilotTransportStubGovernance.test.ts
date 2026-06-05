import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COPILOT_CUSTOM_API_NAME,
  createCopilotDataverseCustomApiTransport,
} from '../../copilot/copilotDataverseCustomApiTransport';
import { runCopilotCustomApi, buildCopilotCustomApiRequest } from '../../copilot/copilotCustomApiAdapter';
import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137E — Copilot Custom API transport STUB governance.
 *
 * Pins that Phase 137E adds only a fail-closed stub/factory — never a
 * concrete live transport, no default wiring, no network/secret/write
 * drift — and that the prior 137A–137D docs are still honored.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const NEW_FILES = [
  'src/copilot/copilotDataverseCustomApiTransport.ts',
  'src/copilot/copilotTransportReadiness.ts',
] as const;

function code(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function request() {
  return buildCopilotCustomApiRequest({
    workspace: 'executive',
    surface: 'workspace',
    mode: 'proposal_only',
    user: { upn: 'x@y.com' },
    context: {},
    prompt: { kind: 'summarize' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-gov',
  });
}

describe('Phase 137E — the stub exists and the Custom API name is pinned', () => {
  for (const rel of NEW_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  it('the Custom API name is exactly cr664_RunLosCopilotAssist', () => {
    expect(COPILOT_CUSTOM_API_NAME).toBe('cr664_RunLosCopilotAssist');
  });
});

describe('Phase 137E — the transport is a fail-closed stub, not a live implementation', () => {
  it('the stub invoke resolves to disabled/missing_config (no fake answer, no proposals)', async () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    const res = await t.invoke(request());
    expect(res.mode).toBe('disabled');
    expect(res.failClosedCode).toBe('missing_config');
    expect(res.isLive).toBe(false);
    expect(res.proposals).toEqual([]);
    expect(res.answer).toBeUndefined();
  });

  it('the stub source marks itself transport_not_implemented and builds no client/transport', () => {
    const src = code('src/copilot/copilotDataverseCustomApiTransport.ts');
    expect(src).toMatch(/transport_not_implemented/);
    expect(src).not.toMatch(/new\s+[A-Za-z]*Client\b/);
    expect(src).not.toMatch(/import\.meta\.env/);
  });
});

describe('Phase 137E — no concrete transport is wired into runtime', () => {
  it('the default app connector still reports not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });

  it('runCopilotCustomApi without an injected transport stays not_configured', async () => {
    const res = await runCopilotCustomApi(request());
    expect(res.mode).toBe('not_configured');
  });
});

describe('Phase 137E — no network / secret / write drift in the new files', () => {
  for (const rel of NEW_FILES) {
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

describe('Phase 137E — the prior decision / contract / skeleton / seam docs are still honored', () => {
  for (const rel of [
    'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md',
    'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md',
    'docs/PHASE_137C_COPILOT_CONNECTOR_SKELETON.md',
    'docs/PHASE_137D_COPILOT_TRANSPORT_SEAM.md',
  ]) {
    it(`${rel} still exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildCopilotCustomApiRequest,
  runCopilotCustomApi,
} from '../../copilot/copilotCustomApiAdapter';
import {
  ALLOWED_COPILOT_ACTION_TYPES,
  normalizeCopilotMode,
} from '../../copilot/copilotCustomApiContract';
import { resolveCopilotConnectorConfig } from '../../copilot/copilotConnectorConfig';
import { getCopilotConnector } from '../../copilot/copilotConnector';

/**
 * Phase 137C — Copilot connector adapter SKELETON governance.
 *
 * Phase 137C adds the inert request/response contract types + a
 * disabled-by-default adapter boundary. These pins lock that it stays a
 * skeleton: no live transport, default not_configured, no network/secret
 * drift, and the Phase 137A/137B docs are still honored.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const SKELETON_FILES = [
  'src/copilot/copilotCustomApiContract.ts',
  'src/copilot/copilotCustomApiAdapter.ts',
  // Phase 137D — pure config resolver.
  'src/copilot/copilotConnectorConfig.ts',
] as const;

function code(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------------
// Skeleton exists, but is inert
// ---------------------------------------------------------------------------

describe('Phase 137C — the adapter skeleton exists', () => {
  for (const rel of SKELETON_FILES) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }

  it('exposes the allowlisted action types and a mode normalizer', () => {
    expect(ALLOWED_COPILOT_ACTION_TYPES.length).toBeGreaterThan(0);
    expect(ALLOWED_COPILOT_ACTION_TYPES).toContain('explain_only');
    expect(normalizeCopilotMode('anything-unknown')).toBe('not_configured');
  });
});

describe('Phase 137C — no live transport is implemented', () => {
  it('runCopilotCustomApi without a transport resolves to not_configured (no network)', async () => {
    const req = buildCopilotCustomApiRequest({
      workspace: 'executive',
      surface: 'workspace',
      mode: 'live_read_only',
      user: { upn: 'x@y.com' },
      context: {},
      prompt: { kind: 'summarize' },
      policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
      correlationId: 'corr-137c',
    });
    const res = await runCopilotCustomApi(req);
    expect(res.mode).toBe('not_configured');
    expect(res.isLive).toBe(false);
    expect(res.failClosedCode).toBe('missing_config');
    expect(res.proposals).toEqual([]);
    expect(res.answer).toBeUndefined();
  });

  it('the adapter source defines a transport INTERFACE but ships no default/concrete transport', () => {
    const src = code('src/copilot/copilotCustomApiAdapter.ts');
    // The boundary is declared…
    expect(src).toMatch(/interface CopilotCustomApiTransport/);
    // …but nothing constructs or assigns a default transport client.
    expect(src).not.toMatch(/new\s+[A-Za-z]*Transport\b/);
    expect(src).not.toMatch(/new\s+[A-Za-z]*Client\b/);
    expect(src).not.toMatch(/DataverseClient|WebApi|dataverse/i);
  });
});

describe('Phase 137C — the default Copilot connector mode remains not_configured', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

// ---------------------------------------------------------------------------
// Phase 137D — config resolver is pure and defaults disabled/not_configured
// ---------------------------------------------------------------------------

describe('Phase 137D — config resolver adds the seam without enabling anything', () => {
  it('the empty / default config resolves to not_configured', () => {
    expect(resolveCopilotConnectorConfig().mode).toBe('not_configured');
    expect(resolveCopilotConnectorConfig({}).mode).toBe('not_configured');
  });

  it('any secret-looking config fails closed to disabled (no secret reaches a live mode)', () => {
    const keyName = ['AZURE', 'OPENAI', 'API', 'KEY'].join('_');
    expect(
      resolveCopilotConnectorConfig({
        VITE_COPILOT_MODE: 'proposal_only',
        [keyName]: 'x',
      }).mode,
    ).toBe('disabled');
  });

  it('the config resolver source reads no secret env and builds no client/transport', () => {
    const src = code('src/copilot/copilotConnectorConfig.ts');
    expect(src).not.toMatch(/import\.meta\.env/);
    expect(src).not.toMatch(/new\s+[A-Za-z]*Client\b/);
    expect(src).not.toMatch(/new\s+[A-Za-z]*Transport\b/);
  });
});

// ---------------------------------------------------------------------------
// No network / secret / write drift in the skeleton files
// ---------------------------------------------------------------------------

describe('Phase 137C — skeleton files carry no network / secret / write drift', () => {
  for (const rel of SKELETON_FILES) {
    it(`${rel} has no fetch / Azure OpenAI / secret / send / write reference`, () => {
      const c = code(rel);
      expect(c, `${rel}: fetch(`).not.toMatch(/\bfetch\(/);
      expect(c, `${rel}: XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(c, `${rel}: api.openai.com`).not.toMatch(/api\.openai\.com/i);
      expect(c, `${rel}: openai.azure.com`).not.toMatch(/openai\.azure\.com/i);
      expect(c, `${rel}: secret env`).not.toMatch(
        /AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/,
      );
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
// Phase 137A / 137B docs still honored
// ---------------------------------------------------------------------------

describe('Phase 137C — the prior decision + contract docs are still present', () => {
  for (const rel of [
    'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md',
    'docs/PHASE_137B_COPILOT_CUSTOM_API_CONTRACT.md',
  ]) {
    it(`${rel} still exists`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

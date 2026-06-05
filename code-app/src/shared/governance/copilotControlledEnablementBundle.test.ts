import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';
import { resolveCopilotConnectorConfig } from '../../copilot/copilotConnectorConfig';
import {
  buildCopilotCustomApiRequest,
  runCopilotCustomApi,
} from '../../copilot/copilotCustomApiAdapter';
import { createDisabledCopilotLiveHarness } from '../../copilot/copilotLiveTransportHarness';
import { evaluateCopilotServerDeploymentReadiness } from '../../copilot/copilotServerDeploymentReadiness';
import type { CopilotConnectorConfig } from '../../copilot/copilotConnectorConfig';

/**
 * Phase 138C — Copilot controlled live-enablement bundle governance.
 *
 * Pins that 138C consolidates the guarded enablement work without enabling
 * anything: docs exist, the Custom API commit path is future-only, the live
 * transport is disabled by default, the test-tenant runbook lists its
 * prerequisites, the certification says production is blocked, and
 * src/copilot has no drift / no server-project source.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

const DOCS = {
  deployment: 'docs/PHASE_138C_COPILOT_SERVER_HANDLER_DEPLOYMENT_PLAN.md',
  runbook: 'docs/PHASE_138C_COPILOT_CONTROLLED_TEST_TENANT_ENABLEMENT.md',
  cert: 'docs/PHASE_138C_COPILOT_LIVE_READINESS_CERTIFICATION.md',
};

const LIVE_CONFIG: CopilotConnectorConfig = {
  mode: 'proposal_only',
  customApiName: 'cr664_RunLosCopilotAssist',
  endpointAlias: 'dataverse-custom-api',
  policyVersion: 'v1',
};

function request() {
  return buildCopilotCustomApiRequest({
    workspace: 'executive',
    surface: 'workspace',
    mode: 'proposal_only',
    user: { upn: 'x@y.com' },
    context: {},
    prompt: { kind: 'summarize' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-138c',
  });
}

// ---------------------------------------------------------------------------
// 1. The 138C docs exist
// ---------------------------------------------------------------------------

describe('Phase 138C — the controlled-enablement docs exist', () => {
  for (const rel of Object.values(DOCS)) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Custom API commit mode is future-only (explicitly rejected)
// ---------------------------------------------------------------------------

describe('Phase 138C — Custom API commit mode is explicitly future-only / not implemented', () => {
  const script = readFileSync(resolve(REPO_ROOT, 'scripts/phase122-lookup-repair.mjs'), 'utf8');

  it('the script commit notice is NOT IMPLEMENTED / future-only and writes nothing', () => {
    expect(script).toMatch(/--commit-seed-copilot-custom-api-metadata is NOT IMPLEMENTED in Phase/);
    expect(script).toMatch(/use dry-run plan only/);
    expect(script).toMatch(/INSPECT first; bail on ambiguous \/ duplicate existing Custom API/);
    expect(script).toMatch(/idempotent: if cr664_RunLosCopilotAssist exists/);
    expect(script).toMatch(/verify by re-reading the Custom API metadata/);
  });

  it('the future commit creates ONLY Custom API metadata — no plugin/Azure/secret/runtime', () => {
    expect(script).toMatch(
      /create ONLY the Custom API \+ request\/response metadata[\s\S]{0,160}no plugin, no Azure Function, no Azure OpenAI, no secret/i,
    );
    expect(script).toMatch(/no metadata publish step/);
  });
});

// ---------------------------------------------------------------------------
// 3. Default runtime not_configured; live transport disabled by default
// ---------------------------------------------------------------------------

describe('Phase 138C — default runtime not_configured + live transport disabled', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });

  it('the disabled live harness resolves not_configured and is not ready', () => {
    const h = createDisabledCopilotLiveHarness();
    expect(h.config.mode).toBe('not_configured');
    expect(h.readiness.ready).toBe(false);
  });

  it('an empty config resolves not_configured (no transport by default)', () => {
    expect(resolveCopilotConnectorConfig({}).mode).toBe('not_configured');
  });

  it('a live config WITHOUT an injected transport fails closed (disabled / missing_config)', async () => {
    const res = await runCopilotCustomApi(request(), { config: LIVE_CONFIG });
    expect(res.mode).toBe('disabled');
    expect(res.failClosedCode).toBe('missing_config');
    expect(res.isLive).toBe(false);
    expect(res.proposals).toEqual([]);
  });

  it('server deployment readiness is never ready until external gates are marked', () => {
    expect(evaluateCopilotServerDeploymentReadiness().ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. The runbook + certification doc content
// ---------------------------------------------------------------------------

describe('Phase 138C — the test-tenant runbook requires every prerequisite before live_read_only', () => {
  const doc = readDoc(DOCS.runbook);

  it('lists audit table / Custom API / server handler / DLP / secret store / disable switch prerequisites', () => {
    expect(doc).toMatch(/Audit table exists and verified/i);
    expect(doc).toMatch(/Custom API exists and verified/i);
    expect(doc).toMatch(/Server handler deployed/i);
    expect(doc).toMatch(/DLP ?\/ ?model policy approved/i);
    expect(doc).toMatch(/Managed identity ?\/ ?server-side secret store configured/i);
    expect(doc).toMatch(/Disable switch configured/i);
    expect(doc).toMatch(/Test tenant only/i);
  });

  it('prohibits proposal_only / write-capable proposals until live_read_only is approved', () => {
    expect(doc).toMatch(/Do NOT enable `?proposal_only`?/i);
    expect(doc).toMatch(/until[\s\S]{0,30}live_read_only[\s\S]{0,80}approved/i);
  });
});

describe('Phase 138C — the live-readiness certification says production is blocked', () => {
  const doc = readDoc(DOCS.cert);

  it('states repo-side complete, live disabled, production blocked, human approval per gate', () => {
    expect(doc).toMatch(/Repo-side Copilot work is complete/i);
    expect(doc).toMatch(/Live Copilot remains disabled/i);
    expect(doc).toMatch(/Production[\s\S]{0,20}[Bb]locked/);
    expect(doc).toMatch(/Human approval is required before each gate/i);
  });

  it('the final status table marks production blocked and live transport disabled', () => {
    expect(doc).toMatch(/Production[\s\S]{0,30}\*\*Blocked\*\*/i);
    expect(doc).toMatch(/Live transport[\s\S]{0,40}Disabled by default/i);
  });

  it('reaffirms no autonomous actions / no fake responses / UI unchanged', () => {
    expect(doc).toMatch(/no autonomous actions/i);
    expect(doc).toMatch(/no fake responses/i);
    expect(doc).toMatch(/UI unchanged/i);
  });
});

// ---------------------------------------------------------------------------
// 5. No server-project source added; src/copilot has no drift
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

describe('Phase 138C — no plugin / Azure Function / migration / schema source under src/', () => {
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

describe('Phase 138C — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotServerDeploymentReadiness.ts');
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

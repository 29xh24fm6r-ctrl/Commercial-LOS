import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveCopilotConnectorStatus,
  getCopilotConnector,
} from '../../copilot/copilotConnector';

/**
 * Phase 137A — Copilot live connector implementation DECISION pins.
 *
 * Phase 137A is a decision/spec/governance phase, NOT a live-connector
 * implementation. These pins lock two things:
 *
 *   1. The decision doc exists and records the governed decision —
 *      Dataverse Custom API + server-side Azure OpenAI as the recommended
 *      primary path; browser-direct, fake responses, and autonomous writes
 *      rejected; proposal-only + human confirmation, no client-side
 *      secrets, and fail-closed behavior required; runtime stays
 *      not-configured after this phase.
 *
 *   2. src/copilot has NOT drifted into an implementation — no direct
 *      Azure OpenAI call, no secrets, no send/write surfaces, and the
 *      default connector mode is still not_configured (fail closed).
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DECISION_DOC = 'docs/PHASE_137A_COPILOT_LIVE_CONNECTOR_DECISION.md';

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The decision doc exists and records the governed decision
// ---------------------------------------------------------------------------

describe('Phase 137A — decision doc exists', () => {
  it(`${DECISION_DOC} exists on disk`, () => {
    expect(existsSync(resolve(REPO_ROOT, DECISION_DOC))).toBe(true);
  });
});

describe('Phase 137A — decision doc records the governed architecture decision', () => {
  const doc = readDoc(DECISION_DOC);

  it('selects Dataverse Custom API + server-side Azure OpenAI as the recommended primary path', () => {
    expect(doc).toMatch(/Primary recommended path/i);
    expect(doc).toMatch(/Dataverse Custom API/i);
    expect(doc).toMatch(/server-side plugin or Azure Function/i);
    expect(doc).toMatch(/Azure OpenAI server-side/i);
    expect(doc).toMatch(/RECOMMENDED/);
  });

  it('rejects browser/client-direct Azure OpenAI', () => {
    expect(doc).toMatch(
      /Browser ?\/ ?client-direct Azure OpenAI[\s\S]*?REJECTED/i,
    );
  });

  it('rejects fake local Copilot responses', () => {
    expect(doc).toMatch(/Fake local Copilot responses[\s\S]*?REJECTED/i);
    expect(doc).toMatch(/violates the honesty contract/i);
  });

  it('rejects an autonomous write agent', () => {
    expect(doc).toMatch(/Autonomous write agent[\s\S]*?REJECTED/i);
  });

  it('requires proposal-only + human confirmation', () => {
    expect(doc).toMatch(/proposal-only with human\s+confirmation/i);
    expect(doc).toMatch(/require_confirmation=true/i);
  });

  it('requires no client-side secrets', () => {
    expect(doc).toMatch(/No secrets in the browser bundle/i);
    expect(doc).toMatch(/no client-side secrets/i);
  });

  it('requires fail-closed behavior', () => {
    expect(doc).toMatch(
      /Fail closed[\s\S]*?missing config, missing policy, or connector errors/i,
    );
  });

  it('states the runtime remains not-configured after Phase 137A', () => {
    expect(doc).toMatch(/Decision documented only\. Runtime remains\s+not-configured/i);
    expect(doc).toMatch(/Runtime default remains disabled ?\/ ?`?not_configured`?/i);
  });

  it('lists the required prerequisites and the out-of-scope guardrails', () => {
    expect(doc).toMatch(/Required prerequisites before implementation/i);
    expect(doc).toMatch(/rollback ?\/ ?disable flag/i);
    expect(doc).toMatch(/Out of scope/i);
    expect(doc).toMatch(/No connector code\./i);
    expect(doc).toMatch(/No enabling live mode\./i);
  });

  it('does not merge or implement the prep branch in this phase', () => {
    expect(doc).toMatch(/Not merged or implemented in Phase 137A/i);
  });
});

// ---------------------------------------------------------------------------
// 2. src/copilot has NOT drifted into a live implementation
// ---------------------------------------------------------------------------

const COPILOT_DIR = resolve(REPO_ROOT, 'src', 'copilot');

/** Non-test copilot source files (scanning tests would match their own
 *  negative assertions). */
function copilotSourceFiles(): string[] {
  return readdirSync(COPILOT_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))
    .map((f) => `src/copilot/${f}`);
}

function code(rel: string): string {
  // Strip comments — the connector/spec comments legitimately name the
  // forbidden patterns (Azure OpenAI, secrets, fetch) as non-goals.
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('Phase 137A — src/copilot has no live-connector implementation drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotConnector.ts');
  });

  for (const rel of files) {
    it(`${rel} has no live Azure OpenAI / secret / send / write drift`, () => {
      const c = code(rel);
      // No browser-direct Azure OpenAI / OpenAI endpoint calls.
      expect(c, `${rel}: fetch(`).not.toMatch(/\bfetch\(/);
      expect(c, `${rel}: XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(c, `${rel}: api.openai.com`).not.toMatch(/api\.openai\.com/i);
      expect(c, `${rel}: openai.azure.com`).not.toMatch(/openai\.azure\.com/i);
      // No client-side secret material.
      expect(c, `${rel}: AZURE_OPENAI_API_KEY`).not.toMatch(/AZURE_OPENAI_API_KEY/);
      expect(c, `${rel}: AZURE_OPENAI_ENDPOINT`).not.toMatch(/AZURE_OPENAI_ENDPOINT/);
      expect(c, `${rel}: api key literal`).not.toMatch(/api[_-]?key\s*[:=]/i);
      // No send / messaging surfaces.
      expect(c, `${rel}: SendEmail`).not.toMatch(/SendEmail/i);
      expect(c, `${rel}: Office365`).not.toMatch(/Office365/i);
      expect(c, `${rel}: Graph`).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(c, `${rel}: Teams`).not.toMatch(/MicrosoftTeams|teams\.microsoft/i);
      // No Dataverse generated write-service import.
      expect(c, `${rel}: generated import`).not.toMatch(
        /from ['"][^'"]*\/generated\//,
      );
      // No record write execution.
      expect(c, `${rel}: write call`).not.toMatch(
        /\.(create|update|patch|delete)\s*\(/,
      );
    });
  }
});

describe('Phase 137A — the connector default stays not-configured (fail closed)', () => {
  it('the env-resolved default singleton connector is not_configured', () => {
    // No VITE_COPILOT_MODE set in the test env → not_configured.
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });

  it('missing env resolves to not_configured', () => {
    expect(resolveCopilotConnectorStatus({}).mode).toBe('not_configured');
  });

  it('a live mode against azure_openai with NO server transport fails closed to disabled', () => {
    const status = resolveCopilotConnectorStatus({
      mode: 'live_read_only',
      provider: 'azure_openai',
    });
    expect(status.mode).toBe('disabled');
    expect(status.connected).toBe(false);
  });

  it('the default connector exposes no live network call (status only, no proposals)', () => {
    const r = getCopilotConnector().assistWorkspace({
      workspace: {
        workspaceRole: 'executive',
        userName: undefined,
        teamName: undefined,
        dealCount: 0,
        urgentItemCount: 0,
        kpiSummaries: [],
      },
      topBlockers: [],
    });
    expect(r.isLive).toBe(false);
    expect(r.proposed_actions).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { getCopilotConnector } from '../../copilot/copilotConnector';
import { evaluateCopilotServerDeploymentReadiness } from '../../copilot/copilotServerDeploymentReadiness';

/**
 * Phase 139A — Copilot FINAL completion governance.
 *
 * The closing pin of the Copilot runway: the four 139A docs exist, the
 * final certification attests repo-complete / live-disabled / production-
 * blocked, the default runtime stays not_configured, and src/copilot has no
 * drift / no server-project source.
 */

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readDoc(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

const DOCS = {
  commands: 'docs/PHASE_139A_COPILOT_FINAL_OPERATOR_COMMANDS.md',
  packagePlan: 'docs/PHASE_139A_COPILOT_SERVER_HANDLER_PACKAGE_PLAN.md',
  validation: 'docs/PHASE_139A_COPILOT_TEST_TENANT_VALIDATION_PACKET.md',
  cert: 'docs/PHASE_139A_COPILOT_FINAL_COMPLETION_CERTIFICATION.md',
};

// ---------------------------------------------------------------------------
// 1. The four 139A docs exist
// ---------------------------------------------------------------------------

describe('Phase 139A — the final completion docs exist', () => {
  for (const rel of Object.values(DOCS)) {
    it(`${rel} exists on disk`, () => {
      expect(existsSync(resolve(REPO_ROOT, rel))).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The final certification content
// ---------------------------------------------------------------------------

describe('Phase 139A — the final certification attests repo-complete / live-disabled / blocked', () => {
  const doc = readDoc(DOCS.cert);

  it('states repo-side complete end-to-end and references the full runway', () => {
    expect(doc).toMatch(/Repo-side Copilot work is complete end-to-end/i);
    expect(doc).toMatch(/137A/);
    expect(doc).toMatch(/138C/);
  });

  it('states live disabled / production blocked / human approval per gate', () => {
    expect(doc).toMatch(/Live Copilot remains disabled/i);
    expect(doc).toMatch(/Production remains blocked/i);
    expect(doc).toMatch(/Human approval is required before each gate/i);
  });

  it('pins default not_configured + isLive false', () => {
    expect(doc).toMatch(/Default mode remains `?not_configured`?/i);
    expect(doc).toMatch(/`?isLive`?:[\s\S]{0,20}false/i);
  });

  it('rejects browser-direct Azure/OpenAI + client secrets + autonomous writes + fake responses', () => {
    expect(doc).toMatch(/No browser-direct Azure ?\/ ?OpenAI/i);
    expect(doc).toMatch(/No client secrets/i);
    expect(doc).toMatch(/No autonomous writes/i);
    expect(doc).toMatch(/No fake Copilot responses/i);
  });

  it('requires audit-before-model + proposal-only with confirmation + governedWritePath', () => {
    expect(doc).toMatch(/Audit-before-model is mandatory/i);
    expect(doc).toMatch(/audit_unavailable/);
    expect(doc).toMatch(/require human confirmation and a[\s\S]{0,10}governedWritePath/i);
  });

  it('includes the final status table with production blocked', () => {
    expect(doc).toMatch(/Production enablement[\s\S]{0,20}\*\*Blocked\*\*/i);
    expect(doc).toMatch(/Transport seam[\s\S]{0,40}no default live transport/i);
  });

  it('lists the remaining external gates', () => {
    expect(doc).toMatch(/Remaining external gates/i);
    expect(doc).toMatch(/DLP \+ Azure OpenAI model policy approval/i);
    expect(doc).toMatch(/cr664_copilotauditevent`? table creation/i);
    expect(doc).toMatch(/cr664_RunLosCopilotAssist`? Custom API creation/i);
    expect(doc).toMatch(/Production review/i);
  });
});

describe('Phase 139A — the operator commands + validation packet content', () => {
  it('the operator-commands doc warns test-tenant-only / production-blocked + rollback', () => {
    const doc = readDoc(DOCS.commands);
    expect(doc).toMatch(/Test-tenant only/i);
    expect(doc).toMatch(/Production is blocked/i);
    expect(doc).toMatch(/Rollback ?\/ ?manual cleanup/i);
    expect(doc).toMatch(/--inspect-copilot-audit-table/);
    expect(doc).toMatch(/--seed-copilot-custom-api-metadata/);
  });

  it('the validation packet prohibits production / proposal_only-before-approval / autonomous writes', () => {
    const doc = readDoc(DOCS.validation);
    expect(doc).toMatch(/No production/i);
    expect(doc).toMatch(/No `?proposal_only`?[\s\S]{0,80}until[\s\S]{0,40}live_read_only/i);
    expect(doc).toMatch(/No autonomous writes ever/i);
  });

  it('the server-handler package plan recommends plugin-first + documents the pipeline + fail-closed', () => {
    const doc = readDoc(DOCS.packagePlan);
    expect(doc).toMatch(/Dataverse plugin first/i);
    expect(doc).toMatch(/audit_start/);
    expect(doc).toMatch(/Fail-closed matrix/i);
    expect(doc).toMatch(/No writes directly from model output/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Default runtime not_configured; deployment readiness never ready
// ---------------------------------------------------------------------------

describe('Phase 139A — runtime stays not_configured and deployment is never ready by default', () => {
  it('getCopilotConnector().status().mode is not_configured', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });

  it('server deployment readiness is not ready, with the test-tenant blocker present', () => {
    const r = evaluateCopilotServerDeploymentReadiness();
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' | ')).toMatch(/Test tenant enabled/i);
    expect(r.blockers.join(' | ')).toMatch(/audit table created and verified/i);
  });
});

// ---------------------------------------------------------------------------
// 4. No server-project source added; src/copilot has no drift
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

describe('Phase 139A — no plugin / Azure Function / migration / schema source under src/', () => {
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

describe('Phase 139A — src/copilot has no live / network / secret / write drift', () => {
  const files = copilotSourceFiles();

  it('enumerates the copilot source files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files).toContain('src/copilot/copilotConnector.ts');
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

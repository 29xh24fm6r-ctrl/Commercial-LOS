import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COPILOT_SERVER_HANDLER_CONTRACT,
  copilotServerDeploymentPrerequisites,
  evaluateCopilotServerDeploymentReadiness,
} from './copilotServerDeploymentReadiness';

/**
 * Phase 138C — Copilot server-handler deployment readiness (pure checklist).
 */

describe('Phase 138C — deployment prerequisites', () => {
  it('lists the external prerequisites, all unsatisfied by default', () => {
    const prereqs = copilotServerDeploymentPrerequisites();
    expect(prereqs.length).toBeGreaterThanOrEqual(9);
    expect(prereqs.every((p) => p.satisfied === false)).toBe(true);
    const keys = prereqs.map((p) => p.key);
    expect(keys).toContain('audit_table_created');
    expect(keys).toContain('custom_api_created');
    expect(keys).toContain('server_handler_deployed');
    expect(keys).toContain('dlp_model_policy_approved');
    expect(keys).toContain('disable_switch_configured');
    expect(keys).toContain('test_tenant_enabled');
  });
});

describe('Phase 138C — evaluateCopilotServerDeploymentReadiness', () => {
  it('is never ready with no overrides (all blockers present)', () => {
    const r = evaluateCopilotServerDeploymentReadiness();
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThanOrEqual(9);
    expect(r.satisfied).toEqual([]);
  });

  it('reflects partial operator overrides but stays not-ready until ALL clear', () => {
    const r = evaluateCopilotServerDeploymentReadiness({
      dlp_model_policy_approved: true,
      audit_table_created: true,
    });
    expect(r.ready).toBe(false);
    expect(r.satisfied.length).toBe(2);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('only reports ready when every prerequisite is overridden true (simulation only)', () => {
    const all: Record<string, boolean> = {};
    for (const p of copilotServerDeploymentPrerequisites()) all[p.key] = true;
    const r = evaluateCopilotServerDeploymentReadiness(all);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });
});

describe('Phase 138C — the handler contract documents audit-before-model', () => {
  it('the contract includes audit_start-before-model + fail-closed + server-side-only + proposal-only', () => {
    const joined = COPILOT_SERVER_HANDLER_CONTRACT.join(' | ');
    expect(joined).toMatch(/audit_start[\s\S]*?before any model call/i);
    expect(joined).toMatch(/audit_unavailable/);
    expect(joined).toMatch(/Azure OpenAI SERVER-SIDE only/i);
    expect(joined).toMatch(/never from the browser/i);
    expect(joined).toMatch(/proposal-only/i);
    expect(joined).toMatch(/never execute a write directly from model output/i);
  });
});

describe('Phase 138C — copilotServerDeploymentReadiness.ts is pure (no IO / no drift)', () => {
  const code = readFileSync(resolve(__dirname, 'copilotServerDeploymentReadiness.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('contains no fetch / network / Azure-OpenAI / generated-write / write-call / secret reference', () => {
    expect(code).not.toMatch(/\bfetch\(/);
    expect(code).not.toMatch(/XMLHttpRequest/);
    expect(code).not.toMatch(/api\.openai\.com/i);
    expect(code).not.toMatch(/openai\.azure\.com/i);
    expect(code).not.toMatch(/import\.meta\.env/);
    expect(code).not.toMatch(/AZURE_OPENAI_API_KEY|AZURE_OPENAI_ENDPOINT/);
    expect(code).not.toMatch(/from ['"][^'"]*\/generated\//);
    expect(code).not.toMatch(/\.(create|update|patch|delete)\s*\(/);
  });
});

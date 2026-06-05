import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createDisabledCopilotLiveHarness,
  evaluateCopilotLiveReadiness,
} from './copilotLiveTransportHarness';

/**
 * Phase 137L — Copilot live transport harness (disabled, test-only seam).
 */

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
});
afterEach(() => vi.restoreAllMocks());

describe('Phase 137L — evaluateCopilotLiveReadiness', () => {
  it('is never ready and lists every blocker', () => {
    const r = evaluateCopilotLiveReadiness();
    expect(r.ready).toBe(false);
    const joined = r.blockers.join(' | ');
    expect(joined).toMatch(/Audit table \(cr664_copilotauditevent\) not created/i);
    expect(joined).toMatch(/Custom API \(cr664_RunLosCopilotAssist\) not verified/i);
    expect(joined).toMatch(/Server handler not deployed/i);
    expect(joined).toMatch(/Azure OpenAI model \/ DLP policy not approved/i);
    expect(joined).toMatch(/Live mode not enabled/i);
  });
});

describe('Phase 137L — createDisabledCopilotLiveHarness composes inert pieces', () => {
  it('config resolves not_configured, readiness is not ready, no network call', () => {
    const h = createDisabledCopilotLiveHarness();
    expect(h.config.mode).toBe('not_configured');
    expect(h.readiness.ready).toBe(false);
    expect(h.readiness.blockers.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the disabled audit logger fails closed with audit_unavailable', async () => {
    const h = createDisabledCopilotLiveHarness();
    const res = await h.auditLogger.writeEvent({
      correlationId: 'c1',
      eventType: 'audit_start',
      payloadVersion: '1',
    });
    expect(res.ok).toBe(false);
    expect(res.failClosedCode).toBe('audit_unavailable');
    expect(res.eventId).toBeUndefined();
  });

  it('the disabled handler fails closed and never reaches the model boundary', async () => {
    const h = createDisabledCopilotLiveHarness();
    const res = await h.handler.run({
      workspace: 'banker',
      surface: 'deal',
      mode: 'proposal_only',
      user: { upn: 'b@x.com' },
      context: {},
      prompt: { kind: 'summarize' },
      policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
      correlationId: 'c2',
    });
    expect(res.response.failClosedCode).toBe('audit_unavailable');
    expect(res.modelInvoked).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the (stub) transport fails closed without a network call', async () => {
    const h = createDisabledCopilotLiveHarness();
    const res = await h.transport.invoke({
      workspace: 'banker',
      surface: 'deal',
      mode: 'proposal_only',
      user: { upn: 'b@x.com' },
      context: {},
      prompt: { kind: 'summarize' },
      policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
      correlationId: 'c3',
    });
    expect(res.mode).toBe('disabled');
    expect(res.isLive).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 137L — copilotLiveTransportHarness.ts is pure (no IO / no drift)', () => {
  const code = readFileSync(resolve(__dirname, 'copilotLiveTransportHarness.ts'), 'utf8')
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

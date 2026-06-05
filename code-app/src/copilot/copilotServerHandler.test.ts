import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createDisabledCopilotServerHandler,
  runCopilotServerHandler,
  type CopilotModelBoundary,
} from './copilotServerHandler';
import { createDisabledCopilotAuditLogger, type CopilotAuditLogger } from './copilotAuditLogger';
import type { CopilotCustomApiRequest } from './copilotCustomApiContract';

/**
 * Phase 137L — Copilot server handler (disabled skeleton).
 */

function request(over: Partial<CopilotCustomApiRequest> = {}): CopilotCustomApiRequest {
  return {
    workspace: 'banker',
    surface: 'deal',
    mode: 'proposal_only',
    user: { upn: 'banker@oldglorybank.com', profileId: 'p1', workspaceName: 'Banker Workspace' },
    context: { dealId: 'd1', dealName: 'Acme' },
    prompt: { kind: 'summarize' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-137l',
    ...over,
  };
}

/** A model boundary whose invoke is a spy — must NEVER be called in 137L. */
function spyModelBoundary(): { boundary: CopilotModelBoundary; invoke: ReturnType<typeof vi.fn> } {
  const invoke = vi.fn(async () => ({ never: 'called' }));
  return { boundary: { invoke }, invoke };
}

/** A logger that (falsely) reports audit success — to prove the model is STILL not called. */
const okLogger: CopilotAuditLogger = {
  writeEvent: async () => ({ ok: true, eventId: 'evt-1' }),
};

describe('Phase 137L — handler fails closed on audit_unavailable', () => {
  it('with the disabled logger, returns audit_unavailable and never invokes the model', async () => {
    const { boundary, invoke } = spyModelBoundary();
    const res = await runCopilotServerHandler(request(), {
      auditLogger: createDisabledCopilotAuditLogger('disabled'),
      modelBoundary: boundary,
    });
    expect(res.response.failClosedCode).toBe('audit_unavailable');
    expect(res.response.isLive).toBe(false);
    expect(res.response.proposals).toEqual([]);
    expect(res.response.answer).toBeUndefined();
    expect(res.auditAttempted).toBe(true);
    expect(res.modelInvoked).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('with NO logger supplied, still fails closed (disabled logger default)', async () => {
    const res = await runCopilotServerHandler(request());
    expect(res.response.failClosedCode).toBe('audit_unavailable');
    expect(res.modelInvoked).toBe(false);
  });
});

describe('Phase 137L — handler never invokes the model boundary, even on audit success', () => {
  it('a logger reporting ok still yields not_configured and no model call (live not enabled)', async () => {
    const { boundary, invoke } = spyModelBoundary();
    const res = await runCopilotServerHandler(request(), {
      auditLogger: okLogger,
      modelBoundary: boundary,
    });
    expect(res.auditAttempted).toBe(true);
    expect(res.modelInvoked).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    // Live is not enabled in 137L → not_configured, no fabricated answer.
    expect(res.response.mode).toBe('not_configured');
    expect(res.response.isLive).toBe(false);
    expect(res.response.answer).toBeUndefined();
    expect(res.response.proposals).toEqual([]);
  });
});

describe('Phase 137L — invalid request fails closed before the model boundary', () => {
  it('a request missing correlationId fails closed without attempting audit', async () => {
    const { boundary, invoke } = spyModelBoundary();
    const res = await runCopilotServerHandler(request({ correlationId: '' }), {
      auditLogger: okLogger,
      modelBoundary: boundary,
    });
    expect(res.response.failClosedCode).toBe('policy_blocked');
    expect(res.auditAttempted).toBe(false);
    expect(res.modelInvoked).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('a request with requireConfirmation !== true fails closed', async () => {
    const res = await runCopilotServerHandler(
      request({
        policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: false as unknown as true },
      }),
      { auditLogger: okLogger },
    );
    expect(res.response.failClosedCode).toBe('policy_blocked');
    expect(res.modelInvoked).toBe(false);
  });

  it('an invalid workspace / surface / mode fails closed', async () => {
    for (const bad of [
      request({ workspace: 'admin' as unknown as CopilotCustomApiRequest['workspace'] }),
      request({ surface: 'portfolio' as unknown as CopilotCustomApiRequest['surface'] }),
      request({ mode: 'disabled' as unknown as CopilotCustomApiRequest['mode'] }),
    ]) {
      const res = await runCopilotServerHandler(bad, { auditLogger: okLogger });
      expect(res.response.failClosedCode).toBe('policy_blocked');
      expect(res.modelInvoked).toBe(false);
    }
  });
});

describe('Phase 137L — createDisabledCopilotServerHandler wrapper', () => {
  it('runs the same fail-closed pipeline', async () => {
    const handler = createDisabledCopilotServerHandler({});
    const res = await handler.run(request());
    expect(res.response.failClosedCode).toBe('audit_unavailable');
    expect(res.modelInvoked).toBe(false);
  });
});

describe('Phase 137L — copilotServerHandler.ts is pure (no IO / no drift)', () => {
  const code = readFileSync(resolve(__dirname, 'copilotServerHandler.ts'), 'utf8')
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  buildCopilotCustomApiRequest,
  runCopilotCustomApi,
  type BuildCopilotCustomApiRequestInput,
  type CopilotCustomApiTransport,
} from './copilotCustomApiAdapter';
import type {
  CopilotCustomApiRequest,
  CopilotCustomApiResponse,
} from './copilotCustomApiContract';

/**
 * Phase 137C — Copilot Custom API adapter skeleton (disabled by default).
 *
 * Pins that the adapter makes NO network call by default and fails closed
 * to not_configured without an injected transport. The transport branch is
 * exercised only with an in-memory mock (still no network).
 */

function buildInput(
  over: Partial<BuildCopilotCustomApiRequestInput> = {},
): BuildCopilotCustomApiRequestInput {
  return {
    workspace: 'banker',
    surface: 'deal',
    mode: 'proposal_only',
    user: { upn: 'banker@oldglorybank.com', profileId: 'p1', workspaceName: 'Banker Workspace' },
    context: {
      dealId: 'd1',
      dealName: 'Acme Term Loan',
      clientName: 'Acme',
      stage: 'Underwriting',
      status: 'Active',
      metrics: { openTasks: 2 },
      flags: ['missing-docs'],
      documents: [{ id: 'doc1', type: 'tax-return', status: 'outstanding' }],
      tasks: [{ id: 't1', status: 'open' }],
    },
    prompt: { kind: 'summarize', text: 'Summarize this deal.' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-1',
    ...over,
  };
}

// Guard: spy on any network primitive to prove none is invoked.
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  // Install a spy so a stray fetch would be caught (the adapter must not
  // call it). globalThis.fetch may be undefined in node — assigning a spy
  // is the strongest "was it called?" assertion.
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Phase 137C — buildCopilotCustomApiRequest is a pure passthrough', () => {
  it('maps the already-authorized context through unchanged (no fetch / no enrichment)', () => {
    const input = buildInput();
    const req = buildCopilotCustomApiRequest(input);
    expect(req.workspace).toBe('banker');
    expect(req.surface).toBe('deal');
    expect(req.mode).toBe('proposal_only');
    expect(req.correlationId).toBe('corr-1');
    // Context is used as-is — same reference, nothing fetched or enriched.
    expect(req.context).toBe(input.context);
    expect(req.context.dealId).toBe('d1');
    expect(req.user.upn).toBe('banker@oldglorybank.com');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Phase 137C — runCopilotCustomApi without a transport fails closed', () => {
  it('returns not_configured with an honest warning and no network call', async () => {
    const req = buildCopilotCustomApiRequest(buildInput());
    const res = await runCopilotCustomApi(req);
    expect(res.mode).toBe('not_configured');
    expect(res.isLive).toBe(false);
    expect(res.failClosedCode).toBe('missing_config');
    expect(res.warnings.join(' ')).toMatch(/not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns no fake answer and no proposals in not_configured mode', async () => {
    const req = buildCopilotCustomApiRequest(buildInput());
    const res = await runCopilotCustomApi(req, {});
    expect(res.answer).toBeUndefined();
    expect(res.proposals).toEqual([]);
    expect(res.citations).toEqual([]);
  });
});

describe('Phase 137C — injected transport boundary (in-memory, still no network)', () => {
  it('returns a VALID transport response unchanged', async () => {
    const good: CopilotCustomApiResponse = {
      mode: 'proposal_only',
      isLive: true,
      answer: 'Grounded summary.',
      citations: ['deal'],
      proposals: [
        {
          id: 'p1',
          actionType: 'explain_only',
          title: 'Explain risk',
          summary: 'Read-only explanation.',
          payload: {},
          requireConfirmation: true,
          riskLevel: 'low',
          auditReason: 'explain',
        },
      ],
      warnings: [],
      audit: { correlationId: 'corr-1', eventId: 'e1' },
    };
    const transport: CopilotCustomApiTransport = {
      invoke: vi.fn(async (_req: CopilotCustomApiRequest) => good),
    };
    const res = await runCopilotCustomApi(buildCopilotCustomApiRequest(buildInput()), {
      transport,
    });
    expect(res).toEqual(good);
    expect(transport.invoke).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails closed to disabled/connector_exception when the transport returns an INVALID response', async () => {
    const bad: CopilotCustomApiResponse = {
      mode: 'proposal_only',
      isLive: true,
      answer: 'x',
      citations: [],
      // requireConfirmation false → must be rejected.
      proposals: [
        {
          id: 'p1',
          actionType: 'create_task',
          title: 't',
          summary: 's',
          payload: {},
          requireConfirmation: false as unknown as true,
          governedWritePath: 'task.create',
          riskLevel: 'low',
          auditReason: 'r',
        },
      ],
      warnings: [],
      audit: { correlationId: 'corr-1' },
    };
    const transport: CopilotCustomApiTransport = {
      invoke: vi.fn(async () => bad),
    };
    const res = await runCopilotCustomApi(buildCopilotCustomApiRequest(buildInput()), {
      transport,
    });
    expect(res.mode).toBe('disabled');
    expect(res.failClosedCode).toBe('connector_exception');
    expect(res.proposals).toEqual([]);
  });

  it('fails closed to disabled/connector_exception when the transport throws', async () => {
    const transport: CopilotCustomApiTransport = {
      invoke: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const res = await runCopilotCustomApi(buildCopilotCustomApiRequest(buildInput()), {
      transport,
    });
    expect(res.mode).toBe('disabled');
    expect(res.failClosedCode).toBe('connector_exception');
    expect(res.warnings.join(' ')).toMatch(/boom/);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  COPILOT_CUSTOM_API_NAME,
  createCopilotDataverseCustomApiTransport,
} from './copilotDataverseCustomApiTransport';
import {
  buildCopilotCustomApiRequest,
  runCopilotCustomApi,
} from './copilotCustomApiAdapter';
import { getCopilotConnector } from './copilotConnector';
import type { CopilotConnectorConfig } from './copilotConnectorConfig';
import type { CopilotCustomApiRequest } from './copilotCustomApiContract';

/**
 * Phase 137E — Dataverse Custom API transport stub (fail-closed).
 */

const LIVE_CONFIG: CopilotConnectorConfig = {
  mode: 'proposal_only',
  customApiName: 'cr664_RunLosCopilotAssist',
  endpointAlias: 'dataverse-custom-api',
  policyVersion: 'v1',
};

function request(): CopilotCustomApiRequest {
  return buildCopilotCustomApiRequest({
    workspace: 'banker',
    surface: 'deal',
    mode: 'proposal_only',
    user: { upn: 'banker@oldglorybank.com' },
    context: { dealId: 'd1' },
    prompt: { kind: 'summarize' },
    policy: { allowProposals: true, allowedActionTypes: ['explain_only'], requireConfirmation: true },
    correlationId: 'corr-137e',
  });
}

// Guard against any stray network primitive.
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchSpy;
});
afterEach(() => vi.restoreAllMocks());

describe('Phase 137E — Custom API name is pinned', () => {
  it('COPILOT_CUSTOM_API_NAME equals cr664_RunLosCopilotAssist', () => {
    expect(COPILOT_CUSTOM_API_NAME).toBe('cr664_RunLosCopilotAssist');
  });
});

describe('Phase 137E — the transport factory returns a fail-closed transport', () => {
  it('returns a transport object exposing invoke()', () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    expect(typeof t.invoke).toBe('function');
  });

  it('invoking the stub returns a disabled / missing_config response (not a fake answer)', async () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    const res = await t.invoke(request());
    expect(res.mode).toBe('disabled');
    expect(res.failClosedCode).toBe('missing_config');
    expect(res.warnings.join(' ')).toMatch(/transport_not_implemented/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the stub never returns isLive true and never returns proposals or an answer', async () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    const res = await t.invoke(request());
    expect(res.isLive).toBe(false);
    expect(res.proposals).toEqual([]);
    expect(res.answer).toBeUndefined();
  });

  it('does not throw a UI-breaking error (resolves, never rejects)', async () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    await expect(t.invoke(request())).resolves.toBeTruthy();
  });

  it('a URL endpoint alias still fails closed (symbolic alias only)', async () => {
    const t = createCopilotDataverseCustomApiTransport({
      endpointAlias: 'https://my-aoai.openai.azure.com',
    });
    const res = await t.invoke(request());
    expect(res.mode).toBe('disabled');
    expect(res.warnings.join(' ')).toMatch(/symbolic/i);
  });
});

describe('Phase 137E — the stub stays fail-closed through the adapter seam', () => {
  it('runCopilotCustomApi with the stub transport + live config fails closed (disabled)', async () => {
    const t = createCopilotDataverseCustomApiTransport({ endpointAlias: 'dataverse-custom-api' });
    const res = await runCopilotCustomApi(request(), { config: LIVE_CONFIG, transport: t });
    expect(res.mode).toBe('disabled');
    expect(res.isLive).toBe(false);
    expect(res.proposals).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runCopilotCustomApi without an injected transport remains not_configured', async () => {
    const res = await runCopilotCustomApi(request());
    expect(res.mode).toBe('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the default app connector still reports not_configured (no concrete transport wired)', () => {
    expect(getCopilotConnector().status().mode).toBe('not_configured');
  });
});

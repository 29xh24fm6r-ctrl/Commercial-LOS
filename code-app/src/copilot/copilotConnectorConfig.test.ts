import { describe, it, expect } from 'vitest';

import {
  COPILOT_CUSTOM_API_NAME,
  resolveCopilotConnectorConfig,
} from './copilotConnectorConfig';

/**
 * Phase 137D — Copilot connector config resolver (pure, fail-closed).
 */

/** A fully-valid live env (non-secret) for the happy path. */
function liveEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    VITE_COPILOT_MODE: 'proposal_only',
    VITE_COPILOT_CUSTOM_API_NAME: COPILOT_CUSTOM_API_NAME,
    VITE_COPILOT_ENDPOINT_ALIAS: 'dataverse-custom-api',
    VITE_COPILOT_POLICY_VERSION: 'v1',
    ...over,
  };
}

describe('Phase 137D — default / explicit modes', () => {
  it('missing config resolves to not_configured', () => {
    expect(resolveCopilotConnectorConfig().mode).toBe('not_configured');
    expect(resolveCopilotConnectorConfig({}).mode).toBe('not_configured');
    expect(resolveCopilotConnectorConfig({ VITE_COPILOT_MODE: '' }).mode).toBe(
      'not_configured',
    );
    expect(
      resolveCopilotConnectorConfig({ VITE_COPILOT_MODE: 'not_configured' }).mode,
    ).toBe('not_configured');
  });

  it('explicit disabled resolves to disabled', () => {
    const c = resolveCopilotConnectorConfig({ VITE_COPILOT_MODE: 'disabled' });
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/disabled/i);
  });

  it('an unknown mode fails closed to disabled with a reason', () => {
    const c = resolveCopilotConnectorConfig({ VITE_COPILOT_MODE: 'turbo' });
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/Unrecognized/i);
  });
});

describe('Phase 137D — live mode requires the full non-secret contract', () => {
  it('a complete, valid live env resolves the live mode', () => {
    const c = resolveCopilotConnectorConfig(liveEnv());
    expect(c.mode).toBe('proposal_only');
    expect(c.customApiName).toBe(COPILOT_CUSTOM_API_NAME);
    expect(c.endpointAlias).toBe('dataverse-custom-api');
    expect(c.policyVersion).toBe('v1');
    expect(c.reason).toBeUndefined();
  });

  it('live_read_only also resolves with the full contract', () => {
    const c = resolveCopilotConnectorConfig(liveEnv({ VITE_COPILOT_MODE: 'live_read_only' }));
    expect(c.mode).toBe('live_read_only');
  });

  it('requires the EXACT custom API name', () => {
    const c = resolveCopilotConnectorConfig(
      liveEnv({ VITE_COPILOT_CUSTOM_API_NAME: 'cr664_SomethingElse' }),
    );
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/Custom API name/i);
  });

  it('requires a custom API name at all', () => {
    const c = resolveCopilotConnectorConfig(
      liveEnv({ VITE_COPILOT_CUSTOM_API_NAME: undefined }),
    );
    expect(c.mode).toBe('disabled');
  });

  it('requires a SYMBOLIC endpoint alias, not a URL/host', () => {
    const c = resolveCopilotConnectorConfig(
      liveEnv({ VITE_COPILOT_ENDPOINT_ALIAS: 'api.example.com' }),
    );
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/symbolic alias|not a URL/i);
  });

  it('rejects an unknown symbolic alias', () => {
    const c = resolveCopilotConnectorConfig(
      liveEnv({ VITE_COPILOT_ENDPOINT_ALIAS: 'some-other-alias' }),
    );
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/Unknown endpoint alias/i);
  });

  it('requires a policyVersion', () => {
    const c = resolveCopilotConnectorConfig(
      liveEnv({ VITE_COPILOT_POLICY_VERSION: undefined }),
    );
    expect(c.mode).toBe('disabled');
    expect(c.reason).toMatch(/policyVersion/i);
  });
});

describe('Phase 137D — secret-looking config fails closed to disabled', () => {
  it('a secret-looking KEY (contains KEY/SECRET/TOKEN/PASSWORD) fails closed', () => {
    for (const key of [
      'VITE_COPILOT_API_KEY',
      'COPILOT_SECRET',
      'SOME_TOKEN',
      'ADMIN_PASSWORD',
    ]) {
      const c = resolveCopilotConnectorConfig(liveEnv({ [key]: 'x' }));
      expect(c.mode, key).toBe('disabled');
      expect(c.reason, key).toMatch(/secret/i);
    }
  });

  it('a server-only Azure OpenAI key/endpoint in client config fails closed', () => {
    // Built from fragments so this test file never embeds the literal name.
    const keyName = ['AZURE', 'OPENAI', 'API', 'KEY'].join('_');
    const endpointName = ['AZURE', 'OPENAI', 'ENDPOINT'].join('_');
    expect(resolveCopilotConnectorConfig(liveEnv({ [keyName]: 'x' })).mode).toBe(
      'disabled',
    );
    expect(
      resolveCopilotConnectorConfig(liveEnv({ [endpointName]: 'x' })).mode,
    ).toBe('disabled');
  });

  it('a secret-looking VALUE (URL / bearer / sk- / long secret) fails closed', () => {
    const secrets = [
      'https://my-aoai.openai.azure.com',
      'Bearer abc.def.ghi',
      'sk-ABCDEF1234567890',
      'k'.repeat(50),
    ];
    for (const v of secrets) {
      const c = resolveCopilotConnectorConfig({
        VITE_COPILOT_MODE: 'proposal_only',
        VITE_COPILOT_SOME_FLAG: v,
      });
      expect(c.mode, v).toBe('disabled');
      expect(c.reason, v).toMatch(/secret/i);
    }
  });
});

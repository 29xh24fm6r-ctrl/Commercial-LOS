import { describe, expect, it } from 'vitest';
import { buildDealSharePointConnectorAdapter, DEAL_SHAREPOINT_CONNECTOR_REGISTRATION } from './dealSharePointConnectorAdapter';

describe('generated SharePoint connector activation gate', () => {
  it('is unavailable and never fabricates LIVE success before generated signatures exist', async () => {
    expect(DEAL_SHAREPOINT_CONNECTOR_REGISTRATION.registered).toBe(false);
    const adapter = buildDealSharePointConnectorAdapter();
    expect((await adapter.ensureFolder({} as never)).ok).toBe(false);
    expect((await adapter.upload({} as never)).ok).toBe(false);
    expect(await adapter.verifyFolder({} as never)).toBe(false);
    expect(await adapter.verifyFile({} as never)).toBe(false);
  });
});

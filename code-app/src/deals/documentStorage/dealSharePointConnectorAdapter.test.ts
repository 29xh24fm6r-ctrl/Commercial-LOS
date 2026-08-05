import { describe, expect, it } from 'vitest';
import { buildDealSharePointConnectorAdapter, DEAL_SHAREPOINT_CONNECTOR_REGISTRATION } from './dealSharePointConnectorAdapter';

describe('generated SharePoint connector activation gate', () => {
  it('distinguishes registered list CRUD from an unavailable binary transport', async () => {
    expect(DEAL_SHAREPOINT_CONNECTOR_REGISTRATION.dataSourceRegistered).toBe(true);
    expect(DEAL_SHAREPOINT_CONNECTOR_REGISTRATION.generatedServiceName).toBe('DocumentsService');
    expect(DEAL_SHAREPOINT_CONNECTOR_REGISTRATION.inspectedOperations).toContain('create');
    expect(DEAL_SHAREPOINT_CONNECTOR_REGISTRATION.binaryTransportConfigured).toBe(false);
    const adapter = buildDealSharePointConnectorAdapter();
    expect((await adapter.ensureFolder({} as never)).ok).toBe(false);
    expect((await adapter.upload({} as never)).ok).toBe(false);
    expect(await adapter.verifyFolder({} as never)).toBe(false);
    expect(await adapter.verifyFile({} as never)).toBe(false);
  });
});

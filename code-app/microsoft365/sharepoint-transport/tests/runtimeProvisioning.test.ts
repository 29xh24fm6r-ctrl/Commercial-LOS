import { describe, expect, it, vi } from 'vitest';
import { verifiedEasyAuthIdentity } from '../azure-function/src/authenticationClaims.js';
import { calculateRuntimeConfigurationHash, loadRuntimeConfiguration, type RuntimeConfiguration } from '../azure-function/src/runtimeConfiguration.js';
import { ManagedIdentitySharePointGraphClient } from '../graph/managedIdentityGraphClient.js';
import { GraphCollisionError } from '../graph/graphClient.js';
import { createProductionSharePointTransportHost } from '../production/productionHostFactory.js';

const base = (): Omit<RuntimeConfiguration, 'configurationHash'> => ({
  tenantId: 'e5d2be43-2e2c-4968-b5f3-c73dd825ee80',
  graphSiteId: 'oldglory22.sharepoint.com,fcef8a95-b6b8-4c7f-85d9-d30c4d13aa8a,2c7f7bf5-9995-48b2-93a4-137bc741cf48',
  graphDriveId: 'b!lYrv_Li2f0yF2dMMTROqivV7fyyVmbJIk6QTe8dBz0gxIabBRnm5RLtMtGN6Fvg8',
  governedRootItemId: '01GLFG6KONJ5W27MKUD5AZRKTJWP2MGT5P', verifiedRootPath: '/(a) Loans',
  siteUrl: 'https://oldglory22.sharepoint.com/sites/BusinessLending', libraryId: 'c1a62131-7946-44b9-bb4c-b4637a16f83c',
  contractVersion: 'ogb-deal-sharepoint/v1', configurationVersion: 'sp-a3.1', functionResourceId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/func',
  functionHostname: 'func.azurewebsites.net', connectorIdentity: 'connector-app-id', runtimeIdentity: 'managed-identity-object-id',
  permissionGrantEvidenceId: 'sites-selected-permission-id', idempotencyTable: 'SharePointIdempotency', orphanTable: 'SharePointOrphans', dataverseAuthorizationAdapter: 'dataverse-read-v1',
});

function environment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const value = base(); const hash = calculateRuntimeConfigurationHash(value);
  return { SP_TENANT_ID: value.tenantId, SP_GRAPH_SITE_ID: value.graphSiteId, SP_GRAPH_DRIVE_ID: value.graphDriveId, SP_GOVERNED_ROOT_ITEM_ID: value.governedRootItemId,
    SP_GOVERNED_ROOT_PATH: value.verifiedRootPath, SP_SITE_URL: value.siteUrl, SP_LIBRARY_ID: value.libraryId, SP_CONTRACT_VERSION: value.contractVersion,
    SP_CONFIGURATION_VERSION: value.configurationVersion, SP_FUNCTION_RESOURCE_ID: value.functionResourceId, SP_FUNCTION_HOSTNAME: value.functionHostname,
    SP_CONNECTOR_IDENTITY: value.connectorIdentity, SP_RUNTIME_IDENTITY: value.runtimeIdentity, SP_PERMISSION_GRANT_EVIDENCE_ID: value.permissionGrantEvidenceId,
    SP_IDEMPOTENCY_TABLE: value.idempotencyTable, SP_ORPHAN_TABLE: value.orphanTable, SP_DATAVERSE_AUTHORIZATION_ADAPTER: value.dataverseAuthorizationAdapter,
    SP_CONFIGURATION_HASH: hash, ...overrides };
}

describe('SP-A3 runtime configuration', () => {
  it('calculates a deterministic hash only for resolved immutable fields', () => { expect(calculateRuntimeConfigurationHash(base())).toBe(calculateRuntimeConfigurationHash(base())); });
  it('refuses a final hash while runtime identity or permission evidence is unresolved', () => {
    expect(() => calculateRuntimeConfigurationHash({ ...base(), runtimeIdentity: 'UNRESOLVED' })).toThrow('RUNTIME_CONFIGURATION_UNRESOLVED');
    expect(() => calculateRuntimeConfigurationHash({ ...base(), permissionGrantEvidenceId: '' })).toThrow('RUNTIME_CONFIGURATION_UNRESOLVED');
  });
  it.each([['wrong tenant','SP_TENANT_ID','bad'],['wrong site','SP_GRAPH_SITE_ID','bad'],['wrong drive','SP_GRAPH_DRIVE_ID','bad'],['wrong root','SP_GOVERNED_ROOT_ITEM_ID','bad'],['missing runtime identity','SP_RUNTIME_IDENTITY',''],['invalid hash','SP_CONFIGURATION_HASH','0'.repeat(64)]])('%s fails closed', (_label, key, value) => { expect(() => loadRuntimeConfiguration(environment({ [key]: value }))).toThrow(); });
  it('loads a fully resolved, correctly hashed configuration', () => { expect(loadRuntimeConfiguration(environment()).functionHostname).toBe('func.azurewebsites.net'); });
});

describe('SP-A3 verified claims adapter', () => {
  const principal = (claims: Array<{ typ: string; val: string }>) => Buffer.from(JSON.stringify({ auth_typ: 'aad', claims })).toString('base64');
  it('rejects missing and ambiguous claims', () => {
    expect(() => verifiedEasyAuthIdentity({})).toThrow('AUTHENTICATED_IDENTITY_REQUIRED');
    expect(() => verifiedEasyAuthIdentity({ 'x-ms-client-principal-id': 'one', 'x-ms-client-principal': principal([{ typ: 'oid', val: 'one' }, { typ: 'oid', val: 'two' }]) })).toThrow('AUTHENTICATED_IDENTITY_AMBIGUOUS');
  });
  it('uses only verified headers and ignores client body identity by construction', () => {
    const result = verifiedEasyAuthIdentity({ 'x-ms-client-principal-id': 'actor-1', 'x-ms-client-principal': principal([{ typ: 'oid', val: 'actor-1' }, { typ: 'tid', val: base().tenantId }]) }, 'connector');
    expect(result.claims.oid).toBe('actor-1'); expect(result.connectorIdentity).toBe('connector');
  });
});

describe('SP-A3 managed identity Graph client', () => {
  const token = { getToken: vi.fn(async () => ({ token: 'server-token' })) };
  it('performs exact reads and rejects malformed Graph responses', async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => { void _input; void _init; return new Response(JSON.stringify({ id: 'site', webUrl: 'https://example' }), { status: 200 }); });
    const client = new ManagedIdentitySharePointGraphClient(token, fetcher);
    expect(await client.readSite('site')).toEqual({ id: 'site', webUrl: 'https://example' });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ authorization: 'Bearer server-token' });
    await expect(new ManagedIdentitySharePointGraphClient(token, async () => new Response('null', { status: 200 })).readSite('site')).rejects.toThrow('GRAPH_RESPONSE_MALFORMED');
    const driveClient = new ManagedIdentitySharePointGraphClient(token, async () => new Response(JSON.stringify({ id: 'drive', webUrl: 'https://example/drive', list: { id: 'list' } }), { status: 200 }));
    expect(await driveClient.readDrive('drive')).toEqual({ id: 'drive', webUrl: 'https://example/drive', listId: 'list' });
  });
  it('uses conflictBehavior fail and never rename for folders', async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => { void _input; void _init; return new Response(JSON.stringify({ id: 'folder', name: 'Borrower', webUrl: 'https://example/folder', size: 0, folder: {} }), { status: 201 }); });
    await new ManagedIdentitySharePointGraphClient(token, fetcher).createFolder({ driveId: 'drive', parentItemId: 'parent', name: 'Borrower', conflictBehavior: 'fail' });
    const body = String(fetcher.mock.calls[0]?.[1]?.body); expect(body).toContain('"@microsoft.graph.conflictBehavior":"fail"'); expect(body).not.toContain('rename');
  });
  it('blocks an upload when the exact name already exists', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ value: [{ id: 'existing', name: 'file.pdf', webUrl: 'https://example/file', size: 1, file: { mimeType: 'application/pdf' } }] }), { status: 200 }));
    await expect(new ManagedIdentitySharePointGraphClient(token, fetcher).uploadFile({ driveId: 'drive', parentItemId: 'parent', name: 'file.pdf', mimeType: 'application/pdf', content: new Uint8Array([1]), conflictBehavior: 'fail' })).rejects.toBeInstanceOf(GraphCollisionError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('SP-A3 production composition', () => {
  it('fails startup when durable ledger storage is unavailable', async () => {
    const config = { ...base(), configurationHash: calculateRuntimeConfigurationHash(base()) };
    const store = { storeId: 'table', healthCheck: async () => false, createIfAbsent: async () => false, read: async () => undefined, replace: async () => {}, delete: async () => {} };
    await expect(createProductionSharePointTransportHost({ configuration: config, graph: {} as never, actors: {} as never,
      authorization: { adapterId: 'dataverse-read-v1', healthCheck: async () => ({ ready: true, evidenceId: 'evidence' }), authorize: async () => undefined }, idempotencyStore: store, orphanStore: store })).rejects.toThrow('DURABLE_');
  });
});

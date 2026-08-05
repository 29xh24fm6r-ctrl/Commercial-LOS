import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), 'utf8');

describe('SP-A3 Azure and connector assets', () => {
  it('defines exactly four authenticated operations with no anonymous trigger', () => {
    const files = ['ensureFolder','upload','verifyFolder','verifyFile'].map((name) => text(`azure-function/src/functions/${name}.ts`));
    expect(files).toHaveLength(4); for (const file of files) { expect(file).toContain("authLevel: 'function'"); expect(file).not.toContain("authLevel: 'anonymous'"); }
  });
  it('OpenAPI exposes only four operations, authentication, binary content, and correlation IDs', () => {
    const api = JSON.parse(text('openapi/origination-sharepoint-transport.openapi.json')) as { paths: Record<string, { post: { operationId: string; security?: unknown; parameters?: Array<{ name: string }>; requestBody?: unknown } }>; security?: unknown };
    expect(Object.values(api.paths).map((path) => path.post.operationId).sort()).toEqual(['ensureFolder','upload','verifyFile','verifyFolder']);
    expect(api.security).toBeTruthy(); for (const path of Object.values(api.paths)) { expect(path.post.security).toBeTruthy(); expect(path.post.parameters?.some((p) => p.name === 'x-correlation-id')).toBe(true); }
    expect(JSON.stringify(api.paths['/api/sharepoint/upload'])).toContain('contentBase64'); expect(JSON.stringify(api.paths['/api/sharepoint/upload'])).toContain('byte');
  });
  it('Bicep requires authentication, HTTPS, TLS 1.2, restricted CORS, identity, and contains no secrets', () => {
    const bicep = text('azure-function/infra/main.bicep'); expect(bicep).toContain('httpsOnly: true'); expect(bicep).toContain("minimumTlsVersion: 'TLS1_2'");
    expect(bicep).toContain('requireAuthentication: true'); expect(bicep).toContain("unauthenticatedClientAction: 'Return401'"); expect(bicep).toContain('allowedOrigins: allowedOrigins');
    expect(bicep).toContain("type: 'SystemAssigned'"); expect(bicep.toLowerCase()).not.toMatch(/clientsecret|access.?token|graph.?token/);
  });
  it('provisioning defaults to what-if and every mutation requires an explicit switch', () => {
    const provision = text('../../scripts/microsoft365/provision-origination-sharepoint-runtime.ps1'); expect(provision).toContain('[switch]$Apply'); expect(provision).toContain('deployment group what-if'); expect(provision).toContain('if (-not $Apply)');
    const grant = text('../../scripts/microsoft365/grant-origination-sharepoint-sites-selected.ps1'); expect(grant).toContain('[switch]$Apply'); expect(grant).toContain('[switch]$Force'); expect(grant).toContain("if(-not $Apply)"); expect(grant).toContain("if(-not $Force)"); expect(grant).toContain("SITE_ID_MISMATCH");
  });
  it('production composition contains no in-memory ledger fallback', () => { const factory = text('production/productionHostFactory.ts'); expect(factory).not.toContain('InMemoryIdempotencyLedger'); expect(factory).not.toContain('InMemoryOrphanReconciliationLedger'); });
  it('truthful evidence leaves every applied or verified state false', () => {
    const evidence = JSON.parse(text('contract/immutable-configuration-evidence.json')) as Record<string, unknown>;
    for (const key of ['infrastructureApplied','runtimeIdentityResolved','permissionGrantApplied','permissionGrantReadBack','functionAuthenticationVerified','durableLedgerConfigured','connectorRegistered','generatedSdkInspected','configurationHashPinned','realFileSmokeVerified','liveActivated']) expect(evidence[key]).toBe(false);
    expect(evidence.infrastructureDefined).toBe(true); expect(evidence.connectorDefinitionReady).toBe(true);
  });
});

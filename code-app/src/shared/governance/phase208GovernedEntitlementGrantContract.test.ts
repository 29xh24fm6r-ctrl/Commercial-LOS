import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { grantAppEntitlement, type AdminEntitlementGrantInput } from '../../access/adminEntitlementGrantAdapter';

/**
 * Phase 208 / A2 — governed entitlement grant adapter governance.
 *
 * Static pins: pure adapter (no SDK/fetch/delete), disabled-by-default flag, no
 * PII/fake data, no Dataverse-security-role / Entra grant API. Runtime pins:
 * fails closed by default, requires audit, never writes on a blocked/dry-run path.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const ADAPTER = read('access', 'adminEntitlementGrantAdapter.ts');

const baseInput = (over: Partial<AdminEntitlementGrantInput> = {}): AdminEntitlementGrantInput => ({
  mode: 'live',
  actor: { platformUserId: 'pu', upn: 'u', isSuperAdmin: true },
  targetPlatformUserId: 'pu-t',
  targetPlatformUserExists: true,
  workspaceId: 'ws',
  accessLevelName: 'Full',
  accessLevelValue: 788190001,
  correlationId: 'c',
  ...over,
});

describe('static safety', () => {
  it('no fetch / SDK / generated service / getClient', () => {
    expect(ADAPTER).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(ADAPTER).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient|dataSourcesInfo/);
  });

  it('no delete operation / PublishXml', () => {
    expect(ADAPTER).not.toMatch(/\b(deleteRecord|deleteMultiple|DeleteEntity)\b/);
    expect(ADAPTER).not.toMatch(/method:\s*['"]DELETE['"]|PublishXml/);
  });

  it('disabled by default at build time', () => {
    expect(ADAPTER).toMatch(/export const ADMIN_ENTITLEMENT_WRITE_ENABLED = false as const;/);
  });

  it('does not call any tenant / security-role / Entra grant API', () => {
    expect(ADAPTER).not.toMatch(/\b(assignSecurityRole|addSecurityRole|assignEntraRole|addEntraRole|grantTenantAccess|AddMembersToRole)\b/);
  });

  it('no PII / fake-data literals', () => {
    expect(ADAPTER).not.toMatch(/@(example|acme|test)\.(com|org)/i);
    expect(ADAPTER).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    expect(ADAPTER).not.toMatch(/\bAcme\b|\bJohn\s+Smith\b/);
  });
});

describe('runtime fail-closed', () => {
  it('default config (no flag/transport/audit) is blocked', async () => {
    const r = await grantAppEntitlement(baseInput());
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.gateSatisfied).toBe(false);
  });

  it('always produces an audit payload with actor + target + correlation id', async () => {
    const r = await grantAppEntitlement(baseInput());
    expect(r.audit.action).toBe('grant-entitlement');
    expect(r.audit.correlationId).toBe('c');
    expect(r.audit.targetPlatformUserId).toBe('pu-t');
  });

  it('dry-run never invokes the transport', async () => {
    const createEntitlement = (await import('vitest')).vi.fn(async () => ({ ok: true, id: 'x' }));
    const r = await grantAppEntitlement(baseInput({ mode: 'dry-run', transport: { createEntitlement }, auditSink: { write: async () => ({ ok: true }) }, config: { writeEnabled: true, singleRecordSmokeEnabled: true } }));
    expect(r.outcome).toBe('dry_run_only');
    expect(createEntitlement).not.toHaveBeenCalled();
  });
});

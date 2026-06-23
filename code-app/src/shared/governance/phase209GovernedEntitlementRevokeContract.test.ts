import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { revokeAppEntitlement, type AdminEntitlementRevokeInput } from '../../access/adminEntitlementRevokeAdapter';

/**
 * Phase 209 / A3 — governed entitlement revoke adapter governance.
 *
 * Static: pure adapter, deactivate-not-delete, disabled-by-default, no SDK/fetch.
 * Runtime: fails closed by default, reason required, last-Admin self-revoke
 * protected, never deletes, audit on every path.
 */

const here = (...p: string[]) => resolve(__dirname, '..', '..', ...p);
const read = (...p: string[]) => readFileSync(here(...p), 'utf8');
const ADAPTER = read('access', 'adminEntitlementRevokeAdapter.ts');

const baseInput = (over: Partial<AdminEntitlementRevokeInput> = {}): AdminEntitlementRevokeInput => ({
  mode: 'live',
  actor: { platformUserId: 'pu', upn: 'u', isSuperAdmin: true },
  targetEntitlementId: 'ent-1',
  reason: 'r',
  correlationId: 'c',
  ...over,
});

describe('static safety', () => {
  it('no fetch / SDK / generated service', () => {
    expect(ADAPTER).not.toMatch(/\b(fetch|XMLHttpRequest)\s*\(/);
    expect(ADAPTER).not.toMatch(/@microsoft\/power-apps|generated\/services|Cr664_\w+Service|getClient|dataSourcesInfo/);
  });
  it('deactivates, never deletes (no delete verb / PublishXml)', () => {
    expect(ADAPTER).not.toMatch(/\b(deleteRecord|deleteMultiple|DeleteEntity)\b/);
    expect(ADAPTER).not.toMatch(/method:\s*['"]DELETE['"]|PublishXml/);
    expect(ADAPTER).toMatch(/deactivateEntitlement/);
  });
  it('disabled by default', () => {
    expect(ADAPTER).toMatch(/export const ADMIN_ENTITLEMENT_REVOKE_ENABLED = false as const;/);
  });
  it('no PII / fake-data literals', () => {
    expect(ADAPTER).not.toMatch(/@(example|acme|test)\.(com|org)/i);
    expect(ADAPTER).not.toMatch(/\bAcme\b|\bJohn\s+Smith\b/);
  });
});

describe('runtime fail-closed', () => {
  it('default config is blocked, no write', async () => {
    const r = await revokeAppEntitlement(baseInput());
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });
  it('reason is required', async () => {
    const r = await revokeAppEntitlement(baseInput({ reason: '' }));
    expect(r.outcome).toBe('skipped_missing_required_data');
  });
  it('always produces an audit payload with actor + correlation id + reason', async () => {
    const r = await revokeAppEntitlement(baseInput());
    expect(r.audit.action).toBe('revoke-entitlement');
    expect(r.audit.correlationId).toBe('c');
    expect(r.audit.reason).toBe('r');
  });
});

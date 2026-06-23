import { describe, it, expect, vi } from 'vitest';
import {
  grantAppEntitlement,
  ADMIN_ENTITLEMENT_WRITE_ENABLED,
  VALID_ACCESS_LEVEL_NAMES,
  type AdminEntitlementGrantInput,
  type EntitlementWriteTransport,
  type EntitlementAuditSink,
} from './adminEntitlementGrantAdapter';

/** Phase 208 / A2 — governed app-level entitlement grant adapter. */

function okTransport(): EntitlementWriteTransport {
  return { createEntitlement: vi.fn(async () => ({ ok: true, id: 'ent-new-1' })) };
}
function okAudit(): EntitlementAuditSink {
  return { write: vi.fn(async () => ({ ok: true })) };
}

function liveInput(over: Partial<AdminEntitlementGrantInput> = {}): AdminEntitlementGrantInput {
  return {
    mode: 'live',
    actor: { platformUserId: 'pu-admin', upn: 'admin@ogb', isSuperAdmin: true },
    targetPlatformUserId: 'pu-target',
    targetPlatformUserExists: true,
    workspaceId: 'ws-banker',
    accessLevelName: 'Full',
    accessLevelValue: 788190001,
    correlationId: 'corr-1',
    config: { writeEnabled: true, singleRecordSmokeEnabled: true },
    transport: okTransport(),
    auditSink: okAudit(),
    existingEntitlements: [],
    ...over,
  };
}

describe('default-off + safe enumeration', () => {
  it('the build-time flag is false and the access-level set is fixed', () => {
    expect(ADMIN_ENTITLEMENT_WRITE_ENABLED).toBe(false);
    expect([...VALID_ACCESS_LEVEL_NAMES]).toEqual(['Admin', 'Full', 'ReadOnly']);
  });
});

describe('authorized success', () => {
  it('creates exactly one entitlement and writes an audit row', async () => {
    const transport = okTransport();
    const auditSink = okAudit();
    const r = await grantAppEntitlement(liveInput({ transport, auditSink }));
    expect(r.outcome).toBe('created');
    expect(r.recordId).toBe('ent-new-1');
    expect(r.gateSatisfied).toBe(true);
    expect(transport.createEntitlement).toHaveBeenCalledTimes(1);
    expect(auditSink.write).toHaveBeenCalledTimes(1);
    expect(r.audit.actorUpn).toBe('admin@ogb');
    expect(r.audit.targetPlatformUserId).toBe('pu-target');
    expect(r.audit.correlationId).toBe('corr-1');
  });
});

describe('fails closed', () => {
  it('unauthorized (not Super Admin) is blocked, no write', async () => {
    const transport = okTransport();
    const r = await grantAppEntitlement(liveInput({ actor: { platformUserId: 'p', upn: 'u', isSuperAdmin: false }, transport }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(transport.createEntitlement).not.toHaveBeenCalled();
  });

  it('feature flag off is blocked', async () => {
    const r = await grantAppEntitlement(liveInput({ config: { writeEnabled: false, singleRecordSmokeEnabled: true } }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(r.blockers.some((b) => /ADMIN_ENTITLEMENT_WRITE_ENABLED/.test(b))).toBe(true);
  });

  it('single-record smoke mode off is blocked', async () => {
    const r = await grantAppEntitlement(liveInput({ config: { writeEnabled: true, singleRecordSmokeEnabled: false } }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('missing target platform user (does not exist) is blocked', async () => {
    const r = await grantAppEntitlement(liveInput({ targetPlatformUserExists: false }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('no transport is blocked', async () => {
    const r = await grantAppEntitlement(liveInput({ transport: undefined }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });

  it('no audit sink is blocked', async () => {
    const r = await grantAppEntitlement(liveInput({ auditSink: undefined }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
  });
});

describe('missing / invalid required data', () => {
  it('missing target id is skipped (not blocked-gate)', async () => {
    const r = await grantAppEntitlement(liveInput({ targetPlatformUserId: '' }));
    expect(r.outcome).toBe('skipped_missing_required_data');
    expect(r.audit.error).toMatch(/targetPlatformUserId/);
  });

  it('invalid access level name is skipped — never invented', async () => {
    const r = await grantAppEntitlement(liveInput({ accessLevelName: 'Superuser' }));
    expect(r.outcome).toBe('skipped_missing_required_data');
    expect(r.audit.error).toMatch(/accessLevelName/);
  });

  it('non-positive access level value is skipped', async () => {
    const r = await grantAppEntitlement(liveInput({ accessLevelValue: 0 }));
    expect(r.outcome).toBe('skipped_missing_required_data');
  });
});

describe('duplicate + service + audit failures', () => {
  it('an existing active entitlement is a duplicate, no second create', async () => {
    const transport = okTransport();
    const r = await grantAppEntitlement(liveInput({
      transport,
      existingEntitlements: [{ platformUserId: 'pu-target', workspaceId: 'ws-banker', active: true }],
    }));
    expect(r.outcome).toBe('duplicate_exists');
    expect(transport.createEntitlement).not.toHaveBeenCalled();
  });

  it('transport failure returns failed_dataverse', async () => {
    const transport: EntitlementWriteTransport = { createEntitlement: vi.fn(async () => ({ ok: false, error: 'dv_down' })) };
    const r = await grantAppEntitlement(liveInput({ transport }));
    expect(r.outcome).toBe('failed_dataverse');
    expect(r.audit.error).toBe('dv_down');
  });

  it('audit failure after a successful write is honest partial success', async () => {
    const auditSink: EntitlementAuditSink = { write: vi.fn(async () => ({ ok: false, error: 'audit_down' })) };
    const r = await grantAppEntitlement(liveInput({ auditSink }));
    expect(r.outcome).toBe('audit_failed_partial_success');
    expect(r.recordId).toBe('ent-new-1');
  });
});

describe('dry-run', () => {
  it('previews without writing', async () => {
    const transport = okTransport();
    const r = await grantAppEntitlement(liveInput({ mode: 'dry-run', transport }));
    expect(r.outcome).toBe('dry_run_only');
    expect(transport.createEntitlement).not.toHaveBeenCalled();
  });
});

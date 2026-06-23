import { describe, it, expect, vi } from 'vitest';
import {
  revokeAppEntitlement,
  ADMIN_ENTITLEMENT_REVOKE_ENABLED,
  type AdminEntitlementRevokeInput,
  type EntitlementRevokeTransport,
  type EntitlementRevokeAuditSink,
  type RevokeTargetEntitlement,
} from './adminEntitlementRevokeAdapter';

/** Phase 209 / A3 — governed app-level entitlement revoke/deactivate adapter. */

function okTransport(): EntitlementRevokeTransport {
  return { deactivateEntitlement: vi.fn(async () => ({ ok: true })) };
}
function okAudit(): EntitlementRevokeAuditSink {
  return { write: vi.fn(async () => ({ ok: true })) };
}

const targetRow: RevokeTargetEntitlement = { entitlementId: 'ent-1', platformUserId: 'pu-target', workspaceId: 'ws', accessLevelName: 'Full', active: true };

function liveInput(over: Partial<AdminEntitlementRevokeInput> = {}): AdminEntitlementRevokeInput {
  return {
    mode: 'live',
    actor: { platformUserId: 'pu-admin', upn: 'admin@ogb', isSuperAdmin: true },
    targetEntitlementId: 'ent-1',
    reason: 'offboarding',
    correlationId: 'corr-1',
    config: { revokeEnabled: true, singleRecordSmokeEnabled: true },
    transport: okTransport(),
    auditSink: okAudit(),
    matchingActiveEntitlements: [targetRow],
    actorActiveAdminEntitlements: [{ entitlementId: 'ent-admin-a' }, { entitlementId: 'ent-admin-b' }],
    ...over,
  };
}

describe('default-off', () => {
  it('build-time flag is false', () => {
    expect(ADMIN_ENTITLEMENT_REVOKE_ENABLED).toBe(false);
  });
});

describe('authorized deactivate', () => {
  it('deactivates exactly one entitlement (never deletes) and audits', async () => {
    const transport = okTransport();
    const auditSink = okAudit();
    const r = await revokeAppEntitlement(liveInput({ transport, auditSink }));
    expect(r.outcome).toBe('deactivated');
    expect(transport.deactivateEntitlement).toHaveBeenCalledTimes(1);
    expect(transport.deactivateEntitlement).toHaveBeenCalledWith('ent-1');
    expect(auditSink.write).toHaveBeenCalledTimes(1);
    expect(r.audit.newValue).toEqual({ active: false });
    expect(r.audit.reason).toBe('offboarding');
  });
});

describe('fails closed', () => {
  it('unauthorized is blocked', async () => {
    const t = okTransport();
    const r = await revokeAppEntitlement(liveInput({ actor: { platformUserId: 'p', upn: 'u', isSuperAdmin: false }, transport: t }));
    expect(r.outcome).toBe('blocked_gate_not_satisfied');
    expect(t.deactivateEntitlement).not.toHaveBeenCalled();
  });
  it('flag off / smoke off is blocked', async () => {
    expect((await revokeAppEntitlement(liveInput({ config: { revokeEnabled: false, singleRecordSmokeEnabled: true } }))).outcome).toBe('blocked_gate_not_satisfied');
    expect((await revokeAppEntitlement(liveInput({ config: { revokeEnabled: true, singleRecordSmokeEnabled: false } }))).outcome).toBe('blocked_gate_not_satisfied');
  });
  it('missing reason is skipped (reason required)', async () => {
    const r = await revokeAppEntitlement(liveInput({ reason: '' }));
    expect(r.outcome).toBe('skipped_missing_required_data');
    expect(r.audit.error).toMatch(/reason/);
  });
});

describe('target resolution fails closed', () => {
  it('no matching active row → target_not_found', async () => {
    const r = await revokeAppEntitlement(liveInput({ matchingActiveEntitlements: [] }));
    expect(r.outcome).toBe('target_not_found');
  });
  it('more than one match → ambiguous_target', async () => {
    const r = await revokeAppEntitlement(liveInput({ matchingActiveEntitlements: [targetRow, { ...targetRow }] }));
    expect(r.outcome).toBe('ambiguous_target');
  });
});

describe('last-admin self-revoke guard', () => {
  const selfAdminRow: RevokeTargetEntitlement = { entitlementId: 'ent-self', platformUserId: 'pu-admin', workspaceId: 'ws-admin', accessLevelName: 'Admin', active: true };

  it('refuses to revoke the actor’s last active Admin entitlement', async () => {
    const r = await revokeAppEntitlement(liveInput({
      targetEntitlementId: 'ent-self',
      matchingActiveEntitlements: [selfAdminRow],
      actorActiveAdminEntitlements: [{ entitlementId: 'ent-self' }],
    }));
    expect(r.outcome).toBe('last_admin_protected');
  });

  it('allows it only with an explicit emergency override (audited)', async () => {
    const r = await revokeAppEntitlement(liveInput({
      targetEntitlementId: 'ent-self',
      matchingActiveEntitlements: [selfAdminRow],
      actorActiveAdminEntitlements: [{ entitlementId: 'ent-self' }],
      config: { revokeEnabled: true, singleRecordSmokeEnabled: true, emergencyOverrideEnabled: true },
    }));
    expect(r.outcome).toBe('deactivated');
    expect(r.emergencyOverrideUsed).toBe(true);
    expect(r.audit.emergencyOverrideUsed).toBe(true);
  });

  it('does not trigger when the actor still has another active Admin entitlement', async () => {
    const r = await revokeAppEntitlement(liveInput({
      targetEntitlementId: 'ent-self',
      matchingActiveEntitlements: [selfAdminRow],
      actorActiveAdminEntitlements: [{ entitlementId: 'ent-self' }, { entitlementId: 'ent-other-admin' }],
    }));
    expect(r.outcome).toBe('deactivated');
  });
});

describe('service + audit failures', () => {
  it('transport failure → failed_dataverse', async () => {
    const transport: EntitlementRevokeTransport = { deactivateEntitlement: vi.fn(async () => ({ ok: false, error: 'dv_down' })) };
    const r = await revokeAppEntitlement(liveInput({ transport }));
    expect(r.outcome).toBe('failed_dataverse');
  });
  it('audit failure after deactivate → audit_failed_partial_success', async () => {
    const auditSink: EntitlementRevokeAuditSink = { write: vi.fn(async () => ({ ok: false, error: 'audit_down' })) };
    const r = await revokeAppEntitlement(liveInput({ auditSink }));
    expect(r.outcome).toBe('audit_failed_partial_success');
  });
});

describe('dry-run', () => {
  it('previews without deactivating', async () => {
    const transport = okTransport();
    const r = await revokeAppEntitlement(liveInput({ mode: 'dry-run', transport }));
    expect(r.outcome).toBe('dry_run_only');
    expect(transport.deactivateEntitlement).not.toHaveBeenCalled();
  });
});

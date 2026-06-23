import { describe, it, expect } from 'vitest';
import {
  deriveAdminEntitlementActivation,
  createDataverseEntitlementGrantTransport,
  createDataverseEntitlementRevokeTransport,
  ADMIN_ENTITLEMENT_SCOPE_NOTICE,
  type AdminEntitlementActivationInput,
} from './adminEntitlementActivation';
import type { OperatorSmokeEvidence, SmokeEvidenceRegistryInput } from '../access/operatorSmokeEvidenceRegistry';

function evidence(records: OperatorSmokeEvidence[] = []): SmokeEvidenceRegistryInput {
  return { source: 'out-of-band', records };
}
function passed(capability: OperatorSmokeEvidence['capability']): OperatorSmokeEvidence {
  return {
    capability,
    outcome: 'passed',
    actorUpn: 'super@oldglorybank.com',
    actorPlatformUserId: 'pu-super',
    timestamp: '2026-06-23T12:00:00.000Z',
    correlationId: 'corr-1',
    environmentName: 'OGB-DEV',
    evidenceNote: 'controlled single-record smoke',
    rollbackVerified: true,
  };
}
function base(over: Partial<AdminEntitlementActivationInput> = {}): AdminEntitlementActivationInput {
  return {
    singleRecordSmokeEnabled: false,
    actorIsSuperAdmin: false,
    grantTransportWired: false,
    grantAuditWired: false,
    revokeTransportWired: false,
    revokeAuditWired: false,
    evidence: evidence(),
    ...over,
  };
}

describe('Phase 212 — admin entitlement activation readiness', () => {
  it('is blocked by default (flags off, no smoke, not super admin, nothing wired)', () => {
    const r = deriveAdminEntitlementActivation(base());
    expect(r.grant.level).toBe('blocked');
    expect(r.revoke.level).toBe('blocked');
    expect(r.grant.blockers).toEqual(expect.arrayContaining(['ADMIN_ENTITLEMENT_WRITE_ENABLED']));
    expect(r.revoke.blockers).toEqual(expect.arrayContaining(['ADMIN_ENTITLEMENT_REVOKE_ENABLED']));
  });

  it('grant becomes launch-ready only when every gate + passed/rolled-back smoke is satisfied', () => {
    const r = deriveAdminEntitlementActivation(
      base({
        grantWriteEnabled: true,
        singleRecordSmokeEnabled: true,
        actorIsSuperAdmin: true,
        grantTransportWired: true,
        grantAuditWired: true,
        evidence: evidence([passed('admin-entitlement-grant')]),
      }),
    );
    expect(r.grant.level).toBe('launch-ready');
    expect(r.grant.blockers).toEqual([]);
    // revoke still blocked — its own gates are unmet
    expect(r.revoke.level).toBe('blocked');
  });

  it('a missing/failed smoke keeps grant blocked even with all flags wired', () => {
    const r = deriveAdminEntitlementActivation(
      base({
        grantWriteEnabled: true,
        singleRecordSmokeEnabled: true,
        actorIsSuperAdmin: true,
        grantTransportWired: true,
        grantAuditWired: true,
        evidence: evidence([]), // no smoke
      }),
    );
    expect(r.grant.level).toBe('blocked');
    expect(r.grant.blockers.join(' ')).toMatch(/smoke/i);
  });

  it('exposes the LOS app-level-only scope notice (no tenant/Entra/security-role claim)', () => {
    expect(ADMIN_ENTITLEMENT_SCOPE_NOTICE).toMatch(/LOS app-level/i);
    expect(ADMIN_ENTITLEMENT_SCOPE_NOTICE).toMatch(/Microsoft tenant access.*Dataverse security roles|Dataverse security roles/i);
  });

  it('the Dataverse transports are seams (constructing them performs no write)', () => {
    // Constructing returns an object with the seam method; nothing is invoked here.
    expect(typeof createDataverseEntitlementGrantTransport().createEntitlement).toBe('function');
    expect(typeof createDataverseEntitlementRevokeTransport().deactivateEntitlement).toBe('function');
  });
});

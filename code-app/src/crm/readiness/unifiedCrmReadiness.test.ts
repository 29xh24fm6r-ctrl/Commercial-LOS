import { describe, expect, it } from 'vitest';
import {
  deriveUnifiedCrmReadiness,
  CRM_TEAM_READINESS_LEDGER,
  CRM_REQUIRED_MOUNT_ROLES,
  type CrmDeliveryLedger,
} from './unifiedCrmReadiness';

/** A ledger with every delivery field satisfied (used to isolate other blockers). */
const FULLY_DELIVERED_LEDGER: CrmDeliveryLedger = {
  commandCenterRouted: true,
  rolesMounted: { banker: true, team: true, manager: true, admin: true },
  canonicalSeedReady: true,
  newDealLinkageOperational: true,
  liveCreateWired: true,
  inlineEditWired: true,
};

describe('CRM-B — unified CRM readiness model', () => {
  it('reports exactly the ten readiness dimensions', () => {
    const r = deriveUnifiedCrmReadiness();
    expect(r.totalCount).toBe(10);
    expect(r.dimensions.map((d) => d.key).sort()).toEqual(
      [
        'actor-authorization',
        'certification-attribution',
        'editing-writeback',
        'flag-gated-spine',
        'live-hub',
        'route-mount',
        'runtime-hydration',
        'schema-full-contract',
        'seed-linkage',
        'team-scope',
      ].sort(),
    );
  });

  it('proves the full schema contract 10 / 147 / 28 / 0 and runtime hydration from committed evidence', () => {
    const r = deriveUnifiedCrmReadiness();
    const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d]));
    expect(byKey['schema-full-contract'].status).toBe('ready');
    expect(byKey['runtime-hydration'].status).toBe('ready');
    // The live hub, actor authorization, and flag-gated-spine reconciliation are ready today.
    expect(byKey['live-hub'].status).toBe('ready');
    expect(byKey['actor-authorization'].status).toBe('ready');
    expect(byKey['flag-gated-spine'].status).toBe('ready');
  });

  it('is NOT team-ready at the current baseline (seed/linkage, editing, team-scope, attribution gaps remain)', () => {
    const r = deriveUnifiedCrmReadiness();
    expect(r.teamReady).toBe(false);
    const blockedKeys = r.dimensions.filter((d) => d.status === 'blocked').map((d) => d.key);
    // CRM-C routed the Command Center, so route-mount is ready; the rest remain gaps.
    expect(blockedKeys).toEqual(
      expect.arrayContaining([
        'seed-linkage',
        'editing-writeback',
        'team-scope',
        'certification-attribution',
      ]),
    );
    expect(blockedKeys).not.toContain('route-mount');
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('NEVER marks team-ready while the certification operator is unattributable', () => {
    // Everything delivered EXCEPT attribution → still blocked on attribution only.
    const r = deriveUnifiedCrmReadiness({
      ledger: FULLY_DELIVERED_LEDGER,
      certificationAttributionHigh: false,
    });
    expect(r.teamReady).toBe(false);
    const attribution = r.dimensions.find((d) => d.key === 'certification-attribution');
    expect(attribution?.status).toBe('blocked');
  });

  it('NEVER marks team-ready while canonical seed/linkage gaps remain', () => {
    const r = deriveUnifiedCrmReadiness({
      ledger: { ...FULLY_DELIVERED_LEDGER, canonicalSeedReady: false },
      certificationAttributionHigh: true,
    });
    expect(r.teamReady).toBe(false);
    expect(r.dimensions.find((d) => d.key === 'seed-linkage')?.status).toBe('blocked');
  });

  it('team-scope requires every required role mounted, not just banker', () => {
    const bankerOnly = deriveUnifiedCrmReadiness({
      ledger: { ...FULLY_DELIVERED_LEDGER, rolesMounted: { banker: true, team: false, manager: false, admin: false } },
      certificationAttributionHigh: true,
    });
    expect(bankerOnly.dimensions.find((d) => d.key === 'team-scope')?.status).toBe('blocked');
    expect(CRM_REQUIRED_MOUNT_ROLES).toEqual(['banker', 'team', 'manager', 'admin']);
  });

  it('becomes team-ready ONLY when every dimension is satisfied together', () => {
    const r = deriveUnifiedCrmReadiness({
      ledger: FULLY_DELIVERED_LEDGER,
      certificationAttributionHigh: true,
    });
    expect(r.teamReady).toBe(true);
    expect(r.readyCount).toBe(10);
    expect(r.blockers).toHaveLength(0);
  });

  it('the committed baseline ledger reflects delivery reality (banker-only, no seed/linkage/edit; route done in CRM-C)', () => {
    expect(CRM_TEAM_READINESS_LEDGER.commandCenterRouted).toBe(true); // CRM-C
    expect(CRM_TEAM_READINESS_LEDGER.rolesMounted).toEqual({ banker: true, team: false, manager: false, admin: false });
    expect(CRM_TEAM_READINESS_LEDGER.canonicalSeedReady).toBe(false);
    expect(CRM_TEAM_READINESS_LEDGER.newDealLinkageOperational).toBe(false);
    expect(CRM_TEAM_READINESS_LEDGER.liveCreateWired).toBe(true);
    expect(CRM_TEAM_READINESS_LEDGER.inlineEditWired).toBe(false);
  });
});

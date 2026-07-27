import { describe, it, expect } from 'vitest';
import { createEmptyCrmMaster } from './crmTypes';
import { deriveCrmRelationshipNetworkSnapshot } from './deriveCrmRelationshipNetworkSnapshot';

/**
 * Factory mission PR A regression coverage: before this fix, totalOrganizations (the "N org(s)"
 * headline stat on CrmRelationshipNetworkPanel) counted master.organizations.length unconditionally
 * -- the one CRM count surface this repo's audit history found with zero active-state filtering,
 * unlike every deal-count surface (which consistently excludes inactive/test records via
 * ACTIVE_DEAL_ODATA_PREDICATE / isTestOrSmokeDeal).
 */
describe('deriveCrmRelationshipNetworkSnapshot — active-only organization counting', () => {
  it('excludes inactive and archived organizations from totalOrganizations, orgRollups, and nodes', () => {
    const master = {
      ...createEmptyCrmMaster(),
      organizations: [
        { orgId: 'org-active', legalName: 'Acme Holdings', orgType: 'customer' as const, status: 'active' as const },
        { orgId: 'org-inactive', legalName: 'Old Co', orgType: 'customer' as const, status: 'inactive' as const },
        { orgId: 'org-archived', legalName: 'Ancient Co', orgType: 'customer' as const, status: 'archived' as const },
      ],
    };

    const snapshot = deriveCrmRelationshipNetworkSnapshot(master);

    expect(snapshot.totalOrganizations).toBe(1);
    expect(snapshot.orgRollups.map((r) => r.orgId)).toEqual(['org-active']);
    expect(snapshot.nodes.filter((n) => n.entityType === 'organization').map((n) => n.entityId)).toEqual([
      'org-active',
    ]);
  });

  it('an entirely inactive organization set reports zero, not a fabricated count', () => {
    const master = {
      ...createEmptyCrmMaster(),
      organizations: [
        { orgId: 'org-1', legalName: 'Old Co', orgType: 'customer' as const, status: 'inactive' as const },
      ],
    };
    const snapshot = deriveCrmRelationshipNetworkSnapshot(master);
    expect(snapshot.totalOrganizations).toBe(0);
    expect(snapshot.orgRollups).toEqual([]);
  });
});

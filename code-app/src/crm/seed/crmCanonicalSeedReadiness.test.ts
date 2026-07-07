import { describe, it, expect } from 'vitest';
import {
  deriveCrmCanonicalSeedReadiness,
  crmSeededLoadedEntities,
  CURRENT_CRM_CANONICAL_SEED_FACTS,
  CRM_CANONICAL_BACKFILL_PLAN,
  type CrmCanonicalSeedFacts,
} from './crmCanonicalSeedReadiness';
import { deriveCrmSalesforceSpineLaunchReadiness } from '../crmSalesforceSpineLaunchReadiness';
import type { CrmRelationshipGraphInput } from '../crmRelationshipViewModel';
import { CRM_TEAM_READINESS_LEDGER } from '../readiness/unifiedCrmReadiness';

const GRAPH: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Deal 1' },
  client: { id: 'client-1', name: 'Client 1' },
  assignedBanker: { id: 'banker-1', name: 'Banker 1' },
  team: { id: 'team-1', name: 'Team 1' },
};

describe('CRM-E — canonical CRM seed / backfill readiness', () => {
  it('the committed default is honest: no records seeded, but exception-free and backfill-ready', () => {
    const r = deriveCrmCanonicalSeedReadiness();
    expect(r.seededRecordsPresent).toBe(false);
    expect(Object.values(r.sectionsSeeded).every((v) => v === false)).toBe(true);
    expect(r.exceptions).toEqual([]);
    expect(r.exceptionFree).toBe(true);
    expect(r.backfillPathReady).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.loadedEntities).toEqual({});
    expect(CRM_CANONICAL_BACKFILL_PLAN.length).toBeGreaterThan(0);
  });

  it('reports unresolved-link EXCEPTIONS when a deal names a client with no canonical org (never fabricates)', () => {
    const facts: CrmCanonicalSeedFacts = {
      counts: { organizations: 0, persons: 0, relationships: 0, roles: 0, activities: 0 },
      dealClientLinks: [
        { dealId: 'deal-1', clientName: 'Acme Holdings', resolvedOrganizationId: null },
        { dealId: 'deal-2', clientName: 'Beta Corp', resolvedOrganizationId: 'org-42' },
        { dealId: 'deal-3', clientName: null, resolvedOrganizationId: null },
      ],
    };
    const r = deriveCrmCanonicalSeedReadiness(facts);
    expect(r.exceptions.map((e) => e.dealId)).toEqual(['deal-1']); // deal-2 resolved; deal-3 has no client
    expect(r.exceptionFree).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('is data-driven "seeded": real record counts flip sections to seeded and project loaded entities', () => {
    const facts: CrmCanonicalSeedFacts = {
      counts: { organizations: 3, persons: 5, relationships: 4, roles: 2, activities: 7 },
      dealClientLinks: [{ dealId: 'deal-1', clientName: 'Client 1', resolvedOrganizationId: 'org-1' }],
    };
    const r = deriveCrmCanonicalSeedReadiness(facts);
    expect(r.seededRecordsPresent).toBe(true);
    expect(r.sectionsSeeded).toEqual({ organizations: true, persons: true, relationships: true, roles: true, activities: true });
    expect(r.loadedEntities).toMatchObject({ account: true, contact: true, relationshipRole: true, activity: true });
    expect(r.exceptionFree).toBe(true);
  });

  it('the deal CRM context stops saying "not seeded" once real records exist', () => {
    // Default (no records): contacts/roles are NOT renderable (schema/seed-gated).
    const before = deriveCrmSalesforceSpineLaunchReadiness({ graph: GRAPH });
    expect(before.renderableNow).not.toContain('contact');
    expect(before.renderableNow).not.toContain('relationshipRole');

    // With measured records, feeding the projected loaded entities flips them to renderable.
    const facts: CrmCanonicalSeedFacts = {
      counts: { organizations: 2, persons: 3, relationships: 2, roles: 1, activities: 4 },
      dealClientLinks: [],
    };
    const after = deriveCrmSalesforceSpineLaunchReadiness({
      graph: GRAPH,
      loadedEntities: crmSeededLoadedEntities(facts),
    });
    expect(after.renderableNow).toContain('contact');
    expect(after.renderableNow).toContain('relationshipRole');
    expect(after.renderableNow).toContain('activity');
  });

  it('the delivery ledger canonicalSeedReady matches the seed model ready verdict', () => {
    expect(CRM_TEAM_READINESS_LEDGER.canonicalSeedReady).toBe(
      deriveCrmCanonicalSeedReadiness(CURRENT_CRM_CANONICAL_SEED_FACTS).ready,
    );
  });
});

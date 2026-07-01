import { describe, it, expect } from 'vitest';
import {
  deriveCrmSalesforceSpineLaunchReadiness,
  type CrmSpineLaunchReadinessInput,
  type CrmSpineReadinessState,
} from './crmSalesforceSpineLaunchReadiness';
import type { CrmRelationshipGraphInput } from './crmRelationshipViewModel';
import type { CrmSpineEntityKey } from './crmSalesforceSpineModel';

/**
 * Phase 189J — Salesforce CRM spine LAUNCH READINESS behavior.
 *
 * Proves what is renderable now vs provisional vs seed/schema/migration/auth-
 * gated vs blocked — and that nothing is fabricated.
 */

const fullGraph: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  client: { id: 'client-guid', name: 'Acme Holdings LLC', lookupClassification: 'real-lookup' },
  team: { id: 'team-guid', name: 'Commercial East', lookupClassification: 'real-lookup' },
  assignedBanker: { id: 'banker-guid', name: 'Dana Banker', lookupClassification: 'real-lookup' },
};

const derive = (input: CrmSpineLaunchReadinessInput) =>
  deriveCrmSalesforceSpineLaunchReadiness(input);

const stateOf = (
  r: ReturnType<typeof derive>,
  key: CrmSpineEntityKey,
): CrmSpineReadinessState => {
  const found = r.entityReadiness.find((e) => e.entity === key);
  if (!found) throw new Error(`no readiness for ${key}`);
  return found.state;
};

describe('default foundation (authorized deal+client+banker+team, spine not seeded)', () => {
  const r = derive({ graph: fullGraph });

  it('is a provisional foundation, read-only, with the spine not seeded', () => {
    expect(r.launchStatus).toBe('provisional-foundation');
    expect(r.readOnly).toBe(true);
    expect(r.spineSeeded).toBe(false);
    expect(r.schemaMutated).toBe(false);
    expect(r.migrationExecuted).toBe(false);
    // CRM_LIVE_PERSISTENCE_ENABLED is at its safe default (off) in crmFeatureFlags.ts;
    // the spine is still not seeded — live persistence and spine seeding are separate concerns.
    expect(r.liveCrmPersistenceEnabled).toBe(false);
  });

  it('renders provenance, visibility policy, and coverage team now', () => {
    expect(stateOf(r, 'sourceFact')).toBe('renderable');
    expect(stateOf(r, 'visibilityRequirement')).toBe('renderable');
    expect(stateOf(r, 'coverageTeamMember')).toBe('renderable');
  });

  it('offers the client stub as a PROVISIONAL account only', () => {
    expect(stateOf(r, 'account')).toBe('provisional');
    expect(r.provisionalAccount).not.toBeNull();
    expect(r.provisionalAccount!.isProvisional).toBe(true);
    expect(r.provisionalAccount!.legalName).toBeNull();
    expect(stateOf(r, 'dealRelationship')).toBe('provisional');
    expect(stateOf(r, 'relationshipHealth')).toBe('provisional');
    expect(r.relationshipHealth!.isProvisional).toBe(true);
  });

  it('keeps contacts / roles / activities / tasks non-renderable (schema-gated) until seeded or loaded', () => {
    for (const key of ['contact', 'accountContactRelationship', 'relationshipRole', 'activity', 'task'] as const) {
      const s = stateOf(r, key);
      expect(s).not.toBe('renderable');
      expect(s).not.toBe('provisional');
      expect(['seed-required', 'schema-required', 'blocked']).toContain(s);
    }
  });

  it('derives the coverage team only from the authorized banker/team facts', () => {
    expect(r.coverageTeam.map((m) => m.memberType).sort()).toEqual(['banker', 'team']);
    for (const m of r.coverageTeam) {
      expect(m.origin).toBe('authorized-fact');
    }
  });

  it('fabricates no record collections', () => {
    for (const forbidden of ['contacts', 'accounts', 'roles', 'activities', 'tasks', 'timeline']) {
      expect(r).not.toHaveProperty(forbidden);
    }
    const rejected = r.rejectedFabrications.map((x) => x.entity);
    for (const e of ['account', 'contact', 'relationshipRole', 'activity', 'task', 'timeline']) {
      expect(rejected).toContain(e);
    }
  });
});

describe('contacts/activities/roles become seed-required (still not renderable) when their table is present', () => {
  const r = derive({
    graph: { ...fullGraph, spineTablePresence: { person: true, relationship: true, roleAssignment: true, timelineEvent: true } },
  });
  it('flips schema-required → seed-required, never renderable, with no records', () => {
    for (const key of ['contact', 'accountContactRelationship', 'relationshipRole', 'activity'] as const) {
      expect(stateOf(r, key)).toBe('seed-required');
    }
    expect(r).not.toHaveProperty('contacts');
  });
});

describe('contacts/activities/roles become renderable ONLY once authorized-loaded', () => {
  const r = derive({
    graph: { ...fullGraph, spineTablePresence: { person: true } },
    loadedEntities: { contact: true },
  });
  it('a loaded contact set is renderable; an unloaded role set is not', () => {
    expect(stateOf(r, 'contact')).toBe('renderable');
    expect(stateOf(r, 'relationshipRole')).not.toBe('renderable');
  });
});

describe('account migration vs provisional', () => {
  it('is migration-required once the organization table exists but the stub is not migrated', () => {
    const r = derive({ graph: { ...fullGraph, spineTablePresence: { organization: true } } });
    expect(stateOf(r, 'account')).toBe('migration-required');
    expect(r.migrationRequired).toContain('account');
  });
});

describe('coverage team requires authorized facts', () => {
  it('is authorization-required and empty when no banker/team facts are present', () => {
    const r = derive({ graph: { deal: fullGraph.deal, client: fullGraph.client } });
    expect(stateOf(r, 'coverageTeamMember')).toBe('authorization-required');
    expect(r.coverageTeam).toEqual([]);
  });
});

describe('blocked when there is no anchor', () => {
  it('blocks the account/contact and the whole launch when neither deal nor client exists', () => {
    const r = derive({ graph: { deal: null, client: null } });
    expect(r.launchStatus).toBe('blocked');
    expect(stateOf(r, 'account')).toBe('blocked');
    expect(stateOf(r, 'contact')).toBe('blocked');
    expect(r.provisionalAccount).toBeNull();
  });
});

describe('readiness output distinguishes all seven states', () => {
  it('every state is reachable across foundation scenarios', () => {
    const observed = new Set<CrmSpineReadinessState>();
    const scenarios: CrmSpineLaunchReadinessInput[] = [
      { graph: fullGraph }, // renderable, provisional, schema-required
      { graph: { ...fullGraph, spineTablePresence: { person: true } } }, // seed-required
      { graph: { ...fullGraph, spineTablePresence: { organization: true } } }, // migration-required
      { graph: { deal: fullGraph.deal, client: fullGraph.client } }, // authorization-required
      { graph: { deal: null, client: null } }, // blocked
    ];
    for (const s of scenarios) {
      for (const e of derive(s).entityReadiness) observed.add(e.state);
    }
    for (const state of [
      'renderable',
      'provisional',
      'seed-required',
      'blocked',
      'authorization-required',
      'schema-required',
      'migration-required',
    ] as const) {
      expect(observed.has(state)).toBe(true);
    }
  });
});

describe('next actions defer schema/migration/seed and the live-persistence flip', () => {
  it('always ends by deferring the CRM_LIVE_PERSISTENCE_ENABLED flip', () => {
    const r = derive({ graph: fullGraph });
    const last = r.nextActions[r.nextActions.length - 1];
    expect(last.kind).toBe('defer_live_persistence');
    expect(r.nextActions.some((a) => a.kind === 'create_schema')).toBe(true);
  });
});

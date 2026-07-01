import { describe, it, expect } from 'vitest';
import {
  deriveCrmRelationshipViewModel,
  type CrmRelationshipGraphInput,
} from './crmRelationshipViewModel';

/**
 * Phase 189B — CRM Relationship view-model behavior.
 *
 * The view-model is a pure projection of the live relationship graph proved in
 * Phase 189A (Deal → Client/Team/AssignedTo, Banker → Team, PlatformUser →
 * CoreUser/Workspace). It must be honest: never fabricate the future
 * Salesforce-style spine, and prefer rendering the existing borrower/client
 * graph before seeding that spine.
 */

const fullGraph: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  client: {
    id: 'client-1',
    name: 'Acme Holdings LLC',
    borrowerType: 'Business',
    lookupClassification: 'real-lookup',
  },
  team: { id: 'team-1', name: 'Commercial East', lookupClassification: 'real-lookup' },
  assignedBanker: {
    id: 'banker-1',
    name: 'Dana Banker',
    email: 'dana@bank.example',
    teamId: 'team-1',
    lookupClassification: 'real-lookup',
  },
  platformUser: {
    id: 'pu-1',
    name: 'Dana Banker',
    coreUserId: 'core-1',
    primaryWorkspaceId: 'ws-1',
    primaryWorkspaceName: 'Commercial East Workspace',
  },
};

describe('complete current live graph', () => {
  it('produces a ready status for a fully-linked real-lookup graph', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    expect(vm.relationshipStatus).toBe('ready');
    expect(vm.missingRelationshipEdges).toHaveLength(0);
    expect(vm.unsafePseudoLookupWarnings).toHaveLength(0);
    expect(vm.dealRelationshipSummary.presentEdgeCount).toBeGreaterThanOrEqual(3);
  });

  it('labels the canonical client as a borrower/client stub, not a Salesforce spine', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    expect(vm.canonicalClient).not.toBeNull();
    expect(vm.canonicalClient?.kind).toBe('borrower_client_stub');
    expect(vm.canonicalClient?.logicalName).toBe('cr664_clientrelationship');
    expect(vm.canonicalClient?.note).toMatch(/NOT a Salesforce/i);
  });

  it('cross-checks banker team against deal team', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    expect(vm.assignedBanker?.teamMatchesDeal).toBe(true);
    const mismatch = deriveCrmRelationshipViewModel({
      ...fullGraph,
      assignedBanker: { ...fullGraph.assignedBanker!, teamId: 'other-team' },
    });
    expect(mismatch.assignedBanker?.teamMatchesDeal).toBe(false);
  });

  it('surfaces platform-user context when available', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    expect(vm.platformUserContext?.primaryWorkspaceId).toBe('ws-1');
    const withoutPU = deriveCrmRelationshipViewModel({ ...fullGraph, platformUser: null });
    expect(withoutPU.platformUserContext).toBeNull();
  });
});

describe('missing client', () => {
  it('is blocked when no canonical client is reachable', () => {
    const vm = deriveCrmRelationshipViewModel({ ...fullGraph, client: null });
    expect(vm.relationshipStatus).toBe('blocked');
    expect(vm.canonicalClient).toBeNull();
    const blockingEdge = vm.missingRelationshipEdges.find((m) => m.edge === 'Deal → Client');
    expect(blockingEdge?.severity).toBe('blocking');
  });

  it('is blocked when the deal anchor itself is missing', () => {
    const vm = deriveCrmRelationshipViewModel({ ...fullGraph, deal: null });
    expect(vm.relationshipStatus).toBe('blocked');
    expect(vm.dealRelationshipSummary.dealId).toBeNull();
  });
});

describe('missing team / banker', () => {
  it('is partial with an explicit degraded missing edge when team is unset', () => {
    const vm = deriveCrmRelationshipViewModel({ ...fullGraph, team: null });
    expect(vm.relationshipStatus).toBe('partial');
    const edge = vm.missingRelationshipEdges.find((m) => m.edge === 'Deal → Team');
    expect(edge).toBeDefined();
    expect(edge?.severity).toBe('degraded');
    expect(edge?.target).toBe('cr664_team');
  });

  it('is partial with an explicit degraded missing edge when banker is unset', () => {
    const vm = deriveCrmRelationshipViewModel({ ...fullGraph, assignedBanker: null });
    expect(vm.relationshipStatus).toBe('partial');
    const edge = vm.missingRelationshipEdges.find((m) => m.edge === 'Deal → Assigned banker');
    expect(edge?.severity).toBe('degraded');
    // Still renderable — the client graph exists.
    expect(vm.canonicalClient).not.toBeNull();
  });
});

describe('pseudo lookup safety', () => {
  it('surfaces a pseudo-lookup warning and degrades to partial (never ready)', () => {
    const vm = deriveCrmRelationshipViewModel({
      ...fullGraph,
      client: { ...fullGraph.client!, lookupClassification: 'pseudo-scalar' },
    });
    expect(vm.unsafePseudoLookupWarnings.length).toBeGreaterThan(0);
    expect(vm.unsafePseudoLookupWarnings[0].edge).toBe('Deal → Client');
    expect(vm.unsafePseudoLookupWarnings[0].logicalColumn).toBe('cr664_client');
    expect(vm.relationshipStatus).not.toBe('ready');
  });
});

describe('future Salesforce-style spine is never fabricated', () => {
  it('reports the spine as not seeded / not wired with no fake entities', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    expect(vm.futureSpine.seeded).toBe(false);
    expect(vm.futureSpine.wired).toBe(false);
    // CRM_LIVE_PERSISTENCE_ENABLED is at its safe default (off) in crmFeatureFlags.ts;
    // the spine is still neither seeded nor wired — these are separate concerns.
    expect(vm.futureSpine.liveSpinePersistenceEnabled).toBe(false);
    // All ten modeled tables present as not_seeded by default.
    expect(vm.futureSpine.tables).toHaveLength(10);
    for (const t of vm.futureSpine.tables) {
      expect(t.status).toBe('not_seeded');
      expect(t.present).toBe(false);
    }
    // No top-level fields invent contacts / orgs / roles / activities.
    const keys = Object.keys(vm);
    expect(keys).not.toContain('contacts');
    expect(keys).not.toContain('organizations');
    expect(keys).not.toContain('roles');
    expect(keys).not.toContain('activities');
    expect(keys).not.toContain('timelineEvents');
  });

  it('marks a table present_not_wired when a schema gate reports it exists, still unseeded by this phase', () => {
    const vm = deriveCrmRelationshipViewModel({
      ...fullGraph,
      spineTablePresence: { organization: true },
    });
    const org = vm.futureSpine.tables.find((t) => t.key === 'organization');
    expect(org?.present).toBe(true);
    expect(org?.status).toBe('present_not_wired');
    // Even when a table exists, the view-model neither seeds nor wires it.
    expect(vm.futureSpine.seeded).toBe(false);
    expect(vm.futureSpine.wired).toBe(false);
  });
});

describe('recommended next actions: render existing before seeding spine', () => {
  it('prefers rendering the existing graph before seeding the full spine', () => {
    const vm = deriveCrmRelationshipViewModel(fullGraph);
    const renderIdx = vm.recommendedNextActions.findIndex(
      (a) => a.kind === 'render_existing_graph',
    );
    const seedIdx = vm.recommendedNextActions.findIndex(
      (a) => a.kind === 'seed_full_spine_later',
    );
    expect(renderIdx).toBeGreaterThanOrEqual(0);
    expect(seedIdx).toBeGreaterThan(renderIdx);
    // The render action is the highest priority.
    expect(vm.recommendedNextActions[0].kind).toBe('render_existing_graph');
    // Seeding is always last.
    expect(vm.recommendedNextActions[vm.recommendedNextActions.length - 1].kind).toBe(
      'seed_full_spine_later',
    );
  });

  it('when blocked, prioritizes linking the client over rendering or seeding', () => {
    const vm = deriveCrmRelationshipViewModel({ ...fullGraph, client: null });
    expect(vm.recommendedNextActions[0].kind).toBe('resolve_missing_edge');
    expect(vm.recommendedNextActions.some((a) => a.kind === 'render_existing_graph')).toBe(false);
    // Seeding still appears, still last.
    expect(vm.recommendedNextActions[vm.recommendedNextActions.length - 1].kind).toBe(
      'seed_full_spine_later',
    );
  });
});

describe('safety posture is constant', () => {
  it('always reports read-only, no live write, no external change, no seed', () => {
    for (const input of [fullGraph, { ...fullGraph, client: null }, { deal: null, client: null }]) {
      const vm = deriveCrmRelationshipViewModel(input);
      expect(vm.readOnly).toBe(true);
      expect(vm.liveWritePerformed).toBe(false);
      expect(vm.externalSystemChanged).toBe(false);
      expect(vm.spineSeeded).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { deriveCrmRelationshipDetailReadiness } from './crmRelationshipDetailReadiness';
import { buildCrmRelationshipInput } from './buildCrmRelationshipInput';
import type { CrmRelationshipGraphInput } from './crmRelationshipViewModel';

/**
 * Phase 189E — CRM relationship DETAIL readiness behavior.
 *
 * Proves which detail surfaces are safe to render from the 189D-enriched
 * authorized graph, and that nothing is fabricated.
 */

const realGraph: CrmRelationshipGraphInput = {
  deal: { id: 'deal-1', name: 'Acme Term Loan' },
  client: { id: 'client-guid', name: 'Acme Holdings LLC', lookupClassification: 'real-lookup' },
  team: { id: 'team-guid', name: 'Commercial East', lookupClassification: 'real-lookup' },
  assignedBanker: { id: 'banker-guid', name: 'Dana Banker', lookupClassification: 'real-lookup' },
};

describe('real client/team/banker IDs', () => {
  it('produce a ready status with safe client/team/banker detail sections', () => {
    const r = deriveCrmRelationshipDetailReadiness(realGraph);
    expect(r.readinessStatus).toBe('ready');
    expect(r.safeDetailSections).toEqual(
      expect.arrayContaining(['clientIdentity', 'teamOwnership', 'assignedBanker']),
    );
  });

  it('partial when the client is real but the banker edge is unverified (context-only id)', () => {
    const r = deriveCrmRelationshipDetailReadiness({
      ...realGraph,
      assignedBanker: { id: 'banker-ctx', name: 'Ctx Banker', lookupClassification: 'unknown' },
    });
    expect(r.readinessStatus).toBe('partial');
    expect(r.safeDetailSections).toContain('clientIdentity');
    // An unverified banker degrades — it is NOT a hard blocker.
    expect(r.degradedDetailSections.map((b) => b.section)).toContain('assignedBanker');
    expect(r.blockedDetailSections.map((b) => b.section)).not.toContain('assignedBanker');
  });
});

describe('name-only client surrogate', () => {
  it('blocks client record detail but does not block the whole audit', () => {
    // The 189C/D builder produces a `name:`-prefixed surrogate id for a
    // label-only client.
    const input = buildCrmRelationshipInput({
      deal: { id: 'd', name: 'Deal' },
      clientName: 'Surrogate Client',
      team: { id: 'team-guid', name: 'T', lookupClassification: 'real-lookup' },
      assignedBanker: { id: 'banker-guid', name: 'B', lookupClassification: 'real-lookup' },
    });
    const r = deriveCrmRelationshipDetailReadiness(input);
    expect(r.safeDetailSections).not.toContain('clientIdentity');
    // A name-only client node EXISTS, so the client detail is degraded (not a
    // hard block) and the overall audit is partial, not blocked.
    const degraded = r.degradedDetailSections.find((b) => b.section === 'clientIdentity');
    expect(degraded?.reason).toMatch(/name only|surrogate/i);
    expect(r.blockedDetailSections.map((b) => b.section)).not.toContain('clientIdentity');
    expect(r.readinessStatus).toBe('partial');
  });
});

describe('missing client is the ONLY true blocker', () => {
  it('blocks CRM detail readiness entirely and lists clientIdentity as the sole blocked section', () => {
    const r = deriveCrmRelationshipDetailReadiness({ ...realGraph, client: null });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.missingInputs.some((m) => m.includes('client.id'))).toBe(true);
    expect(r.safeDetailSections).not.toContain('clientIdentity');
    // The canonical client is the only thing that can be BLOCKED.
    expect(r.blockedDetailSections.map((b) => b.section)).toEqual(['clientIdentity']);
  });

  it('blocks when there is no deal anchor', () => {
    const r = deriveCrmRelationshipDetailReadiness({ ...realGraph, deal: null });
    expect(r.readinessStatus).toBe('blocked');
  });

  it('never lists optional/deferred sections as blocked, even with a missing client', () => {
    const r = deriveCrmRelationshipDetailReadiness({ ...realGraph, client: null });
    const blocked = r.blockedDetailSections.map((b) => b.section);
    for (const s of ['platformWorkspaceBridge', 'salesforceSpine', 'teamOwnership', 'assignedBanker']) {
      expect(blocked).not.toContain(s);
    }
  });
});

describe('missing team / banker degrade (actionable), never a full CRM failure', () => {
  it('marks team/banker sections degraded — not blocked — with explicit missing inputs, no invented records', () => {
    const r = deriveCrmRelationshipDetailReadiness({
      ...realGraph,
      team: null,
      assignedBanker: null,
    });
    expect(r.readinessStatus).toBe('partial');
    expect(r.degradedDetailSections.map((b) => b.section)).toEqual(
      expect.arrayContaining(['teamOwnership', 'assignedBanker']),
    );
    expect(r.blockedDetailSections).toEqual([]);
    expect(r.missingInputs.some((m) => m.includes('team.id'))).toBe(true);
    expect(r.missingInputs.some((m) => m.includes('assignedBanker.id'))).toBe(true);
  });
});

describe('platform / workspace bridge is OPTIONAL, never blocked', () => {
  it('classifies an absent platform bridge as optional (not provided), not blocked', () => {
    const r = deriveCrmRelationshipDetailReadiness(realGraph); // no platformUser
    expect(r.optionalDetailSections.map((b) => b.section)).toContain('platformWorkspaceBridge');
    expect(r.blockedDetailSections.map((b) => b.section)).not.toContain('platformWorkspaceBridge');
    const assessment = r.sectionAssessments.find((a) => a.section === 'platformWorkspaceBridge');
    expect(assessment?.requirement).toBe('optional');
    expect(assessment?.state).toBe('optional');
    expect(assessment?.reason).toMatch(/optional/i);
  });
});

describe('future Salesforce-style spine is DEFERRED / OPTIONAL, never blocked', () => {
  it('renders as deferred / not seeded / not wired even when the rest is ready', () => {
    const r = deriveCrmRelationshipDetailReadiness(realGraph);
    expect(r.spineSeeded).toBe(false);
    // CRM_LIVE_PERSISTENCE_ENABLED is at its safe default (off) in crmFeatureFlags.ts;
    // the spine is still not seeded — live persistence and spine seeding are separate concerns.
    expect(r.liveSpinePersistenceEnabled).toBe(false);
    expect(r.deferredDetailSections.map((b) => b.section)).toContain('salesforceSpine');
    expect(r.blockedDetailSections.map((b) => b.section)).not.toContain('salesforceSpine');
    expect(r.safeDetailSections).not.toContain('salesforceSpine');
    const assessment = r.sectionAssessments.find((a) => a.section === 'salesforceSpine');
    expect(assessment?.requirement).toBe('deferred');
    expect(assessment?.state).toBe('deferred');
  });
});

describe('unsafe assumptions are always rejected', () => {
  it('lists contacts/orgs/roles/activities/timeline/preferences as rejected, never fabricated', () => {
    const r = deriveCrmRelationshipDetailReadiness(realGraph);
    const rejected = r.unsafeAssumptionsRejected.map((a) => a.assumption);
    for (const a of [
      'contacts',
      'organization_hierarchy',
      'relationship_roles',
      'activities',
      'timeline_events',
      'communication_preferences',
    ]) {
      expect(rejected).toContain(a);
    }
    // The output invents no record collections.
    expect(r).not.toHaveProperty('contacts');
    expect(r).not.toHaveProperty('organizations');
    expect(r).not.toHaveProperty('roles');
    expect(r).not.toHaveProperty('activities');
    expect(r).not.toHaveProperty('timelineEvents');
  });
});

describe('next actions: render safe sections before seeding the spine', () => {
  it('prioritizes rendering safe detail and always defers the spine seed last', () => {
    const r = deriveCrmRelationshipDetailReadiness(realGraph);
    const renderIdx = r.nextActions.findIndex((a) => a.kind === 'render_safe_detail');
    const seedIdx = r.nextActions.findIndex((a) => a.kind === 'defer_spine_seed');
    expect(renderIdx).toBeGreaterThanOrEqual(0);
    expect(seedIdx).toBe(r.nextActions.length - 1);
    expect(seedIdx).toBeGreaterThan(renderIdx);
  });

  it('when blocked, prioritizes linking the client over rendering or seeding', () => {
    const r = deriveCrmRelationshipDetailReadiness({ ...realGraph, client: null });
    expect(r.nextActions[0].kind).toBe('resolve_blocked_section');
    expect(r.nextActions.some((a) => a.kind === 'render_safe_detail')).toBe(false);
  });
});

describe('safety posture is constant', () => {
  it('always read-only, never seeded', () => {
    for (const input of [realGraph, { ...realGraph, client: null }, { deal: null, client: null }]) {
      const r = deriveCrmRelationshipDetailReadiness(input);
      expect(r.readOnly).toBe(true);
      expect(r.spineSeeded).toBe(false);
    }
  });
});

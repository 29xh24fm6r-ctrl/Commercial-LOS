import { describe, it, expect } from 'vitest';
import {
  deriveCrmManagerTeamMountReadiness,
  auditCrmManagerTeamMountReadiness,
  KNOWN_CRM_MOUNT_SURFACES,
  type CrmMountSurfaceInput,
} from './crmManagerTeamMountReadiness';

/**
 * Phase 189H — Manager/Team CRM detail MOUNT readiness behavior.
 *
 * Proves which non-banker deal workspaces are technically mount-capable for the
 * read-only CRM relationship surface, that the audit mounts nothing, and that
 * the banker workspace remains the only active mount.
 */

const banker: CrmMountSurfaceInput = {
  surface: 'banker',
  currentlyMountsCrmPanel: true,
  providesDealData: true,
  providesBankerContext: true,
  authorizedDealLoad: true,
  authorizationScope: 'deal-owner',
};
const manager: CrmMountSurfaceInput = {
  surface: 'manager',
  currentlyMountsCrmPanel: false,
  providesDealData: true,
  providesBankerContext: false,
  authorizedDealLoad: true,
  authorizationScope: 'team-scoped',
};
const team: CrmMountSurfaceInput = {
  surface: 'team',
  currentlyMountsCrmPanel: false,
  providesDealData: true,
  providesBankerContext: false,
  authorizedDealLoad: true,
  authorizationScope: 'team-scoped',
};

describe('known real surfaces', () => {
  it('audits banker as the only active mount, manager+team capable but unmounted', () => {
    const r = auditCrmManagerTeamMountReadiness();
    expect(r.activeMountSurfaces).toEqual(['banker']);
    expect(r.bankerRemainsOnlyActiveMount).toBe(true);
    expect(r.mountCapableSurfaces).toEqual(expect.arrayContaining(['manager', 'team']));
    expect(r.readinessStatus).toBe('ready');
  });

  it('mounts nothing — every assessment stays unmounted this phase', () => {
    const r = auditCrmManagerTeamMountReadiness();
    expect(r.newMountsAdded).toBe(false);
    expect(r.readOnly).toBe(true);
    for (const a of r.surfaceAssessments) {
      expect(a.mountedThisPhase).toBe(false);
    }
  });

  it('records missing banker context as a degradation, not a blocker', () => {
    const r = auditCrmManagerTeamMountReadiness();
    const mgr = r.surfaceAssessments.find((a) => a.surface === 'manager');
    expect(mgr?.mountCapable).toBe(true);
    expect(mgr?.degradations.some((d) => /banker context/i.test(d))).toBe(true);
    // A degradation must not show up as a missing prerequisite.
    expect(mgr?.missingPrerequisites ?? []).toHaveLength(0);
  });

  it('the known descriptors match the real workspaces (banker mounts, others do not)', () => {
    const bankerDesc = KNOWN_CRM_MOUNT_SURFACES.find((s) => s.surface === 'banker');
    expect(bankerDesc?.currentlyMountsCrmPanel).toBe(true);
    for (const s of KNOWN_CRM_MOUNT_SURFACES.filter((x) => x.surface !== 'banker')) {
      expect(s.currentlyMountsCrmPanel).toBe(false);
    }
  });
});

describe('blocked surfaces', () => {
  it('a candidate without DealDataProvider is blocked, not capable', () => {
    const r = deriveCrmManagerTeamMountReadiness({
      surfaces: [banker, { ...manager, providesDealData: false }, team],
    });
    expect(r.mountCapableSurfaces).not.toContain('manager');
    const blocked = r.blockedSurfaces.find((b) => b.surface === 'manager');
    expect(blocked).toBeDefined();
    expect(r.missingPrerequisites.some((m) => /providesDealData/.test(m))).toBe(true);
    expect(r.readinessStatus).toBe('partial');
  });

  it('a candidate without an authorized scoped load is blocked', () => {
    const r = deriveCrmManagerTeamMountReadiness({
      surfaces: [banker, { ...manager, authorizedDealLoad: false }],
    });
    expect(r.mountCapableSurfaces).not.toContain('manager');
    expect(r.missingPrerequisites.some((m) => /authorizedDealLoad/.test(m))).toBe(true);
  });

  it('blocked overall when no manager/team candidate is mount-capable', () => {
    const r = deriveCrmManagerTeamMountReadiness({
      surfaces: [
        banker,
        { ...manager, providesDealData: false },
        { ...team, authorizedDealLoad: false },
      ],
    });
    expect(r.readinessStatus).toBe('blocked');
    expect(r.mountCapableSurfaces).toHaveLength(0);
  });

  it('blocked overall when there are no candidate surfaces at all', () => {
    const r = deriveCrmManagerTeamMountReadiness({ surfaces: [banker] });
    expect(r.readinessStatus).toBe('blocked');
  });
});

describe('banker-only active-mount invariant', () => {
  it('only the banker surface is ever an active mount', () => {
    const r = deriveCrmManagerTeamMountReadiness({ surfaces: [banker, manager, team] });
    const active = r.surfaceAssessments.filter((a) => a.isActiveMount);
    expect(active.map((a) => a.surface)).toEqual(['banker']);
  });

  it('a manager surface that wrongly claims to mount is NOT treated as an active mount', () => {
    // currentlyMountsCrmPanel is only honored for the banker surface.
    const r = deriveCrmManagerTeamMountReadiness({
      surfaces: [banker, { ...manager, currentlyMountsCrmPanel: true }],
    });
    expect(r.activeMountSurfaces).toEqual(['banker']);
    const mgr = r.surfaceAssessments.find((a) => a.surface === 'manager');
    expect(mgr?.isActiveMount).toBe(false);
  });
});

describe('next actions: preserve invariant first, defer capable mounts last', () => {
  it('preserves the banker-only invariant before anything else and defers capable mounts', () => {
    const r = deriveCrmManagerTeamMountReadiness({ surfaces: [banker, manager, team] });
    expect(r.nextActions[0].kind).toBe('preserve_active_mount_invariant');
    const deferIdx = r.nextActions.findIndex((a) => a.kind === 'defer_capable_mount');
    expect(deferIdx).toBeGreaterThan(0);
  });

  it('emits a resolve action for each blocked candidate', () => {
    const r = deriveCrmManagerTeamMountReadiness({
      surfaces: [banker, { ...manager, providesDealData: false }],
    });
    expect(r.nextActions.some((a) => a.kind === 'resolve_blocked_prerequisite')).toBe(true);
  });
});

describe('unsafe assumptions are always rejected', () => {
  it('rejects broadened visibility, write affordances, and fabricated CRM detail', () => {
    const r = auditCrmManagerTeamMountReadiness();
    const rejected = r.unsafeAssumptionsRejected.map((a) => a.assumption);
    for (const a of [
      'broadened_crm_visibility',
      'cross_team_contacts',
      'manager_write_affordances',
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
    expect(r).not.toHaveProperty('roles');
    expect(r).not.toHaveProperty('activities');
    expect(r).not.toHaveProperty('timelineEvents');
  });
});

describe('safety posture is constant', () => {
  it('always read-only, never adds a mount; reflects the build-time live-persistence flag', () => {
    for (const surfaces of [[banker, manager, team], [banker], [manager]]) {
      const r = deriveCrmManagerTeamMountReadiness({ surfaces });
      expect(r.readOnly).toBe(true);
      expect(r.newMountsAdded).toBe(false);
      expect(r.bankerRemainsOnlyActiveMount).toBe(true);
      // Phase 256B flipped CRM_LIVE_PERSISTENCE_ENABLED to true in crmFeatureFlags.ts;
      // this audit reflects the build-time default and still mounts nothing.
      expect(r.liveCrmPersistenceEnabled).toBe(true);
    }
  });
});

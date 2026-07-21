import { describe, it, expect } from 'vitest';
import {
  DEAL_VISIBILITY_SCOPES,
  buildTeamVisibilityFilter,
} from './dealVisibilityScopes';

const TEAM = '11111111-1111-1111-1111-111111111111';
const BANKER_A = '22222222-2222-2222-2222-222222222222';
const BANKER_B = '33333333-3333-3333-3333-333333333333';

describe('P0-4 — canonical deal-visibility scopes are documented and labelled', () => {
  it('defines all four scopes with a label and description', () => {
    for (const id of ['banker', 'team', 'manager', 'portfolio'] as const) {
      const scope = DEAL_VISIBILITY_SCOPES[id];
      expect(scope.id).toBe(id);
      expect(scope.label.length).toBeGreaterThan(0);
      expect(scope.description.length).toBeGreaterThan(0);
    }
  });

  it('labels team and manager as intentionally broader than the personal banker scope', () => {
    // Team/Manager share the owning-team-OR-member scope so they reconcile with each other.
    expect(DEAL_VISIBILITY_SCOPES.team.primaryPredicate).toContain('_cr664_assignedbanker_value');
    expect(DEAL_VISIBILITY_SCOPES.manager.primaryPredicate).toContain('_cr664_assignedbanker_value');
    // Portfolio is explicitly documented as a different population, not a pipeline count.
    expect(DEAL_VISIBILITY_SCOPES.portfolio.description.toLowerCase()).toContain('different');
  });
});

describe('P0-4 — buildTeamVisibilityFilter (Owning-Team fallback)', () => {
  it('scopes to the team only when no member ids are supplied (backwards-compatible)', () => {
    const f = buildTeamVisibilityFilter(TEAM);
    expect(f).toContain(`_cr664_team_value eq ${TEAM}`);
    expect(f).not.toContain('_cr664_assignedbanker_value');
    // Still filters to active, non-terminal deals.
    expect(f).toContain('statecode eq 0');
    expect(f).toContain('cr664_isterminalstatus eq false or cr664_isterminalstatus eq null');
  });

  it('includes deals owned by the team OR assigned to a team member when member ids are supplied', () => {
    const f = buildTeamVisibilityFilter(TEAM, { memberBankerIds: [BANKER_A, BANKER_B] });
    expect(f).toContain(`_cr664_team_value eq ${TEAM}`);
    expect(f).toContain(`_cr664_assignedbanker_value eq ${BANKER_A}`);
    expect(f).toContain(`_cr664_assignedbanker_value eq ${BANKER_B}`);
    // The scoping clauses are OR-ed together and AND-ed with the active predicate.
    expect(f).toMatch(/\(_cr664_team_value eq [^)]+ or _cr664_assignedbanker_value eq [^)]+\) and statecode eq 0/);
  });

  it('never emits an unscoped query and rejects non-GUID ids (injection guard)', () => {
    const f = buildTeamVisibilityFilter(TEAM, {
      memberBankerIds: ["' or 1 eq 1", 'not-a-guid', BANKER_A],
    });
    expect(f).not.toContain('1 eq 1');
    expect(f).not.toContain('not-a-guid');
    expect(f).toContain(`_cr664_assignedbanker_value eq ${BANKER_A}`);
    // A garbage teamId with no valid members still produces a scoped (never blank) filter.
    const g = buildTeamVisibilityFilter('bad', {});
    expect(g).toContain('_cr664_team_value eq');
    expect(g).toContain('statecode eq 0');
  });
});

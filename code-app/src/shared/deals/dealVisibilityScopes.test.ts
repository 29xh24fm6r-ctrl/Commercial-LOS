import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEAL_VISIBILITY_SCOPES,
  buildTeamVisibilityFilter,
  buildTeamVisibilityFilterViaNavigation,
  ACTIVE_DEAL_ODATA_PREDICATE,
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

describe('N-03 — buildTeamVisibilityFilterViaNavigation (child-record Owning-Team fallback)', () => {
  it('scopes to the team only, via the navigation property, when no member ids are supplied', () => {
    const f = buildTeamVisibilityFilterViaNavigation('cr664_Deal', TEAM);
    expect(f).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(f).not.toContain('_cr664_assignedbanker_value');
    expect(f).toContain('statecode eq 0');
  });

  it('includes child rows whose parent deal is owned by the team OR assigned to a team member', () => {
    const f = buildTeamVisibilityFilterViaNavigation('cr664_Deal', TEAM, { memberBankerIds: [BANKER_A, BANKER_B] });
    expect(f).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(f).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
    expect(f).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_B}`);
    expect(f).toMatch(
      /\(cr664_Deal\/_cr664_team_value eq [^)]+ or cr664_Deal\/_cr664_assignedbanker_value eq [^)]+\) and statecode eq 0/,
    );
  });

  it('never emits an unscoped query and rejects non-GUID ids (injection guard)', () => {
    const f = buildTeamVisibilityFilterViaNavigation('cr664_Deal', TEAM, {
      memberBankerIds: ["' or 1 eq 1", 'not-a-guid', BANKER_A],
    });
    expect(f).not.toContain('1 eq 1');
    expect(f).not.toContain('not-a-guid');
    expect(f).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
    const g = buildTeamVisibilityFilterViaNavigation('cr664_Deal', 'bad', {});
    expect(g).toContain('cr664_Deal/_cr664_team_value eq');
    expect(g).toContain('statecode eq 0');
  });
});

/**
 * Factory Arc Phase 6 — canonical active-deal query regression guard.
 *
 * Before this phase, `statecode eq 0 and (cr664_isterminalstatus eq false or ... eq null)` was
 * independently retyped in banker/dealQueries.ts and (twice) in
 * executive/operationalFallbackQueries.ts — four copies of the identical literal string with no
 * shared source, which is exactly how the Banker/Team/Manager/Executive active-deal counts drifted
 * apart in the prior audit documented in docs/remediation/PHASE_1_ARCHITECTURE_MAP_2026-07-22.md
 * (root cause was the test-deal exclusion helper, not this predicate — but the same "N independent
 * copies" shape of bug). This test pins that every consumer now imports ACTIVE_DEAL_ODATA_PREDICATE
 * from this module instead of retyping it, so a future edit to the active-deal rule can't silently
 * apply to only some surfaces.
 */
describe('Factory Arc Phase 6 — ACTIVE_DEAL_ODATA_PREDICATE is the sole source of the active-deal rule', () => {
  const REPO_SRC = resolve(__dirname, '..', '..');
  const CONSUMER_FILES = [
    'banker/dealQueries.ts',
    'executive/operationalFallbackQueries.ts',
    'shared/deals/dealVisibilityScopes.ts',
  ];

  it('is the exact predicate string used by buildTeamVisibilityFilter', () => {
    expect(ACTIVE_DEAL_ODATA_PREDICATE).toBe(
      'statecode eq 0 and (cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)',
    );
  });

  it('every known active-deal consumer imports ACTIVE_DEAL_ODATA_PREDICATE from this module', () => {
    for (const rel of CONSUMER_FILES) {
      const src = readFileSync(resolve(REPO_SRC, rel), 'utf8');
      expect(src, `${rel} should import ACTIVE_DEAL_ODATA_PREDICATE`).toMatch(
        /import\s*\{[^}]*ACTIVE_DEAL_ODATA_PREDICATE[^}]*\}\s*from\s*['"].*dealVisibilityScopes['"]|ACTIVE_DEAL_ODATA_PREDICATE\s*=/,
      );
    }
  });

  it('the raw predicate literal is declared in exactly one place (this module), not re-typed elsewhere', () => {
    const LITERAL = 'cr664_isterminalstatus eq false or cr664_isterminalstatus eq null';
    for (const rel of CONSUMER_FILES) {
      const src = readFileSync(resolve(REPO_SRC, rel), 'utf8');
      const occurrences = (src.match(new RegExp(LITERAL, 'g')) ?? []).length;
      if (rel === 'shared/deals/dealVisibilityScopes.ts') {
        expect(occurrences, `${rel} should declare the literal exactly once`).toBe(1);
      } else {
        expect(occurrences, `${rel} should not re-declare the literal — it must import the constant instead`).toBe(0);
      }
    }
  });
});

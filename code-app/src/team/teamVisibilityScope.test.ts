import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P0-4 — management-visibility / active-deal count reconciliation.
 *
 * A deal with no Owning Team (`cr664_Team`) but a valid assigned banker used to vanish from the
 * Team pipeline (which filtered strictly on `_cr664_team_value`) while still showing on the banker
 * dashboard. These tests pin that `loadTeamDeals` scopes to deals owned by the team OR assigned to a
 * supplied team-member banker, so such a deal is no longer dropped from oversight.
 */

const { getAllMock } = vi.hoisted(() => ({ getAllMock: vi.fn() }));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllMock },
}));
vi.mock('../generated/services/Cr664_bankersService', () => ({
  Cr664_bankersService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: vi.fn() },
}));

import { loadTeamDeals } from './teamQueries';

const TEAM = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';

function lastFilter(): string {
  return getAllMock.mock.calls.at(-1)![0].filter as string;
}

beforeEach(() => getAllMock.mockReset());

describe('P0-4 — loadTeamDeals visibility scope', () => {
  it('team-owned-only when no member ids are supplied (backwards-compatible)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    await loadTeamDeals(TEAM);
    const filter = lastFilter();
    expect(filter).toContain(`_cr664_team_value eq ${TEAM}`);
    expect(filter).not.toContain('_cr664_assignedbanker_value');
  });

  it('includes member-assigned deals (Owning-Team fallback) when member ids are supplied', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    await loadTeamDeals(TEAM, { memberBankerIds: [MEMBER] });
    const filter = lastFilter();
    expect(filter).toContain(`_cr664_team_value eq ${TEAM}`);
    expect(filter).toContain(`_cr664_assignedbanker_value eq ${MEMBER}`);
  });

  it('surfaces a deal that has NO Owning Team but is assigned to a team member', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        {
          cr664_loandealid: 'orphan-team-deal',
          cr664_dealname: 'Acme Expansion',
          _cr664_team_value: undefined, // Owning Team was skipped on create
          _cr664_assignedbanker_value: MEMBER,
        },
      ],
    });
    const rows = await loadTeamDeals(TEAM, { memberBankerIds: [MEMBER] });
    expect(rows.map((r) => r.id)).toContain('orphan-team-deal');
  });
});

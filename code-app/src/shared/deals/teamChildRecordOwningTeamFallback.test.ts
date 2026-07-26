import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N-03 (Production Remediation Factory Arc Phase 2) — every Manager/Team
 * child-record loader (tasks, documents, memos, memo sections) must apply the
 * SAME Owning-Team-OR-assigned-banker fallback the deal-list loaders already
 * have (loadTeamPipeline / loadTeamDeals via buildTeamVisibilityFilter). Before
 * this fix, each child loader filtered ONLY on the parent deal's team lookup —
 * a deal with an assigned banker but no Owning Team (reachable at New Deal
 * create, where cr664_Team is optional) would appear in the team's deal list
 * via the fallback while its tasks/documents/memos never would. This test
 * asserts the exact OData filter string each loader sends, for both the
 * team-only case (no member ids) and the fallback case (member ids supplied).
 */

const {
  dealTaskGetAll,
  documentChecklistGetAll,
  creditMemoGetAll,
  creditMemoSectionGetAll,
  bankersGetAll,
  loanDealsGetAll,
} = vi.hoisted(() => ({
  dealTaskGetAll: vi.fn(),
  documentChecklistGetAll: vi.fn(),
  creditMemoGetAll: vi.fn(),
  creditMemoSectionGetAll: vi.fn(),
  bankersGetAll: vi.fn(),
  loanDealsGetAll: vi.fn(),
}));

vi.mock('../../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: dealTaskGetAll },
}));
vi.mock('../../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: documentChecklistGetAll },
}));
vi.mock('../../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: creditMemoGetAll },
}));
vi.mock('../../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: creditMemoSectionGetAll },
}));
vi.mock('../../generated/services/Cr664_bankersService', () => ({
  Cr664_bankersService: { getAll: bankersGetAll },
}));
vi.mock('../../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: loanDealsGetAll },
}));

import {
  loadManagerTeamTasks,
  loadManagerTeamDocuments,
  loadManagerTeamMemos,
  loadManagerTeamMemoSections,
} from '../../manager/managerQueries';
import {
  loadTeamTasks,
  loadTeamDocuments,
  loadTeamMemos,
  loadTeamMemoSections,
} from '../../team/teamQueries';

const TEAM = '11111111-1111-1111-1111-111111111111';
const BANKER_A = '22222222-2222-2222-2222-222222222222';
const BANKER_B = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  dealTaskGetAll.mockReset().mockResolvedValue({ success: true, data: [] });
  documentChecklistGetAll.mockReset().mockResolvedValue({ success: true, data: [] });
  creditMemoGetAll.mockReset().mockResolvedValue({ success: true, data: [] });
  creditMemoSectionGetAll.mockReset().mockResolvedValue({ success: true, data: [] });
});

describe('N-03 — Manager child loaders apply the Owning-Team-OR-member-banker fallback', () => {
  it('loadManagerTeamTasks: team-only filter when no member ids supplied', async () => {
    await loadManagerTeamTasks(TEAM);
    const filter = dealTaskGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(filter).not.toContain('_cr664_assignedbanker_value');
    expect(filter).toContain('statecode eq 0');
  });

  it('loadManagerTeamTasks: OR-fallback filter when member ids supplied', async () => {
    await loadManagerTeamTasks(TEAM, [BANKER_A, BANKER_B]);
    const filter = dealTaskGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_B}`);
    expect(filter).toMatch(
      /\(cr664_Deal\/_cr664_team_value eq [^)]+ or cr664_Deal\/_cr664_assignedbanker_value eq [^)]+\) and statecode eq 0/,
    );
  });

  it('loadManagerTeamDocuments: OR-fallback filter when member ids supplied', async () => {
    await loadManagerTeamDocuments(TEAM, [BANKER_A]);
    const filter = documentChecklistGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
    expect(filter).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
  });

  it('loadManagerTeamMemos: OR-fallback filter when member ids supplied', async () => {
    await loadManagerTeamMemos(TEAM, [BANKER_A]);
    const filter = creditMemoGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });

  it('loadManagerTeamMemoSections: OR-fallback filter when member ids supplied', async () => {
    await loadManagerTeamMemoSections(TEAM, [BANKER_A]);
    const filter = creditMemoSectionGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });
});

describe('N-03 — Team child loaders apply the Owning-Team-OR-member-banker fallback', () => {
  it('loadTeamTasks: team-only filter when no member ids supplied', async () => {
    await loadTeamTasks(TEAM);
    const filter = dealTaskGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(filter).not.toContain('_cr664_assignedbanker_value');
    expect(filter).toContain('statecode eq 0');
  });

  it('loadTeamTasks: OR-fallback filter when member ids supplied', async () => {
    await loadTeamTasks(TEAM, [BANKER_A, BANKER_B]);
    const filter = dealTaskGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_team_value eq ${TEAM}`);
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_B}`);
    expect(filter).toMatch(
      /\(cr664_Deal\/_cr664_team_value eq [^)]+ or cr664_Deal\/_cr664_assignedbanker_value eq [^)]+\) and statecode eq 0/,
    );
  });

  it('loadTeamDocuments: OR-fallback filter when member ids supplied', async () => {
    await loadTeamDocuments(TEAM, [BANKER_A]);
    const filter = documentChecklistGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });

  it('loadTeamMemos: OR-fallback filter when member ids supplied', async () => {
    await loadTeamMemos(TEAM, [BANKER_A]);
    const filter = creditMemoGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });

  it('loadTeamMemoSections: OR-fallback filter when member ids supplied', async () => {
    await loadTeamMemoSections(TEAM, [BANKER_A]);
    const filter = creditMemoSectionGetAll.mock.calls[0]![0].filter as string;
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });

  it('rejects non-GUID member ids (injection guard) while still scoping child rows to the team', async () => {
    await loadTeamTasks(TEAM, ["' or 1 eq 1", 'not-a-guid', BANKER_A]);
    const filter = dealTaskGetAll.mock.calls[0]![0].filter as string;
    expect(filter).not.toContain('1 eq 1');
    expect(filter).not.toContain('not-a-guid');
    expect(filter).toContain(`cr664_Deal/_cr664_assignedbanker_value eq ${BANKER_A}`);
  });
});

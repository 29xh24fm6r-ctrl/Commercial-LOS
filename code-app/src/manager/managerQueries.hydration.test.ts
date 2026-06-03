import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 125B — manager loader display-value hydration tests.
 *
 * Pins:
 *   - loadManagerIdentity resolves teamName via the
 *     `_cr664_team_value@OData.Community.Display.V1.FormattedValue`
 *     annotation when present (preferred over the SDK shadow), falls
 *     back to the `cr664_teamname` shadow, then to '(unnamed team)';
 *   - loadTeamPipeline hydrates clientName / stage / status /
 *     assignedBankerName / productType / loanStructure / pricingType
 *     via the same formatted-value-first priority pattern;
 *   - status falls back to statuscode formatted value when both the
 *     custom cr664_StatusReference and its shadow are missing;
 *   - banker name falls back to owneridname when both the custom
 *     cr664_AssignedBanker and its shadow are missing;
 *   - empty-string and missing annotations are treated as honest
 *     "absent" → fall through to the next source;
 *   - truly absent values surface as undefined (no fake fallback,
 *     no GUID leakage).
 */

const { getAllMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_bankersService', () => ({
  Cr664_bankersService: { getAll: getAllMock },
}));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllMock },
}));

// Stub every other service the manager module imports so the import
// graph resolves without hitting the live SDK.
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

import { loadManagerIdentity, loadTeamPipeline } from './managerQueries';

function bankerRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cr664_bankerid: 'b-1',
    cr664_fullname: 'Test Banker',
    cr664_email: 'banker@oldglorybank.com',
    _cr664_team_value: 'team-1',
    cr664_teamname: undefined,
    ...over,
  };
}

function dealRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cr664_loandealid: 'd-1',
    cr664_dealname: 'Test Deal',
    cr664_amount: 1_000_000,
    cr664_targetclosedate: '2026-07-01',
    cr664_stageentrydate: '2026-05-20',
    modifiedon: '2026-06-02T00:00:00Z',
    cr664_collateralsummary: undefined,
    _cr664_assignedbanker_value: 'banker-1',
    // SDK shadow fields — defaults are empty in the live env, which
    // is the bug Phase 125B fixes.
    cr664_clientname: undefined,
    cr664_stagereferencename: undefined,
    cr664_statusreferencename: undefined,
    statuscodename: undefined,
    cr664_assignedbankername: undefined,
    cr664_producttypereferencename: undefined,
    cr664_loanstructuretypereferencename: undefined,
    cr664_pricingtypereferencename: undefined,
    owneridname: undefined,
    ...over,
  };
}

beforeEach(() => {
  getAllMock.mockReset();
});

// ---------------------------------------------------------------------------
// loadManagerIdentity — team name hydration
// ---------------------------------------------------------------------------

describe('Phase 125B — loadManagerIdentity team-name hydration', () => {
  it('prefers the _cr664_team_value formatted-value annotation over the SDK shadow', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        bankerRow({
          '_cr664_team_value@OData.Community.Display.V1.FormattedValue':
            'TEST Team',
          cr664_teamname: 'WRONG SHADOW',
        }),
      ],
    });
    const result = await loadManagerIdentity('banker@oldglorybank.com');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.identity.teamName).toBe('TEST Team');
    }
  });

  it('falls back to the cr664_teamname SDK shadow when no annotation is present', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [bankerRow({ cr664_teamname: 'Shadow Team' })],
    });
    const result = await loadManagerIdentity('banker@oldglorybank.com');
    if (result.kind === 'ready') {
      expect(result.identity.teamName).toBe('Shadow Team');
    }
  });

  it("returns '(unnamed team)' only when both annotation AND shadow are truly absent (no fake derivation from id)", async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [bankerRow()],
    });
    const result = await loadManagerIdentity('banker@oldglorybank.com');
    if (result.kind === 'ready') {
      expect(result.identity.teamName).toBe('(unnamed team)');
      // CRITICAL: no GUID leakage from teamId.
      expect(result.identity.teamName).not.toMatch(/team-1/);
    }
  });

  it('treats empty-string annotation as absent (falls through to shadow)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        bankerRow({
          '_cr664_team_value@OData.Community.Display.V1.FormattedValue': '',
          cr664_teamname: 'Shadow Wins',
        }),
      ],
    });
    const result = await loadManagerIdentity('banker@oldglorybank.com');
    if (result.kind === 'ready') {
      expect(result.identity.teamName).toBe('Shadow Wins');
    }
  });
});

// ---------------------------------------------------------------------------
// loadTeamPipeline — TeamDeal display-value hydration
// ---------------------------------------------------------------------------

describe('Phase 125B — loadTeamPipeline TeamDeal hydration', () => {
  it('hydrates clientName from the lookup formatted value over the SDK shadow', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_client_value@OData.Community.Display.V1.FormattedValue':
            'TEST — Borrower Phase 121',
          cr664_clientname: 'WRONG SHADOW',
        }),
      ],
    });
    const out = await loadTeamPipeline('team-1');
    expect(out[0].clientName).toBe('TEST — Borrower Phase 121');
  });

  it('hydrates stage from the cr664_StageReference lookup formatted value', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue':
            'TEST · Stage Phase 121',
        }),
      ],
    });
    const out = await loadTeamPipeline('team-1');
    expect(out[0].stage).toBe('TEST · Stage Phase 121');
  });

  it('hydrates status from cr664_StatusReference, then shadow, then statuscode annotation', async () => {
    // Custom lookup populated.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow({
          '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue':
            'Active',
        }),
      ],
    });
    let out = await loadTeamPipeline('team-1');
    expect(out[0].status).toBe('Active');

    // Custom lookup missing → shadow.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [dealRow({ cr664_statusreferencename: 'In Progress' })],
    });
    out = await loadTeamPipeline('team-1');
    expect(out[0].status).toBe('In Progress');

    // Custom + shadow missing → statuscode formatted value.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow({
          'statuscode@OData.Community.Display.V1.FormattedValue': 'Active',
        }),
      ],
    });
    out = await loadTeamPipeline('team-1');
    expect(out[0].status).toBe('Active');
  });

  it('hydrates assignedBankerName via lookup, then shadow, then owneridname', async () => {
    // Custom lookup populated.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow({
          '_cr664_assignedbanker_value@OData.Community.Display.V1.FormattedValue':
            'Hydrated Banker',
        }),
      ],
    });
    let out = await loadTeamPipeline('team-1');
    expect(out[0].assignedBankerName).toBe('Hydrated Banker');

    // Fall back to owneridname when no other source populated.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [dealRow({ owneridname: 'Owner Banker' })],
    });
    out = await loadTeamPipeline('team-1');
    expect(out[0].assignedBankerName).toBe('Owner Banker');
  });

  it('hydrates product / loan structure / pricing reference labels via lookup formatted values', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_producttypereference_value@OData.Community.Display.V1.FormattedValue':
            'SBA 7(a)',
          '_cr664_loanstructuretypereference_value@OData.Community.Display.V1.FormattedValue':
            'Term Loan',
          '_cr664_pricingtypereference_value@OData.Community.Display.V1.FormattedValue':
            'Variable',
        }),
      ],
    });
    const out = await loadTeamPipeline('team-1');
    expect(out[0].productType).toBe('SBA 7(a)');
    expect(out[0].loanStructure).toBe('Term Loan');
    expect(out[0].pricingType).toBe('Variable');
  });

  it('surfaces honest undefined when no source produces a display value (no GUID leakage)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [dealRow()],
    });
    const out = await loadTeamPipeline('team-1');
    expect(out[0].clientName).toBeUndefined();
    expect(out[0].stage).toBeUndefined();
    expect(out[0].status).toBeUndefined();
    expect(out[0].assignedBankerName).toBeUndefined();
    expect(out[0].productType).toBeUndefined();
    expect(out[0].loanStructure).toBeUndefined();
    expect(out[0].pricingType).toBeUndefined();
    // CRITICAL: no GUID leaks into any human-facing display field.
    for (const field of [
      out[0].clientName,
      out[0].stage,
      out[0].status,
      out[0].assignedBankerName,
      out[0].productType,
    ]) {
      if (field !== undefined) {
        expect(field).not.toMatch(/^[0-9a-f-]{36}$/);
      }
    }
  });
});

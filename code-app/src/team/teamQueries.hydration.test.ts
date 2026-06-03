import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 128B — team loader display-value hydration tests.
 *
 * Pins the Team Ops Queue data-parity fix: `loadTeamDeals` must
 * resolve clientName / stage / status / assignedBankerName /
 * productType / loanStructure / pricingType via the same
 * formatted-value-first → SDK-shadow fallback the manager
 * `loadTeamPipeline` (Phase 125B) uses. Before this phase the team
 * pipeline read only the `<attr>name` shadow fields, which the live
 * env leaves empty for choice / lookup columns — producing the
 * "Unknown banker / Client not set / Stage not set / Status not set /
 * Missing data = 1" symptoms on the Team Ops Queue execution board.
 *
 * Pins:
 *   - clientName / stage hydrate from the lookup formatted value over
 *     the SDK shadow;
 *   - status falls back lookup → shadow → statuscode formatted value;
 *   - banker name falls back lookup → shadow → owneridname;
 *   - product / loan structure / pricing reference labels hydrate via
 *     their lookup formatted values;
 *   - empty-string annotations are treated as absent (fall through);
 *   - truly absent values surface as honest undefined (no fake
 *     fallback, no GUID leakage).
 */

const { getAllMock } = vi.hoisted(() => ({
  getAllMock: vi.fn(),
}));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllMock },
}));

// Stub every other service the team module imports so the import graph
// resolves without hitting the live SDK.
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
    // SDK shadow fields — defaults are empty in the live env, which is
    // the bug Phase 128B fixes (parity with Phase 125B on the manager
    // side).
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

describe('Phase 128B — loadTeamDeals display-value hydration', () => {
  it('hydrates clientName from the lookup formatted value over the SDK shadow', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_client_value@OData.Community.Display.V1.FormattedValue':
            'TEST Client',
          cr664_clientname: 'WRONG SHADOW',
        }),
      ],
    });
    const out = await loadTeamDeals('team-1');
    expect(out[0].clientName).toBe('TEST Client');
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
    const out = await loadTeamDeals('team-1');
    expect(out[0].stage).toBe('TEST · Stage Phase 121');
  });

  it('hydrates status from cr664_StatusReference, then shadow, then statuscode annotation', async () => {
    // Custom lookup populated.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow({
          '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue':
            'TEST — Status Phase 121',
        }),
      ],
    });
    let out = await loadTeamDeals('team-1');
    expect(out[0].status).toBe('TEST — Status Phase 121');

    // Custom lookup missing → shadow.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [dealRow({ cr664_statusreferencename: 'In Progress' })],
    });
    out = await loadTeamDeals('team-1');
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
    out = await loadTeamDeals('team-1');
    expect(out[0].status).toBe('Active');
  });

  it('hydrates assignedBankerName via lookup, then shadow, then owneridname', async () => {
    // Custom lookup populated.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [
        dealRow({
          '_cr664_assignedbanker_value@OData.Community.Display.V1.FormattedValue':
            'Matthew Paller',
        }),
      ],
    });
    let out = await loadTeamDeals('team-1');
    expect(out[0].assignedBankerName).toBe('Matthew Paller');

    // Custom lookup missing → shadow.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [dealRow({ cr664_assignedbankername: 'Shadow Banker' })],
    });
    out = await loadTeamDeals('team-1');
    expect(out[0].assignedBankerName).toBe('Shadow Banker');

    // Custom + shadow missing → owneridname.
    getAllMock.mockResolvedValueOnce({
      success: true,
      data: [dealRow({ owneridname: 'Owner Banker' })],
    });
    out = await loadTeamDeals('team-1');
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
    const out = await loadTeamDeals('team-1');
    expect(out[0].productType).toBe('SBA 7(a)');
    expect(out[0].loanStructure).toBe('Term Loan');
    expect(out[0].pricingType).toBe('Variable');
  });

  it('treats an empty-string annotation as absent (falls through to the shadow)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [
        dealRow({
          '_cr664_client_value@OData.Community.Display.V1.FormattedValue': '',
          cr664_clientname: 'Shadow Client Wins',
        }),
      ],
    });
    const out = await loadTeamDeals('team-1');
    expect(out[0].clientName).toBe('Shadow Client Wins');
  });

  it('surfaces honest undefined when no source produces a display value (no GUID leakage)', async () => {
    getAllMock.mockResolvedValue({
      success: true,
      data: [dealRow()],
    });
    const out = await loadTeamDeals('team-1');
    expect(out[0].clientName).toBeUndefined();
    expect(out[0].stage).toBeUndefined();
    expect(out[0].status).toBeUndefined();
    expect(out[0].assignedBankerName).toBeUndefined();
    expect(out[0].productType).toBeUndefined();
    expect(out[0].loanStructure).toBeUndefined();
    expect(out[0].pricingType).toBeUndefined();
    // The banker FK is still carried for grouping, but it must never
    // leak into the human-facing display name.
    expect(out[0].assignedBankerId).toBe('banker-1');
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

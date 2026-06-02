import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { get: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadDealForBanker } from './dealQueries';

const dealGet = vi.mocked(Cr664_loandealsService.get);

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    cr664_loandealid: 'deal-1',
    cr664_dealname: 'Acme Working Capital',
    cr664_clientname: 'Acme',
    cr664_stagereferencename: 'Underwriting',
    cr664_statusreferencename: 'Active',
    cr664_amount: 4_500_000,
    cr664_assignedbankername: 'M. Paller',
    cr664_targetclosedate: '2026-09-30T00:00:00Z',
    cr664_producttypereferencename: 'RLOC',
    cr664_loanstructuretypereferencename: 'Senior Secured',
    cr664_customertypename: 'C&I',
    cr664_industryname: 'Manufacturing',
    cr664_guarantorstructurename: 'Two personal',
    cr664_pricingtypereferencename: 'Floating',
    cr664_spreadindexreferencename: 'SOFR',
    cr664_spreadmargin: 275,
    cr664_collateralsummary: 'A/R, inventory',
    createdon: '2026-01-15T00:00:00Z',
    cr664_stageentrydate: '2026-05-01T00:00:00Z',
    statecode: 0,
    _cr664_assignedbanker_value: 'banker-A',
    _cr664_team_value: 'team-A',
    ...overrides,
  };
}

beforeEach(() => {
  dealGet.mockReset();
});

describe('loadDealForBanker', () => {
  it('returns ready when the assigned banker matches the caller', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.id).toBe('deal-1');
      expect(result.deal.bankerName).toBe('M. Paller');
    }
  });

  it('returns denied when the deal is assigned to another banker (no cross-banker leakage)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_assignedbanker_value: 'banker-OTHER' }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('returns denied if the assigned-banker FK is missing (defensive — no banker = not yours)', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({ _cr664_assignedbanker_value: undefined }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('does NOT use team match — a banker without the assignment is denied even on a team deal', async () => {
    // Cross-role guarantee: banker auth must NEVER fall back to team
    // match. If the assigned-banker FK doesn't match, denied — even
    // when the deal lives on the banker's team.
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: dealRow({
          _cr664_assignedbanker_value: 'banker-OTHER',
          _cr664_team_value: 'team-A',
        }),
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('denied');
  });

  it('returns not-found when the deal API reports 404 or empty data', async () => {
    dealGet.mockReturnValueOnce(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 404, message: 'Not found' },
      } as never),
    );
    expect((await loadDealForBanker('missing', 'banker-A')).kind).toBe(
      'not-found',
    );

    dealGet.mockReturnValueOnce(
      Promise.resolve({ success: true, data: undefined } as never),
    );
    expect((await loadDealForBanker('also-missing', 'banker-A')).kind).toBe(
      'not-found',
    );
  });

  it('returns failed with the underlying error message on non-404 service failure', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({
        success: false,
        data: undefined,
        error: { status: 500, message: 'internal error' },
      } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('failed');
    if (result.kind === 'failed') {
      expect(result.message).toBe('internal error');
    }
  });

  it('maps every field the deal-workspace cards consume', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: dealRow() } as never),
    );
    const result = await loadDealForBanker('deal-1', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.amount).toBe(4_500_000);
      expect(result.deal.productType).toBe('RLOC');
      expect(result.deal.stageEntryDate).toBe('2026-05-01T00:00:00Z');
      expect(result.deal.targetCloseDate).toBe('2026-09-30T00:00:00Z');
      expect(result.deal.isClosed).toBe(false);
    }
  });
});

/**
 * Phase 122C live-shaped fixture tests.
 *
 * The operator's 2026-06-02 cockpit reported Client / Stage / Status /
 * Banker / Customer Type / Industry / Guarantor Structure all as
 * "missing", despite Maker Portal showing the underlying lookups +
 * choices populated. Root cause: the auto-generated Power Apps SDK
 * does not populate the `<attr>name` shadow fields it declares on
 * the model interface; the formatted values arrive verbatim as
 * `@OData.Community.Display.V1.FormattedValue` annotations on the
 * raw retrieve response.
 *
 * The fixtures below mirror the actual Web API response shape, with
 * formatted-value annotations replacing the shadow fields. Each
 * test asserts the mapDealDetail output matches what the operator
 * sees in Maker Portal — so the cockpit's missing-field chip list
 * stops flagging hydrated columns.
 */
function liveShapedDealRow(overrides: Record<string, unknown> = {}) {
  // Mirror what Dataverse Web API returns when the @microsoft/power-apps
  // SDK forwards annotations to the caller. Lookups carry their display
  // on `_<lookup>_value@…FormattedValue`; choices carry it on
  // `<choice>@…FormattedValue`.
  return {
    cr664_loandealid: 'deal-test-122',
    cr664_dealname: 'TEST — Deal Phase 121',

    // Authorization FKs (always present on a banker-scoped deal):
    _cr664_assignedbanker_value: 'banker-A',
    _cr664_team_value: 'team-A',

    // === Lookup columns — display via _<lookup>_value annotation ===
    _cr664_client_value: 'client-guid',
    '_cr664_client_value@OData.Community.Display.V1.FormattedValue':
      'TEST Client',
    _cr664_stagereference_value: 'stage-guid',
    '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue':
      'TEST · Stage Phase 121',
    _cr664_statusreference_value: 'status-guid',
    '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue':
      'Active',

    // Owner (operator commonly sets standard Owner without the custom
    // Assigned Banker lookup — keep that behavior queryable):
    ownerid: 'banker-A',
    owneridname: 'Matthew Paller',

    // === Choice columns — display via @FormattedValue on the bare attr ===
    cr664_customertype: 788190000,
    'cr664_customertype@OData.Community.Display.V1.FormattedValue': 'Existing',
    cr664_industry: 788190003,
    'cr664_industry@OData.Community.Display.V1.FormattedValue': 'Real Estate',
    cr664_guarantorstructure: 788190000,
    'cr664_guarantorstructure@OData.Community.Display.V1.FormattedValue':
      'Unlimited',

    // === Plain text/number/date columns — no annotation indirection ===
    cr664_amount: 2_500_000,
    cr664_targetclosedate: '2026-06-30T00:00:00Z',
    cr664_collateralsummary: 'Real-estate collateral; LTV 70%',
    cr664_stageentrydate: '2026-06-01T00:00:00Z',
    createdon: '2026-05-29T00:00:00Z',

    // Product Type / Loan Structure / Pricing Type lookups left
    // INTENTIONALLY blank — these stay missing until the operator
    // populates them, per the Phase 122C contract.

    statecode: 0,
    ...overrides,
  };
}

describe('loadDealForBanker — Phase 122C live-shaped hydration', () => {
  it('hydrates Client from _cr664_client_value@OData.Community.Display.V1.FormattedValue', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.clientName).toBe('TEST Client');
    }
  });

  it('hydrates Stage from _cr664_stagereference_value@…FormattedValue', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.stage).toBe('TEST · Stage Phase 121');
    }
  });

  it('hydrates Status from _cr664_statusreference_value@…FormattedValue', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.status).toBe('Active');
    }
  });

  it('hydrates Customer Type from the choice formatted-value annotation', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.customerType).toBe('Existing');
    }
  });

  it('hydrates Industry from the choice formatted-value annotation', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      // Note: the live formatted-value is "Real Estate" (with a space),
      // distinct from the SDK-generated enum key "RealEstate".
      expect(result.deal.industry).toBe('Real Estate');
    }
  });

  it('hydrates Guarantor Structure from the choice formatted-value annotation', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.guarantorStructure).toBe('Unlimited');
    }
  });

  it('falls back to owneridname for Banker when cr664_AssignedBanker lookup display is absent', async () => {
    // Common operator state: the custom cr664_AssignedBanker FK is set
    // (so authorization works) but the SDK didn't return the lookup
    // formatted value AND the legacy shadow name field is undefined.
    // owneridname carries the right identity.
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.bankerName).toBe('Matthew Paller');
    }
  });

  it('hydrates Collateral Summary verbatim from cr664_collateralsummary', async () => {
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.collateralSummary).toBe(
        'Real-estate collateral; LTV 70%',
      );
    }
  });

  it('keeps Product Type / Loan Structure / Pricing Type missing when their reference lookups are blank', async () => {
    // Operator's Phase 121 seed legitimately leaves these blank; no
    // fake fallback should fill them in. Cockpit shows them missing
    // until Maker Portal populates the lookup.
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.productType).toBeUndefined();
      expect(result.deal.loanStructure).toBeUndefined();
      expect(result.deal.pricingType).toBeUndefined();
    }
  });

  it('prefers the cr664_AssignedBanker lookup display over owneridname when both are present', async () => {
    // When the custom Assigned Banker lookup IS populated (and Dataverse
    // returns its formatted value), that display wins — the standard
    // Dataverse Owner is only the last-resort fallback.
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: liveShapedDealRow({
          '_cr664_assignedbanker_value@OData.Community.Display.V1.FormattedValue':
            'Assigned Banker · M. Paller',
          owneridname: 'Different Owner',
        }),
      } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.bankerName).toBe('Assigned Banker · M. Paller');
    }
  });

  it('prefers the cr664_StatusReference lookup display over standard statuscode', async () => {
    // Same precedence rule as Banker: custom lookup display wins over
    // the standard Dataverse fallback.
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: liveShapedDealRow({
          statuscode: 1,
          'statuscode@OData.Community.Display.V1.FormattedValue': 'Inactive',
        }),
      } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      // The custom cr664_StatusReference points at "Active" in the
      // fixture; the standard statuscode would say "Inactive" but the
      // custom lookup wins.
      expect(result.deal.status).toBe('Active');
    }
  });

  it('still respects the legacy cr664_<attr>name shadow path for backward compat', async () => {
    // The pre-Phase-122C fixtures used cr664_stagereferencename etc.
    // directly. With annotations absent, the mapper must still fall
    // back to those shadow fields so nothing else in the repo breaks.
    dealGet.mockReturnValue(
      Promise.resolve({
        success: true,
        data: {
          cr664_loandealid: 'deal-legacy',
          cr664_dealname: 'Legacy fixture',
          cr664_stagereferencename: 'Legacy Stage',
          cr664_customertypename: 'Legacy Customer Type',
          _cr664_assignedbanker_value: 'banker-A',
          _cr664_team_value: 'team-A',
          statecode: 0,
        },
      } as never),
    );
    const result = await loadDealForBanker('deal-legacy', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.deal.stage).toBe('Legacy Stage');
      expect(result.deal.customerType).toBe('Legacy Customer Type');
    }
  });
});

describe('loadDealForBanker — cockpit missing-field check after Phase 122C hydration', () => {
  it('cockpit completeness no longer flags hydrated columns as missing', async () => {
    // End-to-end behavioral test: loader → cockpit metrics. With the
    // live-shaped fixture, the completeness check should treat Client,
    // Stage, Status, Banker, Customer Type, Industry, Guarantor
    // Structure, and Collateral as present.
    dealGet.mockReturnValue(
      Promise.resolve({ success: true, data: liveShapedDealRow() } as never),
    );
    const result = await loadDealForBanker('deal-test-122', 'banker-A');
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;

    const { deriveDealCockpitMetrics } = await import('./dealCockpitMetrics');
    const metrics = deriveDealCockpitMetrics(
      {
        deal: result.deal,
        tasks: undefined,
        documents: undefined,
        creditMemo: undefined,
        activity: undefined,
      },
      new Date('2026-06-02T00:00:00Z'),
    );

    // Hydrated fields must NOT appear in missingFieldLabels.
    expect(metrics.missingFieldLabels).not.toContain('Client');
    expect(metrics.missingFieldLabels).not.toContain('Stage');
    expect(metrics.missingFieldLabels).not.toContain('Status');
    expect(metrics.missingFieldLabels).not.toContain('Banker');
    expect(metrics.missingFieldLabels).not.toContain('Customer type');
    expect(metrics.missingFieldLabels).not.toContain('Industry');
    expect(metrics.missingFieldLabels).not.toContain('Guarantor structure');
    expect(metrics.missingFieldLabels).not.toContain('Collateral');

    // Legitimately-blank lookups stay missing.
    expect(metrics.missingFieldLabels).toContain('Product type');
    expect(metrics.missingFieldLabels).toContain('Loan structure');
    expect(metrics.missingFieldLabels).toContain('Pricing type');
  });
});

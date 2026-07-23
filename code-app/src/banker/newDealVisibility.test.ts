import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 258 (Item 1) — New Deal visibility regression.
 *
 * Proves a deal created by the governed New Deal adapter is INCLUDED by the
 * Loan Workflow / Active Deals query model. The Loan Workflow tab and Active
 * Deals tab both read `loadBankerPipeline(bankerId)`, so a freshly-created
 * deal (assigned to the banker, Stage Intake, Status Open, statecode 0,
 * non-terminal) must come back from that query.
 *
 * The create adapter writes (newDealCreateAdapter.ts):
 *   cr664_AssignedBanker@odata.bind → /cr664_bankers(<bankerId>)   (→ _cr664_assignedbanker_value)
 *   cr664_StageReference@odata.bind  (Intake) / cr664_StatusReference@odata.bind (Open)
 *   statecode + ownerid + cr664_isterminalstatus are NOT set → Dataverse defaults
 *   (statecode = 0 Active, isterminalstatus null).
 *
 * The query filters (dealQueries.ts loadBankerPipeline):
 *   _cr664_assignedbanker_value eq <bankerId>
 *   statecode eq 0
 *   (cr664_isterminalstatus eq false or cr664_isterminalstatus eq null)
 */

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: vi.fn() },
}));

import { Cr664_loandealsService } from '../generated/services/Cr664_loandealsService';
import { loadBankerPipeline } from './dealQueries';

const getAllMock = vi.mocked(Cr664_loandealsService.getAll);

// Source-pin the create adapter (importing it would pull the SDK into the test).
const ADAPTER_SRC = readFileSync(
  resolve(__dirname, '..', 'deals', 'newDealCreateAdapter.ts'),
  'utf8',
);

beforeEach(() => {
  getAllMock.mockReset();
});

const BANKER_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Row shaped exactly as Dataverse returns a deal that the create adapter just
 * wrote: assigned-banker lookup value set to BANKER_ID, statecode 0 (default),
 * isterminalstatus null (unset), and Stage/Status lookups surfacing "Intake" /
 * "Open" via the formatted-value annotation (the live SDK leaves the shadow
 * name fields empty).
 */
function freshlyCreatedDealRow(): Record<string, unknown> {
  return {
    cr664_loandealid: 'deal-new-1',
    cr664_dealname: 'Acme Working Capital',
    cr664_clientname: undefined,
    _cr664_assignedbanker_value: BANKER_ID,
    '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue': 'Intake',
    '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue': 'Open',
    cr664_amount: undefined,
    cr664_targetclosedate: undefined,
    modifiedon: '2026-06-26T12:00:00Z',
    cr664_stageentrydate: '2026-06-26T12:00:00Z',
    statecode: 0,
    cr664_isterminalstatus: null,
    cr664_closedflag: null,
  };
}

describe('Phase 258 — created deal is included by the Loan Workflow query model', () => {
  it('the create adapter writes the assigned-banker lookup the query filters on', () => {
    // The field the create adapter binds is the lookup whose *_value the query
    // filters by — this is the alignment that makes the deal visible.
    expect(ADAPTER_SRC).toMatch(/'cr664_AssignedBanker@odata\.bind':\s*`\/cr664_bankers\(\$\{assignedBankerId\}\)`/);
    expect(ADAPTER_SRC).toContain("'cr664_StageReference@odata.bind'");
    expect(ADAPTER_SRC).toContain("'cr664_StatusReference@odata.bind'");
    // Writes the deal to the same entity the pipeline query reads.
    expect(ADAPTER_SRC).toMatch(/Cr664_loandealsService\.create/);
  });

  it('loadBankerPipeline filters on assigned banker + active + non-terminal (matches a fresh Intake/Open deal)', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [] });
    await loadBankerPipeline(BANKER_ID);
    const opts = getAllMock.mock.calls[0]![0]!;
    const filter = String(opts.filter);
    expect(filter).toContain(`_cr664_assignedbanker_value eq ${BANKER_ID}`);
    expect(filter).toContain('statecode eq 0');
    expect(filter).toMatch(/cr664_isterminalstatus eq false or cr664_isterminalstatus eq null/);
  });

  it('returns the freshly-created deal with Intake stage and Open status', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [freshlyCreatedDealRow()] } as never);
    const deals = await loadBankerPipeline(BANKER_ID);
    expect(deals).toHaveLength(1);
    const created = deals[0]!;
    expect(created.id).toBe('deal-new-1');
    expect(created.name).toBe('Acme Working Capital');
    expect(created.stage).toBe('Intake');
    expect(created.status).toBe('Open');
    // A fresh deal is NOT terminal/closed (it must stay in the working pipeline).
    expect(created.isClosed).toBe(false);
  });

  it('does not drop the deal as closed when statecode=0 and isterminalstatus is null', async () => {
    const row = freshlyCreatedDealRow();
    const deals = await (async () => {
      getAllMock.mockResolvedValue({ success: true, data: [row] } as never);
      return loadBankerPipeline(BANKER_ID);
    })();
    expect(deals[0]!.isClosed).toBe(false);
  });
});

/**
 * D-01 — forensic regression using the known production deal this pass
 * investigated: 310da4b3-cb86-f111-ab10-70a8a59b1fe2, advanced to
 * Underwriting, absent from PersonalPipeline / Active Deals / Loan Workflow /
 * stage-filter options. This row passes EVERY predicate the canonical query
 * filters on (assigned banker, active, non-terminal) — the ONLY reason it was
 * excluded was the P1-11 test/smoke name-classification gate applying to a
 * name that also matches this initiative's OWN mandated "SYSTEM TEST -"
 * controlled-record convention. The fix is NOT to weaken that gate (real
 * smoke/QA noise must still stay out of operational KPI counts) — it is that
 * `includeTestDeals: true` (already used by PersonalPipeline.tsx and the Loan
 * Workflow workbench's default loader; see PersonalPipeline.tsx /
 * BankerLoanWorkflowWorkbench.tsx) is the one, already-existing, canonical
 * escape hatch for "list views must still find it," and every returned deal
 * now carries `isTestRecord` so those surfaces can label it instead of
 * silently mixing it in.
 */
describe('D-01 — known production Underwriting test deal passes every predicate except name-classification', () => {
  const KNOWN_DEAL_ID = '310da4b3-cb86-f111-ab10-70a8a59b1fe2';

  function knownUnderwritingTestDealRow(): Record<string, unknown> {
    return {
      cr664_loandealid: KNOWN_DEAL_ID,
      // The repo's own mandated controlled-test-record naming convention.
      cr664_dealname: 'SYSTEM TEST - Read Path Forensic Deal',
      cr664_clientname: 'N/A',
      _cr664_assignedbanker_value: BANKER_ID,
      '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue': 'Underwriting',
      '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue': 'Active',
      cr664_amount: 250_000,
      cr664_targetclosedate: '2026-09-01',
      modifiedon: '2026-07-15T00:00:00Z',
      cr664_stageentrydate: '2026-07-01T00:00:00Z',
      // Every OTHER predicate the canonical query filters on is satisfied.
      statecode: 0,
      cr664_isterminalstatus: false,
      cr664_closedflag: false,
    };
  }

  it('EXCLUDED by the default (dashboard/KPI) call — the exact predicate is the name-classification gate, not banker/active/terminal', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [knownUnderwritingTestDealRow()] } as never);
    const deals = await loadBankerPipeline(BANKER_ID);
    expect(deals).toHaveLength(0);
  });

  it('RETRIEVABLE with includeTestDeals: true (PersonalPipeline / Loan Workflow path), correctly flagged and in Underwriting', async () => {
    getAllMock.mockResolvedValue({ success: true, data: [knownUnderwritingTestDealRow()] } as never);
    const deals = await loadBankerPipeline(BANKER_ID, { includeTestDeals: true });
    expect(deals).toHaveLength(1);
    const d = deals[0]!;
    expect(d.id).toBe(KNOWN_DEAL_ID);
    expect(d.stage).toBe('Underwriting');
    expect(d.isTestRecord).toBe(true);
    expect(d.isClosed).toBe(false);
  });

  it('a real (non-test-named) deal in the same shape is included by BOTH the default and includeTestDeals calls, unflagged', async () => {
    const realRow = { ...knownUnderwritingTestDealRow(), cr664_loandealid: 'real-1', cr664_dealname: 'Acme Expansion' };
    getAllMock.mockResolvedValue({ success: true, data: [realRow] } as never);

    const defaultDeals = await loadBankerPipeline(BANKER_ID);
    expect(defaultDeals).toHaveLength(1);
    expect(defaultDeals[0]!.isTestRecord).toBe(false);

    const inclusiveDeals = await loadBankerPipeline(BANKER_ID, { includeTestDeals: true });
    expect(inclusiveDeals).toHaveLength(1);
    expect(inclusiveDeals[0]!.isTestRecord).toBe(false);
  });
});

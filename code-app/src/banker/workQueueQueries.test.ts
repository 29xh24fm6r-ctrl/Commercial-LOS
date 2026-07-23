import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D-01 regression — loadBankerWorkQueueData is the canonical read path behind
 * BOTH the banker dashboard (BankerShell.tsx's default, no-options call, which
 * drives deriveBankerPersonalActivity's KPI tiles / tab badges) and the Loan
 * Workflow workbench (BankerLoanWorkflowWorkbench.tsx, which now requests
 * `{ includeTestDeals: true }`). This file pins that the SAME loader behaves
 * correctly for both callers: a classified "SYSTEM TEST -" record stays
 * excluded from the default (dashboard/KPI) call, and is included — with its
 * own task/document/memo child records — when a caller opts in.
 */

const { getAllDealsMock, getAllTasksMock, getAllDocsMock, getAllMemosMock, getAllSectionsMock } =
  vi.hoisted(() => ({
    getAllDealsMock: vi.fn(),
    getAllTasksMock: vi.fn(),
    getAllDocsMock: vi.fn(),
    getAllMemosMock: vi.fn(),
    getAllSectionsMock: vi.fn(),
  }));

vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: getAllDealsMock },
}));
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: getAllTasksMock },
}));
vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: getAllDocsMock },
}));
vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: getAllMemosMock },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: getAllSectionsMock },
}));

import { loadBankerWorkQueueData } from './workQueueQueries';

// The known production Underwriting test deal this forensic pass investigated.
const KNOWN_TEST_DEAL_ID = '310da4b3-cb86-f111-ab10-70a8a59b1fe2';
const REAL_DEAL_ID = 'real-deal-1';
const BANKER_ID = 'banker-1';

function dealRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cr664_loandealid: KNOWN_TEST_DEAL_ID,
    // The mandated controlled-test-record naming convention.
    cr664_dealname: 'SYSTEM TEST - Read Path Forensic Deal',
    cr664_clientname: 'N/A',
    cr664_amount: 250_000,
    cr664_targetclosedate: '2026-09-01',
    cr664_stageentrydate: '2026-07-01',
    modifiedon: '2026-07-15T00:00:00Z',
    cr664_collateralsummary: undefined,
    // Passes every OTHER predicate loadBankerPipeline filters on: matches the
    // signed-in banker, active (not terminal), and not statecode-inactive.
    _cr664_assignedbanker_value: BANKER_ID,
    statecode: 0,
    cr664_closedflag: false,
    cr664_isterminalstatus: false,
    '_cr664_stagereference_value@OData.Community.Display.V1.FormattedValue': 'Underwriting',
    '_cr664_statusreference_value@OData.Community.Display.V1.FormattedValue': 'Open',
    ...over,
  };
}

function realDealRow(): Record<string, unknown> {
  return dealRow({
    cr664_loandealid: REAL_DEAL_ID,
    cr664_dealname: 'Acme Expansion',
  });
}

beforeEach(() => {
  getAllDealsMock.mockReset();
  getAllTasksMock.mockReset();
  getAllDocsMock.mockReset();
  getAllMemosMock.mockReset();
  getAllSectionsMock.mockReset();
  getAllTasksMock.mockResolvedValue({ success: true, data: [] });
  getAllDocsMock.mockResolvedValue({ success: true, data: [] });
  getAllMemosMock.mockResolvedValue({ success: true, data: [] });
  getAllSectionsMock.mockResolvedValue({ success: true, data: [] });
});

describe('D-01 — loadBankerWorkQueueData: dashboard (default) stays test-excluded, Loan Workflow opts in', () => {
  it('the default call (BankerShell dashboard/KPI path) excludes the known SYSTEM TEST deal entirely', async () => {
    getAllDealsMock.mockResolvedValue({ success: true, data: [dealRow(), realDealRow()] });

    const data = await loadBankerWorkQueueData(BANKER_ID);

    expect(data.deals.map((d) => d.id)).toEqual([REAL_DEAL_ID]);
    // Child queries must not even be scoped to the excluded test deal's id.
    const taskFilter = getAllTasksMock.mock.calls[0]![0].filter as string;
    expect(taskFilter).toContain(REAL_DEAL_ID);
    expect(taskFilter).not.toContain(KNOWN_TEST_DEAL_ID);
  });

  it('{ includeTestDeals: true } (Loan Workflow workbench path) includes it, flagged, with child records scoped to its id too', async () => {
    getAllDealsMock.mockResolvedValue({ success: true, data: [dealRow(), realDealRow()] });

    const data = await loadBankerWorkQueueData(BANKER_ID, { includeTestDeals: true });

    const ids = data.deals.map((d) => d.id).sort();
    expect(ids).toEqual([REAL_DEAL_ID, KNOWN_TEST_DEAL_ID].sort());
    const testDeal = data.deals.find((d) => d.id === KNOWN_TEST_DEAL_ID)!;
    expect(testDeal.isTestRecord).toBe(true);
    expect(testDeal.stage).toBe('Underwriting');
    const realDeal = data.deals.find((d) => d.id === REAL_DEAL_ID)!;
    expect(realDeal.isTestRecord).toBe(false);

    // Child queries (tasks/documents/memos/sections) are scoped to BOTH ids
    // once the test deal is included — it stays a fully first-class deal
    // for any surface that opts in, not a second-class partial record.
    const taskFilter = getAllTasksMock.mock.calls[0]![0].filter as string;
    expect(taskFilter).toContain(REAL_DEAL_ID);
    expect(taskFilter).toContain(KNOWN_TEST_DEAL_ID);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Remediation 2026-07-22 (Workstream G) — cross-view document-status
 * reconciliation.
 *
 * One shared raw cr664_documentchecklist row fixture, fed through the four
 * independent live loaders that back Deal Cockpit (dealDocumentQueries.ts),
 * Manager (managerQueries.ts), Team (teamQueries.ts), and the cross-deal
 * banker work queue (workQueueQueries.ts — added N-18, Production
 * Remediation Factory Arc Phase 2). Before Workstream G, each of the first
 * three carried its own copy of the outstanding/received/reviewed bucketing
 * rule, and none recognized a document already Waived or marked Not
 * Applicable via the Document Requirement workspace — such a row silently
 * counted as "outstanding" everywhere. The work-queue loader was fixed later
 * (N-18): it still hand-rolled the same rule inline instead of calling
 * `classifyLegacyDocumentStatus`, contradicting that module's own header
 * comment claiming every such surface already shared it. This test proves
 * all four now agree, for the exact same fixture, both on the ordinary
 * buckets AND on excluding governed-excused rows.
 */

const { getAllMock, loanDealsGetAllMock, dealTaskGetAllMock, creditMemoGetAllMock, creditMemoSectionGetAllMock } =
  vi.hoisted(() => ({
    getAllMock: vi.fn(),
    loanDealsGetAllMock: vi.fn(),
    dealTaskGetAllMock: vi.fn(),
    creditMemoGetAllMock: vi.fn(),
    creditMemoSectionGetAllMock: vi.fn(),
  }));

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: getAllMock },
}));
// Stub every other service managerQueries.ts / teamQueries.ts / workQueueQueries.ts import so their
// module graphs resolve without hitting the live SDK.
vi.mock('../generated/services/Cr664_bankersService', () => ({
  Cr664_bankersService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: loanDealsGetAllMock },
}));
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: dealTaskGetAllMock },
}));
vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: creditMemoGetAllMock },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: creditMemoSectionGetAllMock },
}));

import { loadDealDocuments } from './dealDocumentQueries';
import { loadManagerTeamDocuments } from '../manager/managerQueries';
import { loadTeamDocuments } from '../team/teamQueries';
import { loadBankerWorkQueueData } from '../banker/workQueueQueries';

/** One shared fixture: 5 rows spanning every bucket, including a waived and a not-applicable row. */
function sharedFixtureRows() {
  return [
    {
      cr664_documentchecklistid: 'doc-outstanding',
      cr664_documentname: 'Tax Returns',
      cr664_duedate: '2026-08-01',
      cr664_requestdate: undefined,
      cr664_receiveddate: undefined,
      cr664_reviewer: undefined,
      cr664_uploadstatus: false,
      modifiedon: '2026-06-01T00:00:00Z',
      _cr664_deal_value: 'deal-1',
      cr664_dealname: 'Acme Expansion',
    },
    {
      cr664_documentchecklistid: 'doc-received',
      cr664_documentname: 'Bank Statements',
      cr664_duedate: '2026-07-15',
      cr664_requestdate: '2026-06-15',
      cr664_receiveddate: '2026-06-20',
      cr664_reviewer: undefined,
      cr664_uploadstatus: false,
      modifiedon: '2026-06-20T00:00:00Z',
      _cr664_deal_value: 'deal-1',
      cr664_dealname: 'Acme Expansion',
    },
    {
      cr664_documentchecklistid: 'doc-reviewed',
      cr664_documentname: 'Articles of Incorporation',
      cr664_duedate: '2026-06-01',
      cr664_requestdate: '2026-05-01',
      cr664_receiveddate: '2026-05-10',
      cr664_reviewer: 'Jane Banker',
      cr664_uploadstatus: false,
      modifiedon: '2026-05-11T00:00:00Z',
      _cr664_deal_value: 'deal-1',
      cr664_dealname: 'Acme Expansion',
    },
    // Waived via cr664_waived (documentRequirementActions.ts's `waive`) — must never count as outstanding.
    {
      cr664_documentchecklistid: 'doc-waived',
      cr664_documentname: 'Personal Financial Statement',
      cr664_duedate: '2026-06-01',
      cr664_requestdate: undefined,
      cr664_receiveddate: undefined,
      cr664_reviewer: undefined,
      cr664_uploadstatus: false,
      modifiedon: '2026-06-05T00:00:00Z',
      _cr664_deal_value: 'deal-1',
      cr664_dealname: 'Acme Expansion',
      cr664_waived: true,
      cr664_requirementstatus: 788190105, // waived
    },
    // Marked Not Applicable via cr664_requirementstatus — must never count as outstanding.
    {
      cr664_documentchecklistid: 'doc-not-applicable',
      cr664_documentname: 'Environmental Phase I',
      cr664_duedate: '2026-06-01',
      cr664_requestdate: undefined,
      cr664_receiveddate: undefined,
      cr664_reviewer: undefined,
      cr664_uploadstatus: false,
      modifiedon: '2026-06-05T00:00:00Z',
      _cr664_deal_value: 'deal-1',
      cr664_dealname: 'Acme Expansion',
      cr664_requirementstatus: 788190106, // not_applicable
    },
  ];
}

/** loadBankerPipeline needs one authorized deal id to scope the work-queue's document fetch to. */
function pipelineDealFixture() {
  return [
    {
      cr664_loandealid: 'deal-1',
      cr664_dealname: 'Acme Expansion',
      statecode: 0,
      cr664_isterminalstatus: false,
    },
  ];
}

beforeEach(() => {
  getAllMock.mockReset();
  loanDealsGetAllMock.mockReset().mockResolvedValue({ success: true, data: pipelineDealFixture() });
  dealTaskGetAllMock.mockReset().mockResolvedValue({ success: true, data: [] });
  creditMemoGetAllMock.mockReset().mockResolvedValue({ success: true, data: [] });
  creditMemoSectionGetAllMock.mockReset().mockResolvedValue({ success: true, data: [] });
});

describe('Cross-view document status reconciliation (Deal Cockpit / Manager / Team / Work Queue)', () => {
  it('all four loaders bucket the same fixture identically: 1 outstanding, 1 received, 1 reviewed', async () => {
    getAllMock.mockResolvedValue({ success: true, data: sharedFixtureRows() });

    const cockpit = await loadDealDocuments('deal-1');
    const manager = await loadManagerTeamDocuments('team-1');
    const team = await loadTeamDocuments('team-1');
    const workQueue = await loadBankerWorkQueueData('banker-1');

    expect(cockpit.outstanding.map((d) => d.id)).toEqual(['doc-outstanding']);
    expect(cockpit.received.map((d) => d.id)).toEqual(['doc-received']);
    expect(cockpit.reviewed.map((d) => d.id)).toEqual(['doc-reviewed']);

    const managerByStatus = groupByStatus(manager);
    const teamByStatus = groupByStatus(team);
    expect(managerByStatus).toEqual({ outstanding: ['doc-outstanding'], received: ['doc-received'], reviewed: ['doc-reviewed'] });
    expect(teamByStatus).toEqual({ outstanding: ['doc-outstanding'], received: ['doc-received'], reviewed: ['doc-reviewed'] });

    // N-18: the work queue has no "reviewed" bucket (reviewed docs simply drop off the queue),
    // but outstanding/pendingReview must agree exactly with the other three surfaces' buckets.
    expect(workQueue.outstandingDocuments.map((d) => d.id)).toEqual(['doc-outstanding']);
    expect(workQueue.pendingReviewDocuments.map((d) => d.id)).toEqual(['doc-received']);
  });

  it('none of the four loaders count a waived or Not Applicable document as outstanding, received, or reviewed', async () => {
    getAllMock.mockResolvedValue({ success: true, data: sharedFixtureRows() });

    const cockpit = await loadDealDocuments('deal-1');
    const manager = await loadManagerTeamDocuments('team-1');
    const team = await loadTeamDocuments('team-1');
    const workQueue = await loadBankerWorkQueueData('banker-1');

    const cockpitIds = [...cockpit.outstanding, ...cockpit.received, ...cockpit.reviewed].map((d) => d.id);
    expect(cockpitIds).not.toContain('doc-waived');
    expect(cockpitIds).not.toContain('doc-not-applicable');

    const managerIds = manager.map((d) => d.id);
    expect(managerIds).not.toContain('doc-waived');
    expect(managerIds).not.toContain('doc-not-applicable');

    const teamIds = team.map((d) => d.id);
    expect(teamIds).not.toContain('doc-waived');
    expect(teamIds).not.toContain('doc-not-applicable');

    const workQueueIds = [...workQueue.outstandingDocuments, ...workQueue.pendingReviewDocuments].map((d) => d.id);
    expect(workQueueIds).not.toContain('doc-waived');
    expect(workQueueIds).not.toContain('doc-not-applicable');
  });
});

function groupByStatus(rows: ReadonlyArray<{ id: string; status: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = { outstanding: [], received: [], reviewed: [] };
  for (const r of rows) out[r.status].push(r.id);
  return out;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Remediation 2026-07-22 (Workstream G) — cross-view document-status
 * reconciliation.
 *
 * One shared raw cr664_documentchecklist row fixture, fed through the three
 * independent live loaders that back Deal Cockpit (dealDocumentQueries.ts),
 * Manager (managerQueries.ts), and Team (teamQueries.ts). Before this
 * remediation each of these carried its own copy of the outstanding/
 * received/reviewed bucketing rule, and none of them recognized a document
 * already Waived or marked Not Applicable via the Document Requirement
 * workspace — such a row silently counted as "outstanding" everywhere. This
 * test proves all three now agree, for the exact same fixture, both on the
 * ordinary buckets AND on excluding governed-excused rows.
 */

const { getAllMock } = vi.hoisted(() => ({ getAllMock: vi.fn() }));

vi.mock('../generated/services/Cr664_documentchecklistsService', () => ({
  Cr664_documentchecklistsService: { getAll: getAllMock },
}));
// Stub every other service managerQueries.ts / teamQueries.ts import so their
// module graphs resolve without hitting the live SDK.
vi.mock('../generated/services/Cr664_bankersService', () => ({
  Cr664_bankersService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_loandealsService', () => ({
  Cr664_loandealsService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_dealtask1sService', () => ({
  Cr664_dealtask1sService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemo1sService', () => ({
  Cr664_creditmemo1sService: { getAll: vi.fn() },
}));
vi.mock('../generated/services/Cr664_creditmemodraftsectionsService', () => ({
  Cr664_creditmemodraftsectionsService: { getAll: vi.fn() },
}));

import { loadDealDocuments } from './dealDocumentQueries';
import { loadManagerTeamDocuments } from '../manager/managerQueries';
import { loadTeamDocuments } from '../team/teamQueries';

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

beforeEach(() => {
  getAllMock.mockReset();
});

describe('Cross-view document status reconciliation (Deal Cockpit / Manager / Team)', () => {
  it('all three loaders bucket the same fixture identically: 1 outstanding, 1 received, 1 reviewed', async () => {
    getAllMock.mockResolvedValue({ success: true, data: sharedFixtureRows() });

    const cockpit = await loadDealDocuments('deal-1');
    const manager = await loadManagerTeamDocuments('team-1');
    const team = await loadTeamDocuments('team-1');

    expect(cockpit.outstanding.map((d) => d.id)).toEqual(['doc-outstanding']);
    expect(cockpit.received.map((d) => d.id)).toEqual(['doc-received']);
    expect(cockpit.reviewed.map((d) => d.id)).toEqual(['doc-reviewed']);

    const managerByStatus = groupByStatus(manager);
    const teamByStatus = groupByStatus(team);
    expect(managerByStatus).toEqual({ outstanding: ['doc-outstanding'], received: ['doc-received'], reviewed: ['doc-reviewed'] });
    expect(teamByStatus).toEqual({ outstanding: ['doc-outstanding'], received: ['doc-received'], reviewed: ['doc-reviewed'] });
  });

  it('none of the three loaders count a waived or Not Applicable document as outstanding, received, or reviewed', async () => {
    getAllMock.mockResolvedValue({ success: true, data: sharedFixtureRows() });

    const cockpit = await loadDealDocuments('deal-1');
    const manager = await loadManagerTeamDocuments('team-1');
    const team = await loadTeamDocuments('team-1');

    const cockpitIds = [...cockpit.outstanding, ...cockpit.received, ...cockpit.reviewed].map((d) => d.id);
    expect(cockpitIds).not.toContain('doc-waived');
    expect(cockpitIds).not.toContain('doc-not-applicable');

    const managerIds = manager.map((d) => d.id);
    expect(managerIds).not.toContain('doc-waived');
    expect(managerIds).not.toContain('doc-not-applicable');

    const teamIds = team.map((d) => d.id);
    expect(teamIds).not.toContain('doc-waived');
    expect(teamIds).not.toContain('doc-not-applicable');
  });
});

function groupByStatus(rows: ReadonlyArray<{ id: string; status: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = { outstanding: [], received: [], reviewed: [] };
  for (const r of rows) out[r.status].push(r.id);
  return out;
}

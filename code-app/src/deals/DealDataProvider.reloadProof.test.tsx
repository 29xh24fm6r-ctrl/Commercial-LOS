// @vitest-environment jsdom
/**
 * Final LOS Completion arc (146 Factory arc, Workstream 146-H) — stage-gate reload proof.
 *
 * The mission's exit bar requires "action -> governed durable write -> reload -> exact record
 * readback -> correct workflow consumption," not an assumption that a write's return value is
 * immediately reflected everywhere. This test proves DealDataProvider genuinely RE-FETCHES on
 * refresh() rather than serving stale/cached state — for each of the three distinct loading
 * mechanisms the provider uses (a plain query function, a store-factory method, and a bespoke
 * reconciling loader), so the proof covers the whole mechanism, not just one field.
 *
 *   1. loadDealCreditMemo (plain query function) -- proves Workstream 146-B's
 *      after-credit-memo-finalized reload genuinely re-reads cr664_creditmemo1.cr664_status.
 *   2. createDataverseCreditApprovalDecisionStore().listDecisionsForDeal (store-factory method)
 *      -- proves the Workstream C-style pattern (commitments/conditionVerifications/
 *      executedDocumentAttestations/bookingQcChecks/adverseActionRecords all follow this same
 *      shape).
 *   3. loadBoardingHandoffForDeal (bespoke loader) -- proves Workstream 146-E's servicing-owner
 *      assignment is picked up on the deal's next boardingHandoff reload (BOARDED:servicing_owner
 *      / BOARDED:boarded_loan_record both derive from this one call).
 *
 * Not exercised here (same mechanism as #1/#2, no new proof needed): tasks, documents, activity,
 * fundingAuthorization, commitments, conditionVerifications, executedDocumentAttestations,
 * bookingQcChecks, adverseActionRecords.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { DealDetail } from './dealQueries';

vi.mock('./dealTaskQueries', () => ({ loadDealTasks: vi.fn().mockResolvedValue({ open: [], completed: [] }) }));
vi.mock('./dealDocumentQueries', () => ({
  loadDealDocuments: vi.fn().mockResolvedValue({ outstanding: [], received: [], reviewed: [] }),
}));
vi.mock('./activityQueries', () => ({ loadDealActivity: vi.fn().mockResolvedValue([]) }));
vi.mock('../funding/fundingAuthorizationDataverseStore', () => ({
  createDataverseFundingAuthorizationStore: () => ({
    getCurrentRecordForDeal: vi.fn().mockResolvedValue({ success: true, record: undefined }),
  }),
}));
vi.mock('../commitment/commitmentRecordStore', () => ({
  createDataverseCommitmentStore: () => ({ listCommitmentsForDeal: vi.fn().mockResolvedValue({ success: true, commitments: [] }) }),
}));
vi.mock('../documentation/conditionVerificationStore', () => ({
  createDataverseConditionVerificationStore: () => ({ listVerificationsForDeal: vi.fn().mockResolvedValue({ success: true, records: [] }) }),
}));
vi.mock('../closing/executedDocumentAttestationStore', () => ({
  createDataverseExecutedDocumentAttestationStore: () => ({ listAttestationsForDeal: vi.fn().mockResolvedValue({ success: true, records: [] }) }),
}));
vi.mock('../closing/bookingQcCheckStore', () => ({
  createDataverseBookingQcCheckStore: () => ({ listChecksForDeal: vi.fn().mockResolvedValue({ success: true, records: [] }) }),
}));
vi.mock('../creditApproval/adverseActionRecordStore', () => ({
  createDataverseAdverseActionRecordStore: () => ({ listRecordsForDeal: vi.fn().mockResolvedValue({ success: true, records: [] }) }),
}));

const loadDealCreditMemoMock = vi.fn();
vi.mock('./creditMemoQueries', () => ({ loadDealCreditMemo: (...a: unknown[]) => loadDealCreditMemoMock(...a) }));

const listDecisionsForDealMock = vi.fn();
vi.mock('../creditApproval/creditApprovalDecisionStore', () => ({
  createDataverseCreditApprovalDecisionStore: () => ({ listDecisionsForDeal: (...a: unknown[]) => listDecisionsForDealMock(...a) }),
}));

const loadBoardingHandoffForDealMock = vi.fn();
vi.mock('./loadBoardingHandoffForDeal', () => ({ loadBoardingHandoffForDeal: (...a: unknown[]) => loadBoardingHandoffForDealMock(...a) }));

import { DealDataProvider, useDealData } from './DealDataProvider';

const baseDeal: DealDetail = {
  id: 'deal-1',
  name: 'Acme Working Capital',
  clientName: 'Acme Manufacturing, LLC',
  stage: 'Credit Approval',
  status: 'Active',
  amount: 1_000_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory',
  createdOn: '2026-01-15T00:00:00Z',
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

let capturedRefresh: ((key: string) => void) | undefined;

function Probe({ onCreditMemo, onDecisions, onBoardingHandoff }: {
  onCreditMemo: (v: unknown) => void;
  onDecisions: (v: unknown) => void;
  onBoardingHandoff: (v: unknown) => void;
}) {
  const ctx = useDealData();
  capturedRefresh = ctx.refresh as unknown as (key: string) => void;
  onCreditMemo(ctx.creditMemo);
  onDecisions(ctx.creditApprovalDecisions);
  onBoardingHandoff(ctx.boardingHandoff);
  return <div data-testid="probe-rendered" />;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DealDataProvider — stage-gate reload proof (146-H)', () => {
  it('after-credit-memo-finalized genuinely re-fetches loadDealCreditMemo; the new Final status supersedes the initial Draft snapshot', async () => {
    loadDealCreditMemoMock.mockResolvedValueOnce({
      memos: [{ id: 'm1', name: 'Memo v1', status: 'Draft', statusKey: 'draft', memoType: 'x', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }],
      sections: [],
    });
    listDecisionsForDealMock.mockResolvedValue({ success: true, decisions: [] });
    loadBoardingHandoffForDealMock.mockResolvedValue({ boardingCompleted: false, servicingOwnerAssigned: false, blockers: [] });

    const seen: unknown[] = [];
    render(
      <DealDataProvider deal={baseDeal}>
        <Probe onCreditMemo={(v) => seen.push(v)} onDecisions={() => undefined} onBoardingHandoff={() => undefined} />
      </DealDataProvider>,
    );

    await waitFor(() => expect(loadDealCreditMemoMock).toHaveBeenCalledTimes(1));
    await screen.findByTestId('probe-rendered');
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: { memos: Array<{ statusKey: string }> } };
      expect(last.kind).toBe('ready');
      expect(last.data?.memos[0]?.statusKey).toBe('draft');
    });

    // Simulate the governed write having landed: the NEXT read returns Final.
    loadDealCreditMemoMock.mockResolvedValueOnce({
      memos: [{ id: 'm1', name: 'Memo v1', status: 'Final', statusKey: 'final', memoType: 'x', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }],
      sections: [],
    });
    capturedRefresh?.('after-credit-memo-finalized');

    await waitFor(() => expect(loadDealCreditMemoMock).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: { memos: Array<{ statusKey: string }> } };
      expect(last.kind).toBe('ready');
      expect(last.data?.memos[0]?.statusKey).toBe('final');
    });
  });

  it('the creditApprovalDecisions key genuinely re-fetches the store, not a cached snapshot (store-factory pattern)', async () => {
    loadDealCreditMemoMock.mockResolvedValue({ memos: [], sections: [] });
    loadBoardingHandoffForDealMock.mockResolvedValue({ boardingCompleted: false, servicingOwnerAssigned: false, blockers: [] });
    listDecisionsForDealMock.mockResolvedValueOnce({ success: true, decisions: [] });

    const seen: unknown[] = [];
    render(
      <DealDataProvider deal={baseDeal}>
        <Probe onCreditMemo={() => undefined} onDecisions={(v) => seen.push(v)} onBoardingHandoff={() => undefined} />
      </DealDataProvider>,
    );

    await waitFor(() => expect(listDecisionsForDealMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: unknown[] };
      expect(last.kind).toBe('ready');
      expect(last.data).toEqual([]);
    });

    const approvedDecision = { decisionId: 'cad-1', dealId: baseDeal.id, status: 'APPROVED', authorityTier: 'committee' };
    listDecisionsForDealMock.mockResolvedValueOnce({ success: true, decisions: [approvedDecision] });
    capturedRefresh?.('after-credit-approval-decision-submitted');

    await waitFor(() => expect(listDecisionsForDealMock).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: unknown[] };
      expect(last.kind).toBe('ready');
      expect(last.data).toEqual([approvedDecision]);
    });
  });

  it('the boardingHandoff reload picks up a NEW servicing-owner assignment and clears the BOARDED:servicing_owner blocker (146-E)', async () => {
    loadDealCreditMemoMock.mockResolvedValue({ memos: [], sections: [] });
    listDecisionsForDealMock.mockResolvedValue({ success: true, decisions: [] });
    loadBoardingHandoffForDealMock.mockResolvedValueOnce({ boardingCompleted: true, servicingOwnerAssigned: false, blockers: ['No servicing owner assigned.'] });

    const seen: unknown[] = [];
    render(
      <DealDataProvider deal={baseDeal}>
        <Probe onCreditMemo={() => undefined} onDecisions={() => undefined} onBoardingHandoff={(v) => seen.push(v)} />
      </DealDataProvider>,
    );

    await waitFor(() => expect(loadBoardingHandoffForDealMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: { servicingOwnerAssigned: boolean } };
      expect(last.kind).toBe('ready');
      expect(last.data?.servicingOwnerAssigned).toBe(false);
    });

    // Simulate assignServicingOwnerWrite.ts having landed: the boarded-loan row now carries an owner.
    loadBoardingHandoffForDealMock.mockResolvedValueOnce({ boardingCompleted: true, servicingOwnerAssigned: true, blockers: [] });
    capturedRefresh?.('boardingHandoff');

    await waitFor(() => expect(loadBoardingHandoffForDealMock).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const last = seen[seen.length - 1] as { kind: string; data?: { servicingOwnerAssigned: boolean; blockers: readonly string[] } };
      expect(last.kind).toBe('ready');
      expect(last.data?.servicingOwnerAssigned).toBe(true);
      expect(last.data?.blockers).toEqual([]);
    });
  });
});

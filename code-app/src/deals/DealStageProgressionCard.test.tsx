// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';

// The real DealDataProvider transitively imports @microsoft/power-apps
// SDK service files that Vitest cannot resolve in jsdom. Stub the hook
// directly so the card can mount in isolation.
vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

// A real advance write goes through the SDK-backed transport/audit/timeline
// sinks; stub the write itself so the click-through regression test below
// stays hermetic while still exercising the real onAdvance/context-patch code.
vi.mock('../workflow/stageAdvanceWriteDependency', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../workflow/stageAdvanceWriteDependency')>();
  return {
    ...actual,
    advanceWorkflowStage: vi.fn(async () => ({ kind: 'advanced' as const, from: 'INTAKE' as const, to: 'UNDERWRITING' as const })),
  };
});
vi.mock('./generateDestinationStageWork', () => ({
  generateDestinationStageWork: vi.fn(async () => ({ stageCode: 'UNDERWRITING', created: [], skipped: [], failed: [] })),
}));

import { useDealData, type DealData } from './DealDataProvider';
import { DealStageProgressionCard } from './DealStageProgressionCard';

const useDealDataMock = vi.mocked(useDealData);

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-09-30T00:00:00Z',
  productType: 'RLOC',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, equipment.',
  createdOn: '2026-01-15T00:00:00Z',
  // 12 days before mid-May 2026 — under the stale-stage threshold
  // so the card renders clean and we exercise the schema-limitation
  // banner in isolation.
  stageEntryDate: '2026-05-01T00:00:00Z',
  isClosed: false,
};

function dealDataValue(): DealData {
  return {
    deal: baseDeal,
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: { outstanding: [], received: [], reviewed: [] } satisfies DealDocumentsResult,
    },
    creditMemo: {
      kind: 'ready',
      data: {
        memos: [
          {
            id: 'memo-1',
            name: 'Memo v1',
            status: 'Draft',
            statusKey: 'draft',
            memoType: 'Banker draft',
            version: 1,
            generatedAt: '2026-05-10T00:00:00Z',
            modifiedOn: '2026-05-10T00:00:00Z',
            borrowerSafe: false,
            textPreview: undefined,
          },
        ],
        sections: [],
      } satisfies CreditMemoData,
    },
    activity: { kind: 'ready', data: [] satisfies TimelineEvent[] },
    refresh: () => undefined,
  };
}

function renderCard() {
  useDealDataMock.mockReturnValue(dealDataValue());
  return render(<DealStageProgressionCard />);
}

describe('DealStageProgressionCard — Phase 28 schema-limitation banner', () => {
  it('renders the schema-limitation banner ("Advance Stage is not yet available")', () => {
    renderCard();
    expect(
      screen.getByText(/Advance Stage is not yet available/i),
    ).toBeInTheDocument();
  });

  it('schema-limitation detail names the missing pieces a future phase needs to add', () => {
    renderCard();
    expect(screen.getByText(/stage-reference/i)).toBeInTheDocument();
    expect(screen.getByText(/ordering|sequence/i)).toBeInTheDocument();
  });

  it('exposes NO Advance Stage / Move Stage / Promote / Submit button anywhere', () => {
    renderCard();
    const forbidden = /advance|move stage|promote|submit/i;
    const offending = screen
      .queryAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });

  it('still renders the Phase 27 eligibility surface (current stage, badge, next-action guidance)', () => {
    renderCard();
    expect(screen.getByText(/Current stage:\s*Underwriting/)).toBeInTheDocument();
    expect(screen.getByText(/Next action guidance/i)).toBeInTheDocument();
  });

  it('never renders the misleading phantom "Banker review still required" gate copy', () => {
    renderCard();
    expect(screen.queryByText(/Banker review still required/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Governed advance flow: with an authorized banker actor + armed + seeded, the
// card surfaces the current stage's GOVERNED exit criteria next to the action and
// gates the Advance button on the same fail-closed policy the write seam enforces.
// ---------------------------------------------------------------------------

const AVAILABLE = async () => ({
  available: true,
  banner: 'Advance Stage is available — the stage ordering is seeded and deterministic.',
  detail: 'seeded',
});

function intakeDealData(over: { documents?: DealDocumentsResult } = {}): DealData {
  return {
    deal: { ...baseDeal, stage: 'Intake' },
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: over.documents ?? { outstanding: [], received: [], reviewed: [] },
    },
    creditMemo: { kind: 'ready', data: { memos: [], sections: [] } satisfies CreditMemoData },
    activity: { kind: 'ready', data: [] satisfies TimelineEvent[] },
    refresh: () => undefined,
  };
}

function renderArmed(data: DealData) {
  useDealDataMock.mockReturnValue(data);
  return render(
    <DealStageProgressionCard
      stageAdvanceActor={{ systemUserId: 'sysuser-1', email: 'banker@oldglorybank.com' }}
      loadAvailability={AVAILABLE}
    />,
  );
}

describe('DealStageProgressionCard — governed advance flow (armed + seeded + authorized banker)', () => {
  it('surfaces the exact governed exit criteria and DISABLES Advance when a required INTAKE document is missing', async () => {
    renderArmed(intakeDealData());
    const btn = await screen.findByRole('button', { name: /Advance to Underwriting/i });
    // Fail-closed: missing the required INTAKE loan application blocks the move.
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('data-stage-advance-allowed')).toBe('false');
    // The exact required step is named, in the right place (Documents).
    const req = screen.getByText(/Provide required document: Loan application/i).closest('li')!;
    expect(req.getAttribute('data-req-where')).toBe('Documents');
    expect(req.getAttribute('data-req-severity')).toBe('blocked');
    // Log Activity is explicitly NOT a substitute for a governed requirement.
    expect(
      screen.getByText(/does not substitute for a required document, task, or field/i),
    ).toBeInTheDocument();
  });

  it('ENABLES Advance to Underwriting once the blocking exit criteria are met (incomplete tasks stay recommended, not blocking)', async () => {
    const documents: DealDocumentsResult = {
      outstanding: [],
      received: [
        {
          id: 'd1',
          name: 'Loan Application',
          dueDate: undefined,
          requestDate: undefined,
          receivedDate: '2026-07-01T00:00:00Z',
          reviewer: undefined,
          uploaded: true,
          modifiedOn: undefined,
          status: 'received',
        },
      ],
      reviewed: [],
    };
    renderArmed(intakeDealData({ documents }));
    const btn = await screen.findByRole('button', { name: /Advance to Underwriting/i });
    expect(btn).toBeEnabled();
    expect(btn.getAttribute('data-stage-advance-allowed')).toBe('true');
    // Incomplete intake tasks are shown as RECOMMENDED, not as hard blockers.
    expect(screen.getByText(/Recommended before advancing to Underwriting/i)).toBeInTheDocument();
    // No blocked-severity requirement remains.
    expect(document.querySelector('[data-req-severity="blocked"]')).toBeNull();
  });

  it('a verified advance patches the shared deal context with the new stage — the whole cockpit must not keep showing the pre-advance stage', async () => {
    const documents: DealDocumentsResult = {
      outstanding: [],
      received: [
        {
          id: 'd1',
          name: 'Loan Application',
          dueDate: undefined,
          requestDate: undefined,
          receivedDate: '2026-07-01T00:00:00Z',
          reviewer: undefined,
          uploaded: true,
          modifiedOn: undefined,
          status: 'received',
        },
      ],
      reviewed: [],
    };
    const applyVerifiedDealPatch = vi.fn();
    useDealDataMock.mockReturnValue({ ...intakeDealData({ documents }), applyVerifiedDealPatch });
    render(
      <DealStageProgressionCard
        stageAdvanceActor={{ systemUserId: 'sysuser-1', email: 'banker@oldglorybank.com' }}
        loadAvailability={AVAILABLE}
      />,
    );
    const btn = await screen.findByRole('button', { name: /Advance to Underwriting/i });
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    await waitFor(() =>
      expect(applyVerifiedDealPatch).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'Underwriting', stageEntryDate: expect.any(String) }),
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 2026-07-14 — real Dataverse credit-authority check (creditApprovalAuthority.ts). Exiting
// CREDIT_APPROVAL is proactively gated in the UI (not just after a rejected write), with safe,
// internals-free messaging.
// ---------------------------------------------------------------------------

function creditApprovalDealData(): DealData {
  return {
    deal: { ...baseDeal, stage: 'Credit Approval' },
    tasks: { kind: 'ready', data: { open: [], completed: [] } satisfies DealTasksResult },
    documents: {
      kind: 'ready',
      data: {
        outstanding: [],
        received: [
          { id: 'd1', name: 'Approval Evidence', dueDate: undefined, requestDate: undefined, receivedDate: '2026-07-01T00:00:00Z', reviewer: undefined, uploaded: true, modifiedOn: undefined, status: 'received' },
        ],
        reviewed: [],
      } satisfies DealDocumentsResult,
    },
    creditMemo: {
      kind: 'ready',
      data: {
        memos: [{ id: 'm1', name: 'Memo', status: 'Final', statusKey: 'final', memoType: 'standard', version: 1, generatedAt: '2026-07-01T00:00:00Z', modifiedOn: undefined, borrowerSafe: false, textPreview: undefined }],
        sections: [
          { id: 's1', sectionKey: 'executive_summary', sectionLabel: 'Executive Summary', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
          { id: 's2', sectionKey: 'repayment_analysis', sectionLabel: 'Repayment Analysis', reviewStatus: undefined, reviewStatusKey: undefined, lastGeneratedAt: undefined, modifiedOn: undefined, textPreview: undefined },
        ],
      } satisfies CreditMemoData,
    },
    activity: { kind: 'ready', data: [] satisfies TimelineEvent[] },
    refresh: () => undefined,
  };
}

describe('DealStageProgressionCard — credit-authority gate (Dataverse cr664_banker authority fields)', () => {
  it('DISABLES Advance to Commitment with a safe, internals-free reason when the banker has no credit-authority record', async () => {
    useDealDataMock.mockReturnValue(creditApprovalDealData());
    render(
      <DealStageProgressionCard
        stageAdvanceActor={{ systemUserId: 'sysuser-1', email: 'banker@oldglorybank.com' }}
        loadAvailability={AVAILABLE}
      />,
    );
    const btn = await screen.findByRole('button', { name: /Advance to Commitment/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('data-stage-advance-allowed')).toBe('false');
    expect(btn.getAttribute('title')).toMatch(/banker profile is not set up for approval actions/i);
    expect(btn.getAttribute('title')).not.toMatch(/cr664_|approvallimit|creditcommitteemember/i);
  });

  it('DISABLES Advance to Commitment for a banker who is not a credit committee member', async () => {
    useDealDataMock.mockReturnValue(creditApprovalDealData());
    render(
      <DealStageProgressionCard
        stageAdvanceActor={{
          systemUserId: 'sysuser-1',
          email: 'banker@oldglorybank.com',
          creditAuthority: { approvalLimit: 10_000_000, creditCommitteeMember: false, approvalOverrideAuthority: false },
        }}
        loadAvailability={AVAILABLE}
      />,
    );
    const btn = await screen.findByRole('button', { name: /Advance to Commitment/i });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute('title')).toMatch(/credit committee authority/i);
  });

  it('ENABLES Advance to Commitment for a credit committee member within their approval limit', async () => {
    useDealDataMock.mockReturnValue(creditApprovalDealData());
    render(
      <DealStageProgressionCard
        stageAdvanceActor={{
          systemUserId: 'sysuser-1',
          email: 'banker@oldglorybank.com',
          creditAuthority: { approvalLimit: 10_000_000, creditCommitteeMember: true, approvalOverrideAuthority: false },
        }}
        loadAvailability={AVAILABLE}
      />,
    );
    const btn = await screen.findByRole('button', { name: /Advance to Commitment/i });
    expect(btn).toBeEnabled();
    expect(btn.getAttribute('data-stage-advance-allowed')).toBe('true');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { BankerWorkQueueData } from './workQueueQueries';
import type { PipelineDeal } from './dealQueries';

/**
 * BankerShell's post-create confirm-then-navigate flow.
 *
 * BankerNewDealCreate's onCreated contract carries the exact createdDealId
 * (never a fire-and-forget no-arg callback). BankerShell must: refresh its
 * own data + PersonalPipeline, confirm the EXACT id appears in a fresh
 * loadBankerPipeline read via a small bounded retry (never trusting the
 * first, possibly-stale, read), navigate to /deals/{createdDealId} only once
 * confirmed, and surface an honest visible message (never a silent no-op,
 * never a fallback to some other deal) when confirmation times out.
 *
 * BankerNewDealCreate and PersonalPipeline are stubbed here so this file
 * stays scoped to BankerShell's own confirm/navigate logic rather than
 * re-driving the full 3-step create wizard (already covered by
 * BankerNewDealCreate.test.tsx) or PersonalPipeline's own board rendering
 * (already covered by PersonalPipeline.test.tsx).
 */

vi.mock('./workQueueQueries', () => ({
  loadBankerWorkQueueData: vi.fn(),
}));
vi.mock('./BankerContext', () => ({
  useBanker: vi.fn(),
  BankerIdentityProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../generated/services/Office365OutlookService', () => ({
  Office365OutlookService: { SendEmailV2: vi.fn() },
}));
vi.mock('../deals/logActivityActions', () => ({ logActivity: vi.fn() }));
vi.mock('./PersonalActivitySummary', () => ({
  PersonalActivitySummary: () => <div data-testid="card-personal-activity-summary" />,
}));
vi.mock('./BankerMorningCatchUp', () => ({
  BankerMorningCatchUp: () => <div data-testid="card-morning-catchup" />,
}));
vi.mock('./BankerAutopilotRollup', () => ({
  BankerAutopilotRollup: () => <div data-testid="card-autopilot-rollup" />,
}));
vi.mock('./MyWorkQueue', () => ({
  MyWorkQueue: () => <div data-testid="card-work-queue" />,
}));
vi.mock('./RelationshipMemory', () => ({
  RelationshipMemory: () => <div data-testid="card-relationship-memory" />,
}));
vi.mock('./BankerActivityFeed', () => ({
  BankerActivityFeed: () => <div data-testid="card-activity-feed" />,
}));
vi.mock('./BankerDueDiligenceView', () => ({
  BankerDueDiligenceView: () => <div data-testid="card-due-diligence" />,
}));
vi.mock('../crm/workspace/CrmHubWorkspace', () => ({
  CrmHubWorkspace: () => <div data-testid="crm-hub-workspace" />,
}));
vi.mock('./BankerLoanWorkflowWorkbench', () => ({
  BankerLoanWorkflowWorkbench: () => <div data-testid="loan-workbench" />,
}));
vi.mock('../portfolioBoarding/ExistingPortfolioLoansPanel', () => ({
  ExistingPortfolioLoansPanel: () => <div data-testid="existing-portfolio-panel" />,
}));
vi.mock('./PersonalPipeline', () => ({
  PersonalPipeline: () => <div data-testid="personal-pipeline-stub" />,
}));

const { loadBankerPipelineMock } = vi.hoisted(() => ({
  loadBankerPipelineMock: vi.fn(),
}));
vi.mock('./dealQueries', () => ({
  loadBankerPipeline: loadBankerPipelineMock,
}));

const { onCreatedRef } = vi.hoisted(() => ({
  onCreatedRef: { current: undefined as ((id: string) => Promise<void> | void) | undefined },
}));
vi.mock('./BankerNewDealCreate', () => ({
  BankerNewDealCreate: ({ onCreated }: { onCreated?: (id: string) => Promise<void> | void }) => {
    onCreatedRef.current = onCreated;
    return (
      <button
        type="button"
        data-testid="stub-create-deal"
        onClick={() => {
          void onCreated?.('deal-new-1');
        }}
      >
        stub create
      </button>
    );
  },
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { loadBankerWorkQueueData } from './workQueueQueries';
import { useBanker } from './BankerContext';
import { BankerShell } from './BankerShell';

const loadMock = vi.mocked(loadBankerWorkQueueData);
const useBankerMock = vi.mocked(useBanker);

function emptyData(): BankerWorkQueueData {
  return {
    deals: [],
    tasks: [],
    outstandingDocuments: [],
    pendingReviewDocuments: [],
    memos: [],
    memoSections: [],
  };
}

function pipelineDeal(id: string): PipelineDeal {
  return {
    id,
    name: `Deal ${id}`,
    clientName: undefined,
    stage: 'Intake',
    status: 'Open',
    amount: undefined,
    targetCloseDate: undefined,
    lastActivityOn: undefined,
    stageEntryDate: undefined,
    isClosed: false,
    collateralSummary: undefined,
  };
}

function setUpBanker() {
  useBankerMock.mockReturnValue({
    bankerId: 'banker-1',
    fullName: 'Matt Paller',
    email: 'mpaller@oldglorybank.com',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
    roleType: undefined,
    creditAuthority: { approvalLimit: undefined, creditCommitteeMember: undefined, approvalOverrideAuthority: undefined },
  });
}

function renderShell() {
  return render(
    <MemoryRouter>
      <BankerShell workspaceName="Banker Workspace" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadMock.mockReset();
  useBankerMock.mockReset();
  loadBankerPipelineMock.mockReset();
  navigateMock.mockReset();
  onCreatedRef.current = undefined;
  setUpBanker();
  loadMock.mockResolvedValue(emptyData());
  // Permanent safe default: any test (or code path within a test) that invokes the post-create
  // readback without its own explicit mock resolution gets a well-shaped empty array rather than
  // `undefined` — matching what a genuinely-empty live pipeline read returns. Individual tests below
  // still override this with `mockResolvedValueOnce`/`mockResolvedValue` for their own scenarios.
  loadBankerPipelineMock.mockResolvedValue([]);
});

async function openActiveDealsTab() {
  fireEvent.click(screen.getByRole('button', { name: /^Active Deals$/i }));
  await screen.findByTestId('stub-create-deal');
}

describe('BankerShell — post-create confirm-then-navigate', () => {
  it('navigates to the exact created deal once the readback confirms it (first read already has it)', async () => {
    loadBankerPipelineMock.mockResolvedValue([pipelineDeal('deal-new-1')]);
    renderShell();
    await openActiveDealsTab();

    fireEvent.click(screen.getByTestId('stub-create-deal'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/deals/deal-new-1'));
    expect(loadBankerPipelineMock).toHaveBeenCalledWith('banker-1');
  });

  it('retries past a stale first read (missing the new id) and navigates once a later read confirms it', async () => {
    loadBankerPipelineMock
      .mockResolvedValueOnce([pipelineDeal('deal-1')]) // stale — the new deal isn't here yet
      .mockResolvedValueOnce([pipelineDeal('deal-1'), pipelineDeal('deal-new-1')]);
    renderShell();
    await openActiveDealsTab();

    fireEvent.click(screen.getByTestId('stub-create-deal'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/deals/deal-new-1'), { timeout: 5000 });
    expect(loadBankerPipelineMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('never navigates to a prior/existing deal when the created id cannot be confirmed, and shows an honest timeout message', async () => {
    // Every read returns only OTHER, pre-existing deals — the created id never appears.
    loadBankerPipelineMock.mockResolvedValue([pipelineDeal('deal-1'), pipelineDeal('deal-2')]);
    renderShell();
    await openActiveDealsTab();

    fireEvent.click(screen.getByTestId('stub-create-deal'));

    await waitFor(
      () => expect(screen.getByText(/could not yet be confirmed in your pipeline/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    // Never navigated at all — in particular never to one of the other, unrelated deals.
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/deal-new-1/)).toBeInTheDocument();
    // The banker stays on the form — it's still on screen, not swapped out.
    expect(screen.getByTestId('stub-create-deal')).toBeInTheDocument();
  });

  it('refreshes shell data (reload) as soon as a deal is created, independent of confirmation outcome', async () => {
    loadBankerPipelineMock.mockResolvedValue([pipelineDeal('deal-1'), pipelineDeal('deal-2')]); // never confirms
    renderShell();
    await openActiveDealsTab();
    loadMock.mockClear(); // clear the initial mount-time load so we isolate the post-create one

    fireEvent.click(screen.getByTestId('stub-create-deal'));

    await waitFor(() => expect(loadMock).toHaveBeenCalledWith('banker-1'));
  });

  it('unmounting while the post-create confirmation retry is pending produces no unhandled rejection, no post-unmount state update, and no false confirmation', async () => {
    // The retry's first attempt is left pending (never auto-resolved by mockResolvedValue) so we
    // control exactly when it settles — after this shell has already unmounted.
    let resolveFirstAttempt: ((deals: PipelineDeal[]) => void) | undefined;
    const firstAttempt = new Promise<PipelineDeal[]>((resolve) => {
      resolveFirstAttempt = resolve;
    });
    loadBankerPipelineMock.mockReturnValueOnce(firstAttempt);

    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      const { unmount } = renderShell();
      await openActiveDealsTab();

      fireEvent.click(screen.getByTestId('stub-create-deal'));
      // Wait until onDealCreated has reached the readback retry's first attempt (still pending on
      // our controlled promise) before unmounting mid-flight.
      await waitFor(() => expect(loadBankerPipelineMock).toHaveBeenCalledTimes(1));

      unmount();

      // Settle the retry's in-flight attempt — with a result that WOULD confirm the created deal
      // — only after the component is gone, so the continuation (isSatisfied check, setState,
      // navigate) runs entirely post-unmount.
      resolveFirstAttempt?.([pipelineDeal('deal-new-1')]);

      // Flush the async continuation (microtasks + the mocked dynamic import boundary).
      await new Promise((resolve) => setTimeout(resolve, 50));

      // No false confirmation / navigation after unmount, and nothing escaped as an unhandled
      // rejection.
      expect(navigateMock).not.toHaveBeenCalled();
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });

  it('a rejected readback retry (thrown attempt) is treated as an unconfirmed readback, never an unhandled rejection', async () => {
    loadBankerPipelineMock.mockReset();
    loadBankerPipelineMock.mockRejectedValue(new Error('network error'));

    const rejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandledRejection);

    try {
      renderShell();
      await openActiveDealsTab();

      fireEvent.click(screen.getByTestId('stub-create-deal'));

      await waitFor(
        () => expect(screen.getByText(/could not yet be confirmed in your pipeline/i)).toBeInTheDocument(),
        { timeout: 5000 },
      );
      expect(navigateMock).not.toHaveBeenCalled();
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
    }
  });
});

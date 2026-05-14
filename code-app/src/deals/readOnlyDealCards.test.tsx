// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';

/**
 * Phase 36: verify the four write-capable deal cards render WITHOUT
 * any banker write surfaces when their new `readOnly` prop is set.
 * The manager deal workspace mounts each of these in read-only mode.
 *
 * useDealData is stubbed so the cards mount without firing the real
 * deal queries. The Banker context is intentionally NOT provided —
 * useOptionalBanker must return null and the cards must still mount
 * (no useBanker() throw) and must still render their read-only UI.
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

// The four deal cards transitively import generated service modules
// that the test runtime cannot resolve (the @microsoft/power-apps
// package's data subpath is broken in Vitest). Stub each action +
// query module at the path level so the chain short-circuits before
// the SDK is reached. We never invoke these in readOnly mode anyway —
// readOnly blocks the trigger button and the modal mount.
vi.mock('./dealTaskActions', () => ({ completeTask: vi.fn() }));
vi.mock('./documentActions', () => ({ requestDocument: vi.fn() }));
// Phase 62: the deal-card chain now imports sendDocumentRequestEmail
// transitively (Phase 61). Mock it so the SDK service chain it pulls
// in does not load during the test.
vi.mock('./sendDocumentRequestEmail', () => ({
  sendDocumentRequestEmail: vi.fn(),
}));
vi.mock('./creditMemoActions', () => ({ saveCreditMemoDraft: vi.fn() }));
vi.mock('./creditMemoQueries', () => ({}));
vi.mock('./activityQueries', () => ({}));
vi.mock('./dealTaskQueries', () => ({}));
vi.mock('./dealDocumentQueries', () => ({}));
vi.mock('./CompleteTaskModal', () => ({ CompleteTaskModal: () => null }));
vi.mock('./RequestDocumentModal', () => ({ RequestDocumentModal: () => null }));
vi.mock('./CreditMemoDraftModal', () => ({ CreditMemoDraftModal: () => null }));
vi.mock('./DraftBorrowerUpdateModal', () => ({ DraftBorrowerUpdateModal: () => null }));
// useBootstrap is consumed by CreditMemo. Stub the module path so the
// bootstrap chain doesn't fire either.
vi.mock('../bootstrap/BootstrapContext', () => ({
  useBootstrap: () => ({
    upn: 'm@bank.test',
    fullName: 'M. Paller',
    entraObjectId: 'oid',
    profileId: 'p',
    profileName: 'banker',
    workspaceId: 'ws-1',
    workspaceName: 'banker-ws',
    route: '/banker',
  }),
}));

import { useDealData, type DealData } from './DealDataProvider';
import { DealTasks } from './DealTasks';
import { DealDocuments } from './DealDocuments';
import { CreditMemo } from './CreditMemo';
import { BorrowerCommunication } from './BorrowerCommunication';

const useDealDataMock = vi.mocked(useDealData);

const baseDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Working Capital',
  clientName: 'Acme',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
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

function dealData(): DealData {
  return {
    deal: baseDeal,
    tasks: {
      kind: 'ready',
      data: {
        open: [
          {
            id: 't-1',
            title: 'Confirm collateral',
            completed: false,
            dueDate: '2026-06-01T00:00:00Z',
            assigneeName: 'M. Paller',
            modifiedOn: undefined,
          },
        ],
        completed: [],
      } satisfies DealTasksResult,
    },
    documents: {
      kind: 'ready',
      data: {
        outstanding: [
          {
            id: 'd-1',
            name: 'Personal Financial Statement',
            dueDate: '2026-06-01T00:00:00Z',
            requestDate: undefined,
            receivedDate: undefined,
            reviewer: undefined,
            uploaded: false,
            modifiedOn: undefined,
            status: 'outstanding',
          },
        ],
        received: [],
        reviewed: [],
      } satisfies DealDocumentsResult,
    },
    creditMemo: {
      kind: 'ready',
      data: { memos: [], sections: [] } satisfies CreditMemoData,
    },
    activity: { kind: 'ready', data: [] satisfies TimelineEvent[] },
    refresh: () => undefined,
  };
}

describe('Phase 36 — read-only deal cards (no banker provider mounted)', () => {
  it('DealTasks renders the task list but NO Complete button when readOnly', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<DealTasks readOnly />);
    // The task row is visible …
    expect(screen.getByText(/Confirm collateral/i)).toBeInTheDocument();
    // … but no Complete button is rendered.
    expect(
      screen.queryAllByRole('button', { name: /complete/i }),
    ).toEqual([]);
    // And no "Complete disabled" banner appears.
    expect(screen.queryByText(/complete disabled/i)).not.toBeInTheDocument();
  });

  it('DealDocuments renders the document list but NO Request button when readOnly', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<DealDocuments readOnly />);
    expect(
      screen.getByText(/Personal Financial Statement/i),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button', { name: /request/i }),
    ).toEqual([]);
    expect(screen.queryByText(/request disabled/i)).not.toBeInTheDocument();
  });

  it('CreditMemo renders the card body but NO Generate Draft Preview button when readOnly', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<CreditMemo readOnly />);
    // The card mounts (heading present) …
    expect(
      screen.getByRole('heading', { name: /credit memo/i }),
    ).toBeInTheDocument();
    // … but no Generate Draft Preview button.
    expect(
      screen.queryAllByRole('button', { name: /generate.*draft.*preview/i }),
    ).toEqual([]);
    expect(screen.queryByText(/save disabled/i)).not.toBeInTheDocument();
  });

  it('BorrowerCommunication renders the card body but NO Draft Borrower Update button when readOnly', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<BorrowerCommunication readOnly />);
    expect(
      screen.getByRole('heading', { name: /borrower communication/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole('button', { name: /draft.*borrower.*update/i }),
    ).toEqual([]);
  });

  it('the four read-only cards together expose ZERO write/promote/finalize/send buttons', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(
      <>
        <DealTasks readOnly />
        <DealDocuments readOnly />
        <CreditMemo readOnly />
        <BorrowerCommunication readOnly />
      </>,
    );
    const forbidden =
      /complete|request|generate|save|finalize|export|submit|send|draft|promote|advance/i;
    const offending = screen
      .queryAllByRole('button')
      .filter((b) => forbidden.test(b.textContent ?? ''));
    expect(offending).toEqual([]);
  });
});

// Banker behavior is preserved because (a) `readOnly` defaults to
// false, (b) useOptionalBanker returns the banker identity when a
// BankerProvider is mounted (existing banker tests cover that path),
// and (c) the 289 pre-existing tests cover every existing banker
// write surface. Re-asserting the banker path here would require
// rebuilding the SDK mock stack with a useBanker stub — it's covered
// elsewhere.

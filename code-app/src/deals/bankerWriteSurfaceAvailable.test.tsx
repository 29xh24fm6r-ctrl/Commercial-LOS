// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DealDetail } from './dealQueries';
import type { DealTasksResult } from './dealTaskQueries';
import type { DealDocumentsResult } from './dealDocumentQueries';
import type { CreditMemoData } from './creditMemoQueries';
import type { TimelineEvent } from './activityQueries';

/**
 * Phase 39: positive complement to Phase 36's readOnlyDealCards
 * regression. Verifies the four write-capable deal cards DO render
 * their banker write surfaces when:
 *   - useOptionalBanker returns a banker identity with systemUserId
 *   - the card's readOnly prop is omitted (default false)
 *
 * Phase 36 pinned the read-only case; this file pins the write case
 * so neither a too-aggressive readOnly default nor an accidental
 * gate suppression can break banker UX without a loud test failure.
 *
 * Mock surface mirrors readOnlyDealCards.test.tsx (same SDK chain
 * short-circuit).
 */

vi.mock('./DealDataProvider', () => ({
  useDealData: vi.fn(),
}));

vi.mock('./dealTaskActions', () => ({ completeTask: vi.fn() }));
vi.mock('./documentActions', () => ({ requestDocument: vi.fn() }));
// Phase 62: the deal-card chain now imports sendDocumentRequestEmail
// transitively (Phase 61). Mock it so the SDK service chain it pulls
// in does not load during the test (the SDK has a broken internal
// import unrelated to the action's contract).
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
vi.mock('./DraftBorrowerUpdateModal', () => ({
  DraftBorrowerUpdateModal: () => null,
}));
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

// Provide a banker identity via the BankerContext module surface. The
// cards consume useOptionalBanker; this stub returns a full identity.
vi.mock('../banker/BankerContext', () => ({
  useBanker: () => ({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
  }),
  useOptionalBanker: () => ({
    bankerId: 'banker-1',
    fullName: 'M. Paller',
    email: 'm@bank.test',
    systemUserId: 'sys-1',
    writeDisabledReason: undefined,
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

describe('Phase 39 — banker write surfaces are reachable in banker mode (positive case)', () => {
  it('DealTasks renders a Complete button for each open task when readOnly is omitted', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<DealTasks />);
    expect(
      screen.getAllByRole('button', { name: /complete task/i }).length,
    ).toBeGreaterThan(0);
  });

  it('DealDocuments renders a Request button for each outstanding document when readOnly is omitted', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<DealDocuments />);
    expect(
      screen.getAllByRole('button', { name: /request document/i }).length,
    ).toBeGreaterThan(0);
  });

  it('CreditMemo renders the Generate Draft Preview button when readOnly is omitted', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<CreditMemo />);
    expect(
      screen.getByRole('button', {
        name: /generate credit memo draft preview/i,
      }),
    ).toBeInTheDocument();
  });

  it('BorrowerCommunication renders the Draft Borrower Update button when readOnly is omitted', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(<BorrowerCommunication />);
    expect(
      screen.getByRole('button', { name: /draft borrower update/i }),
    ).toBeInTheDocument();
  });

  it('all four banker write surfaces are simultaneously reachable when banker context is present', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(
      <>
        <DealTasks />
        <DealDocuments />
        <CreditMemo />
        <BorrowerCommunication />
      </>,
    );
    // Each of the four write triggers must be reachable. We assert
    // by aria-label so a future visual copy change doesn't break the
    // security regression test.
    expect(
      screen.getAllByRole('button', { name: /complete task/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /request document/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: /generate credit memo draft preview/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /draft borrower update/i }),
    ).toBeInTheDocument();
  });
});

describe('Phase 39 — explicit readOnly={false} also keeps the write surfaces reachable', () => {
  it('passing readOnly={false} is equivalent to omitting the prop', () => {
    useDealDataMock.mockReturnValue(dealData());
    render(
      <>
        <DealTasks readOnly={false} />
        <DealDocuments readOnly={false} />
        <CreditMemo readOnly={false} />
        <BorrowerCommunication readOnly={false} />
      </>,
    );
    expect(
      screen.getAllByRole('button', { name: /complete task/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: /request document/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: /generate credit memo draft preview/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /draft borrower update/i }),
    ).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FundingAuthorizationStorageDeps } from '../funding/fundingAuthorizationStorage';
import type { FundingAuthorizationRecord } from '../funding/fundingAuthorizationTypes';

/**
 * PR 112 — DealFundingAuthorizationPanel now loads/writes through
 * `createDataverseFundingAuthorizationStore()` (see fundingAuthorizationDataverseStore.ts) instead
 * of an in-memory reference store. This file mocks that factory with a hand-rolled fake whose
 * backing `Map` lives at MODULE scope (outside any component instance) — the same durability
 * relationship the real Dataverse-backed store has to the component tree — so tests can genuinely
 * exercise "does a fresh component instance see what a prior instance wrote," not merely assert
 * against React state.
 */

const { durableRows, createStoreMock, injectedUpdateFailure } = vi.hoisted(() => {
  const durableRows = new Map<string, FundingAuthorizationRecord>();
  const injectedUpdateFailure: { message: string | undefined } = { message: undefined };
  return { durableRows, createStoreMock: vi.fn(), injectedUpdateFailure };
});

// Every call to createDataverseFundingAuthorizationStore() (including the one `useRef` freezes at
// mount time) reads the SAME module-scoped `durableRows` map and `injectedUpdateFailure` flag, so a
// test can flip failure-injection AFTER a component already mounted and still have that component's
// frozen store instance observe it — exactly like a real Dataverse outage would affect an
// already-constructed adapter mid-session.
function fakeDurableStore(): FundingAuthorizationStorageDeps {
  return {
    createRecord: async (record) => {
      durableRows.set(record.recordId, record);
      return { success: true };
    },
    updateRecord: async (record) => {
      if (injectedUpdateFailure.message) return { success: false, error: injectedUpdateFailure.message };
      if (!durableRows.has(record.recordId)) return { success: false, error: 'No existing record to update.' };
      durableRows.set(record.recordId, record);
      return { success: true };
    },
    getCurrentRecordForDeal: async (dealId) => {
      const forDeal = [...durableRows.values()].filter((r) => r.dealId === dealId);
      const supersededIds = new Set(forDeal.map((r) => r.supersedesRecordId).filter((id): id is string => Boolean(id)));
      const current = forDeal.filter((r) => !supersededIds.has(r.recordId));
      const latest = current.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
      return { success: true, record: latest };
    },
  };
}

vi.mock('../funding/fundingAuthorizationDataverseStore', () => ({
  createDataverseFundingAuthorizationStore: createStoreMock,
}));

import { DealFundingAuthorizationPanel } from './DealFundingAuthorizationPanel';
import type { DealDetail } from './dealQueries';

function baseDeal(overrides: Partial<DealDetail> = {}): DealDetail {
  return {
    id: 'deal-1',
    name: 'Acme Working Capital',
    clientName: 'Acme Corp',
    stage: 'Closing & Funding',
    status: 'Open',
    amount: 500_000,
    bankerName: 'M. Paller',
    targetCloseDate: '2026-08-01T00:00:00Z',
    productType: 'RLOC',
    loanStructure: 'Senior Secured',
    customerType: 'C&I',
    industry: 'Manufacturing',
    guarantorStructure: 'One PG',
    pricingType: 'Floating',
    spreadIndex: 'SOFR',
    spreadMargin: 275,
    collateralSummary: 'A/R and Inventory',
    createdOn: '2026-07-01T00:00:00Z',
    stageEntryDate: '2026-07-20T00:00:00Z',
    isClosed: false,
    ...overrides,
  };
}

async function waitForInitialLoad() {
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
}

beforeEach(() => {
  durableRows.clear();
  injectedUpdateFailure.message = undefined;
  createStoreMock.mockReset();
  createStoreMock.mockImplementation(fakeDurableStore);
});

describe('DealFundingAuthorizationPanel — durable Dataverse-backed store', () => {
  it('shows a loading state while the durable read is in flight, then the empty request form', async () => {
    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
    await waitForInitialLoad();
    expect(screen.getByText(/no funding has been requested for this deal yet/i)).toBeInTheDocument();
    expect(document.querySelector('[data-funding-request-form]')).not.toBeNull();
  });

  // PR A remediation — a raw transport-failure string used to render verbatim; now only the
  // mapped, business-safe message reaches the banker.
  it('surfaces an honest, visible error when the durable read fails — never the raw transport text', async () => {
    createStoreMock.mockImplementation(() => ({
      createRecord: async () => ({ success: true }),
      updateRecord: async () => ({ success: true }),
      getCurrentRecordForDeal: async () => ({ success: false, error: 'Dataverse read timed out.' }),
    }));
    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save that action/i));
    expect(screen.getByRole('alert')).not.toHaveTextContent(/dataverse read timed out/i);
    expect(document.querySelector('[data-funding-request-form]')).toBeNull();
  });

  it('surfaces an honest, visible error when the durable read rejects — never the raw exception text', async () => {
    createStoreMock.mockImplementation(() => ({
      createRecord: async () => ({ success: true }),
      updateRecord: async () => ({ success: true }),
      getCurrentRecordForDeal: async () => {
        throw new Error('SDK boom');
      },
    }));
    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save that action/i));
    expect(screen.getByRole('alert')).not.toHaveTextContent(/sdk boom/i);
  });

  it('requesting funding persists through the durable store and the request form disappears', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />,
    );
    await waitForInitialLoad();
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '250000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));

    await waitFor(() => expect(container.querySelector('[data-funding-request-form]')).toBeNull());
    expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING');
    expect(durableRows.size).toBe(1);
  });

  it('the same requester cannot approve their own request (self-approval prevention holds against the durable store)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="banker@bank.test" />,
    );
    await waitForInitialLoad();
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '100000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    expect(screen.getByText(/you requested this funding and cannot also approve it/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled();
  });

  it('a distinct approver can approve below the dual-control threshold and reaches APPROVED', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="requester@bank.test" />,
    );
    await waitForInitialLoad();
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '100000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    rerender(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="approver@bank.test" />);
    await waitForInitialLoad();
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('APPROVED'));
  });

  it('a failed approval write surfaces a visible action error instead of silently doing nothing', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="requester@bank.test" />,
    );
    await waitForInitialLoad();
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '100000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    // Inject a failure into the SAME durable store instance the mounted component already froze
    // into its useRef, simulating an approval write that fails at the durable layer (e.g. a dropped
    // connection) after the initial read already succeeded.
    injectedUpdateFailure.message = 'Row lock timeout.';
    rerender(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="approver@bank.test" />);
    await waitForInitialLoad();
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    // PR A remediation — the raw transport error ("Row lock timeout.") must never reach the
    // banker; only the mapped, business-safe message does.
    await waitFor(() => expect(screen.getByText(/couldn't save that action/i)).toBeInTheDocument());
    expect(screen.queryByText(/row lock timeout/i)).toBeNull();
    // Status must NOT have silently advanced to APPROVED on a failed write.
    expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING');
  });

  it('records survive a component remount because the durable store persists outside the component instance', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="requester@bank.test" />,
    );
    await waitForInitialLoad();
    await user.type(container.querySelector('#funding-request-amount') as HTMLInputElement, '75000');
    await user.click(screen.getByRole('button', { name: /request funding/i }));
    await waitFor(() => expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING'));

    unmount();
    expect(durableRows.size).toBe(1); // the durable backing store, not React state, still has it

    render(<DealFundingAuthorizationPanel deal={baseDeal()} authorized={true} actorEmail="approver@bank.test" />);
    await waitForInitialLoad();
    // The freshly-mounted instance loaded the SAME record a prior instance created — never an
    // empty "no funding requested" state after remount.
    expect(screen.queryByText(/no funding has been requested for this deal yet/i)).toBeNull();
    expect(screen.getByTestId('funding-status')).toHaveTextContent('PENDING');
  });

  it('disables the request form entirely when the actor is not authorized', async () => {
    const { container } = render(
      <DealFundingAuthorizationPanel deal={baseDeal()} authorized={false} actorEmail={undefined} />,
    );
    await waitForInitialLoad();
    expect((container.querySelector('#funding-request-amount') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /request funding/i })).toBeDisabled();
  });
});

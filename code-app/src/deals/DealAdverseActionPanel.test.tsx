// @vitest-environment jsdom
/**
 * Factory mission PR B — regression coverage for the async-unmount fix this panel was missing
 * relative to its five final-arc siblings (Credit Approval Decision, Commitment, Condition
 * Verification, Executed Document Attestation, Booking QC), all fixed by PR #148. `load()`'s
 * `.then()`/`.catch()` callbacks must never touch state after this panel has unmounted.
 *
 * Uses the same `withTornDownWindow()` reproduction PR #148 established: after unmounting,
 * `globalThis.window` is deleted (simulating Vitest's real per-file JSDOM teardown) before the
 * pending promise is settled, reproducing the exact `ReferenceError: window is not defined` this
 * class of bug throws from React's `dispatchSetState`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const listRecordsForDealMock = vi.fn();
vi.mock('../creditApproval/adverseActionRecordStore', () => ({
  createDataverseAdverseActionRecordStore: () => ({
    listRecordsForDeal: (...args: unknown[]) => listRecordsForDealMock(...args),
    createRecord: vi.fn(),
  }),
}));

import { DealAdverseActionPanel } from './DealAdverseActionPanel';

function baseProps() {
  return {
    dealId: 'deal-1',
    dealStatus: 'Declined',
    authorized: true,
    actorEmail: 'banker@bank.test',
    systemUserId: 'sys-1',
  };
}

/** Simulates Vitest's real per-file JSDOM teardown happening before a leaked promise settles.
 *  Restores `window` afterward so the rest of this test file's own environment stays intact. */
async function withTornDownWindow(fn: () => void | Promise<void>) {
  const saved = globalThis.window;
  // @ts-expect-error -- deliberately simulating a torn-down JSDOM global for this one settle.
  delete globalThis.window;
  try {
    await fn();
    // Node only fires 'unhandledRejection' once the microtask queue has fully drained, which
    // requires crossing at least one macrotask boundary -- a chain of Promise.resolve() alone is
    // not enough to observe it.
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    globalThis.window = saved;
  }
}

describe('DealAdverseActionPanel — async loader is unmount-safe', () => {
  let unhandledRejections: unknown[];
  function onUnhandledRejection(reason: unknown) {
    unhandledRejections.push(reason);
  }

  beforeEach(() => {
    unhandledRejections = [];
    listRecordsForDealMock.mockReset();
    process.on('unhandledRejection', onUnhandledRejection);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection);
    cleanup();
  });

  it('unmount before the load resolves causes no state update and no unhandled rejection', async () => {
    let resolveList!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveList = resolve;
    });
    listRecordsForDealMock.mockReturnValue(pending);

    const { unmount } = render(<DealAdverseActionPanel {...baseProps()} />);
    expect(await screen.findByText(/loading adverse action records/i)).toBeInTheDocument();

    unmount();
    await withTornDownWindow(async () => {
      resolveList({ success: true, records: [] });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unhandledRejections).toEqual([]);
  });

  it('unmount before the load rejects causes no unhandled rejection', async () => {
    let rejectList!: (e: unknown) => void;
    const pending = new Promise((_resolve, reject) => {
      rejectList = reject;
    });
    listRecordsForDealMock.mockReturnValue(pending);

    const { unmount } = render(<DealAdverseActionPanel {...baseProps()} />);
    unmount();

    await withTornDownWindow(async () => {
      rejectList(new Error('OData-Error: cr664_adverseactionrecord internal trace'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unhandledRejections).toEqual([]);
  });

  it('a rejection while still mounted still displays the mapped business-safe error, never the raw message', async () => {
    listRecordsForDealMock.mockRejectedValue(new Error('OData-Error: cr664_adverseactionrecord internal trace'));

    render(<DealAdverseActionPanel {...baseProps()} />);

    const errorEl = await screen.findByText(/we couldn't save that action just now/i);
    expect(errorEl).toBeInTheDocument();
    expect(screen.queryByText(/OData-Error/)).toBeNull();
    expect(screen.queryByText(/cr664_adverseactionrecord/)).toBeNull();
  });

  it('renders nothing (and never loads) when the deal status is not DECLINED', () => {
    const { container } = render(<DealAdverseActionPanel {...baseProps()} dealStatus="Active" />);
    expect(container).toBeEmptyDOMElement();
    expect(listRecordsForDealMock).not.toHaveBeenCalled();
  });
});

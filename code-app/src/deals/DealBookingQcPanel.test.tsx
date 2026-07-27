// @vitest-environment jsdom
/**
 * Regression coverage for the async-unmount fix: `load()`'s `.then()`/`.catch()` callbacks must
 * never touch state after this panel has unmounted (e.g. the deal workspace navigates away
 * mid-load, or — as observed in CI — a test unmounts the tree while `listChecksForDeal` is still
 * in flight and the environment is torn down before the promise settles).
 *
 * The unmount-before-resolve/reject tests reproduce the EXACT observed failure mode rather than a
 * proxy for it: after unmounting, `globalThis.window` is deleted (simulating Vitest's real
 * per-file JSDOM teardown) before the pending promise is settled -- confirmed against the pre-fix
 * code that this reproduces the literal reported error, `ReferenceError: window is not defined`
 * thrown from React's `dispatchSetState`, surfaced as an unhandled rejection -- and confirmed the
 * fix (the `isMountedRef` guard) eliminates it. See DealCreditApprovalDecisionPanel.test.tsx for
 * the sibling panel this pattern was first proven against.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const listChecksForDealMock = vi.fn();
vi.mock('../closing/bookingQcCheckStore', () => ({
  createDataverseBookingQcCheckStore: () => ({
    listChecksForDeal: (...args: unknown[]) => listChecksForDealMock(...args),
    createCheckRecord: vi.fn(),
  }),
}));

import { DealBookingQcPanel } from './DealBookingQcPanel';

function baseProps() {
  return {
    dealId: 'deal-1',
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

describe('DealBookingQcPanel — async loader is unmount-safe', () => {
  let unhandledRejections: unknown[];
  function onUnhandledRejection(reason: unknown) {
    unhandledRejections.push(reason);
  }

  beforeEach(() => {
    unhandledRejections = [];
    listChecksForDealMock.mockReset();
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
    listChecksForDealMock.mockReturnValue(pending);

    const { unmount } = render(<DealBookingQcPanel {...baseProps()} />);
    expect(await screen.findByText(/loading booking qc checks/i)).toBeInTheDocument();

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
    listChecksForDealMock.mockReturnValue(pending);

    const { unmount } = render(<DealBookingQcPanel {...baseProps()} />);
    unmount();

    await withTornDownWindow(async () => {
      rejectList(new Error('OData-Error: cr664_bookingqccheck internal trace'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unhandledRejections).toEqual([]);
  });

  it('a rejection while still mounted still displays the mapped business-safe error, never the raw message', async () => {
    listChecksForDealMock.mockRejectedValue(new Error('OData-Error: cr664_bookingqccheck internal trace'));

    render(<DealBookingQcPanel {...baseProps()} />);

    const errorEl = await screen.findByText(/we couldn't save that action just now/i);
    expect(errorEl).toBeInTheDocument();
    expect(screen.queryByText(/OData-Error/)).toBeNull();
    expect(screen.queryByText(/cr664_bookingqccheck/)).toBeNull();
  });
});

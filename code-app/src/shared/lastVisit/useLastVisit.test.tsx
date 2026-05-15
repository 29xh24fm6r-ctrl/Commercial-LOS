// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  LAST_VISIT_STORAGE_KEY_PREFIX,
  getLastVisitMs,
  setLastVisitMs,
} from './lastVisit';
import { useLastVisit } from './useLastVisit';

/**
 * Phase 72 — useLastVisit hook tests.
 *
 * The hook's two-step behavior:
 *   1. On mount, snapshot the prior marker once and freeze it.
 *   2. After `delayMs` (default 2000), bump the marker to `now`.
 *
 * Tests use a tiny harness component that renders the hook's
 * output as JSON-shaped text, plus injected `now` + `delayMs` so
 * the test can deterministically control the bump.
 */

function Harness({
  dealId,
  now,
  delayMs,
}: {
  dealId: string;
  now: () => number;
  delayMs: number;
}) {
  const r = useLastVisit(dealId, { now, delayMs });
  return (
    <div data-testid="snapshot">
      {String(r.isInitialized)}|{r.priorLastVisitMs ?? 'undefined'}
    </div>
  );
}

function readSnapshot(): { isInitialized: string; prior: string } {
  const txt = screen.getByTestId('snapshot').textContent ?? '';
  const [isInitialized, prior] = txt.split('|');
  return { isInitialized: isInitialized!, prior: prior! };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('Phase 72 — useLastVisit', () => {
  it('first visit: returns undefined prior + initialized=true after mount', async () => {
    render(<Harness dealId="d-1" now={() => 1_700_000_500_000} delayMs={50} />);
    // Microtask + effect have to flush. RTL's render synchronously
    // commits + flushes one effect; the hook's effect runs in that
    // pass and calls setSnapshot, so the next render shows initialized=true.
    expect(readSnapshot().isInitialized).toBe('true');
    expect(readSnapshot().prior).toBe('undefined');
  });

  it('subsequent visit: snapshot reflects the previously-written marker', async () => {
    setLastVisitMs('d-2', 1_700_000_111_111);
    render(<Harness dealId="d-2" now={() => 1_700_000_500_000} delayMs={50} />);
    const r = readSnapshot();
    expect(r.isInitialized).toBe('true');
    expect(r.prior).toBe('1700000111111');
  });

  it('after delayMs the marker is bumped to `now`', async () => {
    vi.useFakeTimers();
    setLastVisitMs('d-3', 1_700_000_111_111);
    render(<Harness dealId="d-3" now={() => 1_700_000_999_999} delayMs={100} />);
    // Before the timer fires, the marker is still the prior value.
    expect(getLastVisitMs('d-3')).toBe(1_700_000_111_111);
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // After the bump, localStorage holds the new "now" value.
    expect(getLastVisitMs('d-3')).toBe(1_700_000_999_999);
  });

  it('the snapshot stays frozen across the bump', async () => {
    vi.useFakeTimers();
    setLastVisitMs('d-4', 1_700_000_111_111);
    render(<Harness dealId="d-4" now={() => 1_700_000_999_999} delayMs={100} />);
    // Snapshot is the prior marker, NOT the bumped marker.
    expect(readSnapshot().prior).toBe('1700000111111');
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    // Bump happened; snapshot is unchanged for this visit.
    expect(readSnapshot().prior).toBe('1700000111111');
    expect(getLastVisitMs('d-4')).toBe(1_700_000_999_999);
  });

  it('unmount before the delay cancels the bump (no marker written)', async () => {
    vi.useFakeTimers();
    setLastVisitMs('d-5', 1_700_000_111_111);
    const { unmount } = render(
      <Harness dealId="d-5" now={() => 1_700_000_999_999} delayMs={500} />,
    );
    expect(getLastVisitMs('d-5')).toBe(1_700_000_111_111);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // Marker is unchanged because the timeout was cleared on unmount.
    expect(getLastVisitMs('d-5')).toBe(1_700_000_111_111);
  });

  it('uses the namespaced localStorage key', async () => {
    vi.useFakeTimers();
    render(
      <Harness
        dealId="d-namespacing"
        now={() => 1_700_001_000_000}
        delayMs={10}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(
      localStorage.getItem(`${LAST_VISIT_STORAGE_KEY_PREFIX}d-namespacing`),
    ).toBe('1700001000000');
  });
});

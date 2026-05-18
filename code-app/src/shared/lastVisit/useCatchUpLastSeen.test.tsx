// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  buildCatchUpScope,
  getCatchUpLastSeenMs,
  setCatchUpLastSeenMs,
  type CatchUpScope,
} from './catchUpLastSeen';
import { useCatchUpLastSeen } from './useCatchUpLastSeen';

/**
 * Phase 90 — useCatchUpLastSeen hook tests.
 *
 * Mirrors Phase 72's useLastVisit test pattern: a tiny harness
 * component renders the hook's output as text, with injected
 * `now` + `delayMs` so the test can deterministically control the
 * bump.
 *
 * Pins:
 *   - first visit: priorLastSeenMs undefined, isInitialized true.
 *   - subsequent visit: snapshot reflects the previously-written
 *     marker.
 *   - after delayMs the marker is bumped to `now`.
 *   - the snapshot stays frozen across re-renders (the badge does
 *     not flicker mid-visit).
 *   - null scope (no stable identity) → isUnscoped true, no
 *     localStorage write.
 *   - changing the scope re-snapshots and re-schedules the bump.
 */

function Harness({
  scope,
  now,
  delayMs,
}: {
  scope: CatchUpScope | null;
  now: () => number;
  delayMs: number;
}) {
  const r = useCatchUpLastSeen(scope, { now, delayMs });
  return (
    <div data-testid="snapshot">
      {String(r.isInitialized)}|{r.priorLastSeenMs ?? 'undefined'}|
      {String(r.isUnscoped)}
    </div>
  );
}

function readSnapshot(): {
  isInitialized: string;
  prior: string;
  isUnscoped: string;
} {
  const txt = screen.getByTestId('snapshot').textContent ?? '';
  const parts = txt.split('|');
  return {
    isInitialized: parts[0]!,
    prior: parts[1]!,
    isUnscoped: parts[2]!,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('Phase 90 — useCatchUpLastSeen', () => {
  it('first visit (banker scope, no prior marker): prior=undefined, initialized=true, isUnscoped=false', () => {
    const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-1' });
    render(<Harness scope={scope} now={() => 1_700_000_500_000} delayMs={50} />);
    const r = readSnapshot();
    expect(r.isInitialized).toBe('true');
    expect(r.prior).toBe('undefined');
    expect(r.isUnscoped).toBe('false');
  });

  it('returning visit: snapshot reflects the previously-written marker', () => {
    setCatchUpLastSeenMs('banker:b-2', 1_700_000_111_111);
    const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-2' });
    render(<Harness scope={scope} now={() => 1_700_000_500_000} delayMs={50} />);
    const r = readSnapshot();
    expect(r.prior).toBe('1700000111111');
    expect(r.isUnscoped).toBe('false');
  });

  it('after delayMs the marker is bumped to `now`', async () => {
    vi.useFakeTimers();
    setCatchUpLastSeenMs('banker:b-3', 1_700_000_111_111);
    const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-3' });
    render(<Harness scope={scope} now={() => 1_700_000_999_999} delayMs={100} />);
    expect(getCatchUpLastSeenMs('banker:b-3')).toBe(1_700_000_111_111);
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(getCatchUpLastSeenMs('banker:b-3')).toBe(1_700_000_999_999);
  });

  it('null scope → isUnscoped=true, initialized=true, no localStorage write', async () => {
    vi.useFakeTimers();
    render(<Harness scope={null} now={() => 1_700_000_999_999} delayMs={100} />);
    const r = readSnapshot();
    expect(r.isInitialized).toBe('true');
    expect(r.isUnscoped).toBe('true');
    expect(r.prior).toBe('undefined');
    // No write should happen even after the would-be delay window.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(localStorage.length).toBe(0);
  });

  it('snapshot stays frozen across re-renders (badge does not flicker)', async () => {
    setCatchUpLastSeenMs('banker:b-4', 1_700_000_111_111);
    const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-4' });
    const { rerender } = render(
      <Harness scope={scope} now={() => 1_700_000_999_999} delayMs={50} />,
    );
    expect(readSnapshot().prior).toBe('1700000111111');
    // Re-render with the same scope: snapshot must NOT re-read storage
    // (which would flip to the bumped value after the timer fires).
    rerender(
      <Harness scope={scope} now={() => 1_700_000_999_999} delayMs={50} />,
    );
    expect(readSnapshot().prior).toBe('1700000111111');
  });

  it('changing scope re-snapshots and re-schedules the bump', async () => {
    vi.useFakeTimers();
    setCatchUpLastSeenMs('banker:b-5', 1_700_000_111_111);
    const scopeA = buildCatchUpScope({ surface: 'banker', userId: 'b-5' });
    const scopeB = buildCatchUpScope({ surface: 'banker', userId: 'b-6' });
    const { rerender } = render(
      <Harness scope={scopeA} now={() => 1_700_000_999_999} delayMs={100} />,
    );
    expect(readSnapshot().prior).toBe('1700000111111');
    // Switch to a different scope; snapshot should reset to its
    // own prior (undefined for b-6).
    rerender(
      <Harness scope={scopeB} now={() => 1_700_000_999_999} delayMs={100} />,
    );
    expect(readSnapshot().prior).toBe('undefined');
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(getCatchUpLastSeenMs('banker:b-6')).toBe(1_700_000_999_999);
  });

  it('cancels the marker bump on unmount before the delay fires', async () => {
    vi.useFakeTimers();
    setCatchUpLastSeenMs('banker:b-7', 1_700_000_111_111);
    const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-7' });
    const { unmount } = render(
      <Harness scope={scope} now={() => 1_700_000_999_999} delayMs={100} />,
    );
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    // The prior marker is unchanged because the bump never fired.
    expect(getCatchUpLastSeenMs('banker:b-7')).toBe(1_700_000_111_111);
  });

  it('manager scope keys differ from banker scope keys for the same userId', () => {
    setCatchUpLastSeenMs('banker:b-8', 100);
    setCatchUpLastSeenMs('manager:b-8:t-1', 200);
    const bScope = buildCatchUpScope({ surface: 'banker', userId: 'b-8' });
    const mScope = buildCatchUpScope({
      surface: 'manager',
      userId: 'b-8',
      teamId: 't-1',
    });
    const { unmount } = render(
      <Harness scope={bScope} now={() => 1} delayMs={1_000_000} />,
    );
    expect(readSnapshot().prior).toBe('100');
    unmount();
    render(<Harness scope={mScope} now={() => 1} delayMs={1_000_000} />);
    expect(readSnapshot().prior).toBe('200');
  });

  // -----------------------------------------------------------------
  // Phase 94 — markAllSeen
  // -----------------------------------------------------------------

  describe('Phase 94 — markAllSeen', () => {
    function MarkAllSeenHarness({
      scope,
      now,
      onReady,
    }: {
      scope: CatchUpScope | null;
      now: () => number;
      onReady?: (markAllSeen: (now?: Date) => void) => void;
    }) {
      const r = useCatchUpLastSeen(scope, { now, delayMs: 1_000_000 });
      // Expose markAllSeen to the test via a ref callback.
      if (onReady) onReady(r.markAllSeen);
      return (
        <div data-testid="snapshot">
          {String(r.isInitialized)}|{r.priorLastSeenMs ?? 'undefined'}|
          {String(r.isUnscoped)}
        </div>
      );
    }

    it('bumps the in-memory snapshot to `now` when scope is available', () => {
      let trigger: ((n?: Date) => void) | null = null;
      const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-9' });
      render(
        <MarkAllSeenHarness
          scope={scope}
          now={() => 1}
          onReady={(fn) => {
            trigger = fn;
          }}
        />,
      );
      // Before click: first visit (no prior marker).
      expect(readSnapshot().prior).toBe('undefined');
      const stamp = new Date(1_700_000_999_999);
      act(() => {
        trigger!(stamp);
      });
      // Snapshot updated synchronously to the new marker.
      expect(readSnapshot().prior).toBe('1700000999999');
    });

    it('writes the new marker to localStorage so the next visit reflects it', () => {
      let trigger: ((n?: Date) => void) | null = null;
      const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-10' });
      render(
        <MarkAllSeenHarness
          scope={scope}
          now={() => 1}
          onReady={(fn) => {
            trigger = fn;
          }}
        />,
      );
      act(() => {
        trigger!(new Date(1_700_000_999_999));
      });
      expect(getCatchUpLastSeenMs('banker:b-10')).toBe(1_700_000_999_999);
    });

    it('no-ops when scope is null (unscoped)', () => {
      let trigger: ((n?: Date) => void) | null = null;
      render(
        <MarkAllSeenHarness
          scope={null}
          now={() => 1}
          onReady={(fn) => {
            trigger = fn;
          }}
        />,
      );
      act(() => {
        trigger!(new Date(1_700_000_999_999));
      });
      // Snapshot remains the unscoped default; storage was not
      // written under any scope.
      const after = readSnapshot();
      expect(after.prior).toBe('undefined');
      expect(after.isUnscoped).toBe('true');
      expect(localStorage.length).toBe(0);
    });

    it('uses Date.now() when no explicit `now` is passed', () => {
      let trigger: ((n?: Date) => void) | null = null;
      const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-11' });
      render(
        <MarkAllSeenHarness
          scope={scope}
          now={() => 1}
          onReady={(fn) => {
            trigger = fn;
          }}
        />,
      );
      const before = Date.now();
      act(() => {
        trigger!();
      });
      const stored = getCatchUpLastSeenMs('banker:b-11');
      expect(stored).toBeDefined();
      // The default-Date stamp is within the (before .. now) window.
      expect(stored!).toBeGreaterThanOrEqual(before);
      expect(stored!).toBeLessThanOrEqual(Date.now() + 50);
    });

    it('floors fractional millisecond input to integer storage', () => {
      let trigger: ((n?: Date) => void) | null = null;
      const scope = buildCatchUpScope({ surface: 'banker', userId: 'b-12' });
      render(
        <MarkAllSeenHarness
          scope={scope}
          now={() => 1}
          onReady={(fn) => {
            trigger = fn;
          }}
        />,
      );
      act(() => {
        trigger!(new Date(1_700_000_999_999.7));
      });
      // Date(...).getTime() already returns integer ms — but the
      // helper also floors defensively.
      expect(getCatchUpLastSeenMs('banker:b-12')).toBe(1_700_000_999_999);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  timed,
  recordRefresh,
  recordProviderLoaded,
  getPerfSnapshot,
  resetPerfRegistry,
  setPerfEnabled,
  isPerfEnabled,
} from './perfRegistry';

beforeEach(() => {
  resetPerfRegistry();
  setPerfEnabled(true);
});

describe('perfRegistry — timed()', () => {
  it('records query-end aggregates and returns the wrapped value unchanged', async () => {
    const value = await timed('TestGroup', 'op', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(value).toBe(42);
    const snap = getPerfSnapshot();
    expect(snap.totals.queriesCompleted).toBe(1);
    expect(snap.totals.queriesFailed).toBe(0);
    const row = snap.queryAverages.find(
      (r) => r.group === 'TestGroup' && r.label === 'op',
    );
    expect(row).toBeDefined();
    expect(row!.n).toBe(1);
    expect(row!.avgMs).toBeGreaterThan(0);
  });

  it('records query-failed and re-throws the same error (passthrough)', async () => {
    const boom = new Error('boom');
    let caught: unknown = undefined;
    try {
      await timed('TestGroup', 'failing', async () => {
        throw boom;
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(boom);
    const snap = getPerfSnapshot();
    expect(snap.totals.queriesCompleted).toBe(0);
    expect(snap.totals.queriesFailed).toBe(1);
    expect(snap.failureSamples.length).toBe(1);
    expect(snap.failureSamples[0]!.error).toContain('boom');
  });

  it('captures both completed and failed events when interleaved', async () => {
    await timed('G', 'ok1', async () => 1);
    await timed('G', 'ok2', async () => 2);
    await expect(timed('G', 'bad', async () => { throw new Error('x'); })).rejects.toThrow();
    await timed('G', 'ok3', async () => 3);
    const snap = getPerfSnapshot();
    expect(snap.totals.queriesCompleted).toBe(3);
    expect(snap.totals.queriesFailed).toBe(1);
  });

  it('does NOT mutate business logic — return value is reference-equal to the underlying resolution', async () => {
    const ref = { handle: Symbol('h') };
    const out = await timed('G', 'returns-object', async () => ref);
    expect(out).toBe(ref);
  });
});

describe('perfRegistry — refresh + provider events', () => {
  it('recordRefresh increments total and per-key counts', () => {
    recordRefresh('DealDataProvider', 'tasks');
    recordRefresh('DealDataProvider', 'tasks');
    recordRefresh('DealDataProvider', 'after-task-complete');
    const snap = getPerfSnapshot();
    expect(snap.totals.refreshes).toBe(3);
    expect(snap.totals.writeTriggeredRefreshes).toBe(1);
    const byKey = new Map(snap.refreshCounts.map((r) => [r.key, r.count]));
    expect(byKey.get('tasks')).toBe(2);
    expect(byKey.get('after-task-complete')).toBe(1);
  });

  it('recordProviderLoaded contributes to provider averages', () => {
    recordProviderLoaded('DealDataProvider', 100);
    recordProviderLoaded('DealDataProvider', 200);
    recordProviderLoaded('AdminDataProvider', 50);
    const snap = getPerfSnapshot();
    expect(snap.totals.providerLoads).toBe(3);
    const dd = snap.providerAverages.find((p) => p.provider === 'DealDataProvider');
    const ad = snap.providerAverages.find((p) => p.provider === 'AdminDataProvider');
    expect(dd).toBeDefined();
    expect(dd!.n).toBe(2);
    expect(dd!.avgMs).toBeCloseTo(150);
    expect(ad!.avgMs).toBeCloseTo(50);
  });

  it('slowestRecent surfaces the highest-duration completed queries', async () => {
    // Stub performance.now so the durations are deterministic.
    // Real setTimeout-based timing was flaky under heavy test load:
    // setTimeout(2) could end up taking longer than setTimeout(30)
    // when the event loop was busy, and the ordering assertion below
    // would intermittently fail. The intent of this test is to pin
    // the sort/ordering logic — not to test the platform's
    // setTimeout resolution.
    let clock = 0;
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => clock);
    try {
      clock = 1000;
      await timed('G', 'fast', async () => {
        clock = 1005; // 5 ms duration
      });
      clock = 2000;
      await timed('G', 'slow', async () => {
        clock = 2080; // 80 ms duration
      });
      clock = 3000;
      await timed('G', 'medium', async () => {
        clock = 3030; // 30 ms duration
      });
      const snap = getPerfSnapshot(2);
      // After sort, [0] is the slowest, [1] is medium.
      expect(snap.slowestRecent[0]!.label).toBe('slow');
      expect(snap.slowestRecent[1]!.label).toBe('medium');
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe('perfRegistry — disabled path', () => {
  it('timed() stays a pure passthrough when disabled', async () => {
    setPerfEnabled(false);
    expect(isPerfEnabled()).toBe(false);
    const value = await timed('G', 'op', async () => 7);
    expect(value).toBe(7);
    const snap = getPerfSnapshot();
    expect(snap.enabled).toBe(false);
    // Disabled mode records nothing.
    expect(snap.totals.queriesCompleted).toBe(0);
    expect(snap.totals.queriesFailed).toBe(0);
  });

  it('disabled timed() still re-throws errors (semantics preserved)', async () => {
    setPerfEnabled(false);
    const boom = new Error('boom');
    await expect(
      timed('G', 'failing', async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(getPerfSnapshot().totals.queriesFailed).toBe(0);
  });

  it('recordRefresh / recordProviderLoaded are no-ops when disabled', () => {
    setPerfEnabled(false);
    recordRefresh('G', 'k');
    recordProviderLoaded('G', 100);
    const snap = getPerfSnapshot();
    expect(snap.totals.refreshes).toBe(0);
    expect(snap.totals.providerLoads).toBe(0);
  });
});

describe('perfRegistry — reset + aggregation', () => {
  it('resetPerfRegistry clears every counter, aggregate, and the ring buffer', async () => {
    await timed('G', 'op', async () => 1);
    recordRefresh('G', 'k');
    recordProviderLoaded('G', 50);
    resetPerfRegistry();
    const snap = getPerfSnapshot();
    expect(snap.totalEvents).toBe(0);
    expect(snap.ringSize).toBe(0);
    expect(snap.totals.queriesCompleted).toBe(0);
    expect(snap.totals.refreshes).toBe(0);
    expect(snap.totals.providerLoads).toBe(0);
    expect(snap.queryAverages).toEqual([]);
    expect(snap.providerAverages).toEqual([]);
    expect(snap.refreshCounts).toEqual([]);
    expect(snap.failureSamples).toEqual([]);
  });

  it('ring buffer respects its capacity; ringSize never exceeds ringCapacity', async () => {
    // Push more than RING_CAPACITY events. We use synchronous timed
    // calls that resolve in the same tick to keep the test fast.
    const target = 600; // > 500 capacity
    for (let i = 0; i < target; i++) {
      await timed('G', `op-${i}`, async () => i);
    }
    const snap = getPerfSnapshot();
    expect(snap.ringSize).toBeLessThanOrEqual(snap.ringCapacity);
    expect(snap.totalEvents).toBeGreaterThanOrEqual(target * 2); // query-start + query-end
  });

  it('snapshot ordering: refreshCounts sorted by count desc, providerAverages by avg desc', () => {
    recordRefresh('G', 'a');
    recordRefresh('G', 'a');
    recordRefresh('G', 'a');
    recordRefresh('G', 'b');
    recordProviderLoaded('Slow', 200);
    recordProviderLoaded('Fast', 10);
    const snap = getPerfSnapshot();
    expect(snap.refreshCounts.map((r) => r.key)).toEqual(['a', 'b']);
    expect(snap.providerAverages.map((p) => p.provider)).toEqual(['Slow', 'Fast']);
  });
});

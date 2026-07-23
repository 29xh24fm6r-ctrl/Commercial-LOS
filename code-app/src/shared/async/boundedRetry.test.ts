import { describe, it, expect, vi } from 'vitest';
import { boundedRetry } from './boundedRetry';

/** A `wait` stub that resolves immediately but still records each call, so
 *  tests can assert the delay was actually invoked without real timers. */
function instantWait() {
  const calls: number[] = [];
  const wait = vi.fn(async (ms: number) => {
    calls.push(ms);
  });
  return { wait, calls };
}

describe('boundedRetry', () => {
  it('returns satisfied on the first attempt without waiting', async () => {
    const { wait, calls } = instantWait();
    const attempt = vi.fn(async () => 'ready');
    const result = await boundedRetry({
      attempt,
      isSatisfied: (r) => r === 'ready',
      maxAttempts: 5,
      delayMs: 100,
      wait,
    });
    expect(result).toEqual({ satisfied: true, result: 'ready', attempts: 1 });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it('retries after a stale first read and succeeds on the second attempt', async () => {
    const { wait, calls } = instantWait();
    const attempt = vi.fn<() => Promise<string>>();
    attempt.mockResolvedValueOnce('stale').mockResolvedValueOnce('confirmed');
    const result = await boundedRetry({
      attempt,
      isSatisfied: (r) => r === 'confirmed',
      maxAttempts: 5,
      delayMs: 250,
      wait,
    });
    expect(result).toEqual({ satisfied: true, result: 'confirmed', attempts: 2 });
    expect(attempt).toHaveBeenCalledTimes(2);
    // Exactly one wait between the stale first attempt and the successful retry.
    expect(calls).toEqual([250]);
  });

  it('stops at maxAttempts and reports unsatisfied when the condition never passes', async () => {
    const { wait, calls } = instantWait();
    const attempt = vi.fn(async () => 'stale');
    const result = await boundedRetry({
      attempt,
      isSatisfied: (r) => r === 'confirmed',
      maxAttempts: 3,
      delayMs: 50,
      wait,
    });
    expect(result).toEqual({ satisfied: false, result: 'stale', attempts: 3 });
    expect(attempt).toHaveBeenCalledTimes(3);
    // Waits between attempts only (2 waits for 3 attempts) — no wait after the
    // final, still-unsatisfied attempt (no uncontrolled polling beyond the bound).
    expect(calls).toEqual([50, 50]);
  });

  it('never calls attempt more than maxAttempts even when always unsatisfied', async () => {
    const { wait } = instantWait();
    const attempt = vi.fn(async () => 'stale');
    await boundedRetry({
      attempt,
      isSatisfied: () => false,
      maxAttempts: 1,
      delayMs: 1000,
      wait,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('rejects an invalid maxAttempts rather than looping unboundedly', async () => {
    await expect(
      boundedRetry({
        attempt: async () => 'x',
        isSatisfied: () => false,
        maxAttempts: 0,
        delayMs: 10,
      }),
    ).rejects.toThrow(/maxAttempts/);
  });

  it('defaults to a real timer-based wait when none is injected', async () => {
    vi.useFakeTimers();
    try {
      const attempt = vi.fn<() => Promise<string>>();
      attempt.mockResolvedValueOnce('stale').mockResolvedValueOnce('confirmed');
      const promise = boundedRetry({
        attempt,
        isSatisfied: (r) => r === 'confirmed',
        maxAttempts: 3,
        delayMs: 300,
      });
      // First attempt resolves synchronously off the microtask queue.
      await vi.advanceTimersByTimeAsync(0);
      expect(attempt).toHaveBeenCalledTimes(1);
      // The real setTimeout-based wait has not elapsed yet — no second attempt.
      expect(attempt).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(300);
      const result = await promise;
      expect(result).toEqual({ satisfied: true, result: 'confirmed', attempts: 2 });
    } finally {
      vi.useRealTimers();
    }
  });
});

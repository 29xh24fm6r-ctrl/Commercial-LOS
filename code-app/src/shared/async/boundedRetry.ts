/**
 * A small, deterministic, bounded read-after-write retry helper.
 *
 * A governed create can return before a subsequent read (e.g. a pipeline list
 * fetched from a different endpoint / cache tier) reflects the newly created
 * record — a classic read-after-write race. This helper polls a bounded
 * number of times with a fixed delay between attempts and stops the moment
 * the caller's own `isSatisfied` predicate passes, so it never silently
 * overwrites a "not yet confirmed" state with an unbounded retry loop.
 *
 * `wait` defaults to a real `setTimeout`-based delay; callers needing
 * deterministic tests can either inject a fake `wait`, or drive the real one
 * with Vitest fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync`).
 */

export interface BoundedRetryOptions<T> {
  /** Performs one attempt and returns its result. */
  readonly attempt: () => Promise<T>;
  /** True when `attempt`'s result satisfies the caller — stops retrying. */
  readonly isSatisfied: (result: T) => boolean;
  /** Total attempts allowed, including the first (must be >= 1). */
  readonly maxAttempts: number;
  /** Delay between attempts, in milliseconds. Not applied after the last attempt. */
  readonly delayMs: number;
  /** Delay implementation. Defaults to a real `setTimeout`. */
  readonly wait?: (ms: number) => Promise<void>;
}

export interface BoundedRetryResult<T> {
  /** True when `isSatisfied` passed on the returned `result`. */
  readonly satisfied: boolean;
  /** The last attempt's result, whether or not it satisfied the predicate. */
  readonly result: T;
  /** How many attempts were made (1..maxAttempts). */
  readonly attempts: number;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function boundedRetry<T>(options: BoundedRetryOptions<T>): Promise<BoundedRetryResult<T>> {
  if (options.maxAttempts < 1) {
    throw new Error('boundedRetry requires maxAttempts >= 1');
  }
  const wait = options.wait ?? defaultWait;
  let attempts = 0;
  let result: T;
  for (;;) {
    attempts++;
    result = await options.attempt();
    const satisfied = options.isSatisfied(result);
    if (satisfied || attempts >= options.maxAttempts) {
      return { satisfied, result, attempts };
    }
    await wait(options.delayMs);
  }
}

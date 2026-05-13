/**
 * Phase 31: in-memory performance / observability registry.
 *
 * Lightweight, local-only diagnostics. NO external telemetry, NO
 * beaconing, NO analytics. Aggregates query timings, refresh
 * triggers, write-refresh cascades, and provider load durations into
 * a bounded ring buffer + small aggregate maps for the admin
 * Performance Diagnostics card to render.
 *
 * Discipline:
 *   - Instrumentation failure must NEVER break feature behavior. Every
 *     mutator is wrapped in try/catch internally; callers see a
 *     guaranteed pass-through promise from time().
 *   - No business-logic mutation. timed() is a pure passthrough that
 *     records start/end/error; it never alters the underlying value
 *     or the rejected error.
 *   - No PII or borrower-sensitive content captured. Labels are
 *     short, group-name + operation-name pairs (e.g. "DealDataProvider"
 *     + "loadDealDocuments"); dealId / borrower text are NEVER
 *     written into the registry.
 *   - The registry is a module-level singleton: it persists for the
 *     life of the app session and resets on page reload. There is no
 *     persistence to disk, no localStorage, no Dataverse write.
 *
 * The registry can be disabled at runtime via setPerfEnabled(false)
 * for tests or for users who do not want diagnostics collected. When
 * disabled, all record* / timed() calls become no-ops; timed() still
 * awaits the wrapped promise and returns its value unchanged.
 */

export type PerfEventKind =
  | 'query-start'
  | 'query-end'
  | 'query-failed'
  | 'provider-loaded'
  | 'refresh-triggered';

export interface PerfEvent {
  kind: PerfEventKind;
  /** Short operation name, e.g. "loadDealDocuments". */
  label: string;
  /** Logical grouping for the operation, e.g. "DealDataProvider". */
  group: string;
  /** Wall-clock ms since the page loaded. */
  at: number;
  durationMs?: number;
  /** Optional source/reason tag, e.g. a refresh key like
   *  "after-task-complete". */
  source?: string;
  /** Truncated error message for query-failed events. Never the full
   *  stack — just a short summary. */
  error?: string;
}

const RING_CAPACITY = 500;

const ring: PerfEvent[] = [];
let ringWrite = 0;
let totalRecorded = 0;
let enabled = true;

interface OpAggregate {
  n: number;
  totalMs: number;
  maxMs: number;
}

const queryAgg = new Map<string, OpAggregate>(); // key = `${group}::${label}`
const providerAgg = new Map<string, OpAggregate>(); // key = provider group name
const refreshByKey = new Map<string, number>();
let totalQueriesCompleted = 0;
let totalQueriesFailed = 0;
let totalRefreshes = 0;
let totalWriteTriggeredRefreshes = 0;
let totalProviderLoads = 0;
const failureSamples: PerfEvent[] = [];
const FAILURE_SAMPLE_CAP = 50;

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function shortError(err: unknown): string {
  try {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.length > 240 ? msg.slice(0, 240) + '…' : msg;
  } catch {
    return 'unknown error';
  }
}

function pushEvent(ev: PerfEvent): void {
  try {
    if (ring.length < RING_CAPACITY) {
      ring.push(ev);
    } else {
      ring[ringWrite] = ev;
      ringWrite = (ringWrite + 1) % RING_CAPACITY;
    }
    totalRecorded += 1;
  } catch {
    // Recording must never throw. Swallow and continue.
  }
}

function bumpAgg(map: Map<string, OpAggregate>, key: string, ms: number): void {
  try {
    const cur = map.get(key);
    if (cur) {
      cur.n += 1;
      cur.totalMs += ms;
      if (ms > cur.maxMs) cur.maxMs = ms;
    } else {
      map.set(key, { n: 1, totalMs: ms, maxMs: ms });
    }
  } catch {
    // Aggregation must never throw.
  }
}

function aggKey(group: string, label: string): string {
  return `${group}::${label}`;
}

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

/**
 * Time-wrap a promise-returning function. Records start, end, and
 * failure events with duration. Returns the same value/error the
 * underlying function produces — i.e. it is a pure passthrough.
 *
 * If perf is disabled, this is a thin no-op around fn().
 */
export async function timed<T>(
  group: string,
  label: string,
  fn: () => Promise<T>,
  source?: string,
): Promise<T> {
  if (!enabled) return fn();
  const start = now();
  recordSafe({ kind: 'query-start', group, label, at: start, source });
  try {
    const result = await fn();
    const end = now();
    const durationMs = end - start;
    recordSafe({ kind: 'query-end', group, label, at: end, durationMs, source });
    safeIncrement(() => {
      bumpAgg(queryAgg, aggKey(group, label), durationMs);
      totalQueriesCompleted += 1;
    });
    return result;
  } catch (err) {
    const end = now();
    const durationMs = end - start;
    const ev: PerfEvent = {
      kind: 'query-failed',
      group,
      label,
      at: end,
      durationMs,
      source,
      error: shortError(err),
    };
    recordSafe(ev);
    safeIncrement(() => {
      totalQueriesFailed += 1;
      if (failureSamples.length < FAILURE_SAMPLE_CAP) failureSamples.push(ev);
      else failureSamples[FAILURE_SAMPLE_CAP - 1] = ev;
    });
    throw err;
  }
}

/** Record that a provider finished its initial load(s). */
export function recordProviderLoaded(provider: string, durationMs: number): void {
  if (!enabled) return;
  recordSafe({
    kind: 'provider-loaded',
    group: provider,
    label: 'initial-load',
    at: now(),
    durationMs,
  });
  safeIncrement(() => {
    bumpAgg(providerAgg, provider, durationMs);
    totalProviderLoads += 1;
  });
}

/** Record a refresh trigger. source is the refresh key/reason. */
export function recordRefresh(provider: string, source: string): void {
  if (!enabled) return;
  recordSafe({
    kind: 'refresh-triggered',
    group: provider,
    label: source,
    at: now(),
    source,
  });
  safeIncrement(() => {
    totalRefreshes += 1;
    if (source.startsWith('after-')) totalWriteTriggeredRefreshes += 1;
    refreshByKey.set(source, (refreshByKey.get(source) ?? 0) + 1);
  });
}

/** Toggle instrumentation on/off. Disabled mode keeps timed() as a
 *  pure passthrough — feature behavior is unchanged. */
export function setPerfEnabled(value: boolean): void {
  enabled = value;
}

export function isPerfEnabled(): boolean {
  return enabled;
}

/** Reset all in-memory counters / aggregates / ring buffer. Useful in
 *  tests and from the admin card if a fresh window is desired. */
export function resetPerfRegistry(): void {
  ring.length = 0;
  ringWrite = 0;
  totalRecorded = 0;
  queryAgg.clear();
  providerAgg.clear();
  refreshByKey.clear();
  totalQueriesCompleted = 0;
  totalQueriesFailed = 0;
  totalRefreshes = 0;
  totalWriteTriggeredRefreshes = 0;
  totalProviderLoads = 0;
  failureSamples.length = 0;
}

export interface QueryAggregateRow {
  group: string;
  label: string;
  n: number;
  avgMs: number;
  maxMs: number;
}

export interface ProviderAggregateRow {
  provider: string;
  n: number;
  avgMs: number;
}

export interface RefreshCountRow {
  key: string;
  count: number;
}

export interface SlowestQueryRow {
  group: string;
  label: string;
  durationMs: number;
  at: number;
}

export interface FailureSampleRow {
  group: string;
  label: string;
  error: string;
  at: number;
}

export interface PerfSnapshot {
  enabled: boolean;
  totalEvents: number;
  ringSize: number;
  ringCapacity: number;
  totals: {
    queriesCompleted: number;
    queriesFailed: number;
    refreshes: number;
    writeTriggeredRefreshes: number;
    providerLoads: number;
  };
  slowestRecent: readonly SlowestQueryRow[];
  queryAverages: readonly QueryAggregateRow[];
  providerAverages: readonly ProviderAggregateRow[];
  refreshCounts: readonly RefreshCountRow[];
  failureSamples: readonly FailureSampleRow[];
}

/**
 * Read a structured snapshot for UI consumption. Returns plain
 * sorted arrays so the caller does not have to know about Maps or
 * the ring buffer layout. Safe to call as often as needed.
 */
export function getPerfSnapshot(topN = 10): PerfSnapshot {
  const slowest = listEndsByDuration(topN);
  const queries = sortedAverages(queryAgg).map(([k, agg]) => {
    const sep = k.indexOf('::');
    return {
      group: k.slice(0, sep),
      label: k.slice(sep + 2),
      n: agg.n,
      avgMs: agg.totalMs / agg.n,
      maxMs: agg.maxMs,
    };
  });
  const providers = sortedAverages(providerAgg).map(([k, agg]) => ({
    provider: k,
    n: agg.n,
    avgMs: agg.totalMs / agg.n,
  }));
  const refreshes = [...refreshByKey.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
  const failures = failureSamples.map((ev) => ({
    group: ev.group,
    label: ev.label,
    error: ev.error ?? 'unknown error',
    at: ev.at,
  }));
  return {
    enabled,
    totalEvents: totalRecorded,
    ringSize: ring.length,
    ringCapacity: RING_CAPACITY,
    totals: {
      queriesCompleted: totalQueriesCompleted,
      queriesFailed: totalQueriesFailed,
      refreshes: totalRefreshes,
      writeTriggeredRefreshes: totalWriteTriggeredRefreshes,
      providerLoads: totalProviderLoads,
    },
    slowestRecent: slowest,
    queryAverages: queries,
    providerAverages: providers,
    refreshCounts: refreshes,
    failureSamples: failures,
  };
}

function listEndsByDuration(topN: number): SlowestQueryRow[] {
  const rows: SlowestQueryRow[] = [];
  for (const ev of ring) {
    if (ev.kind === 'query-end' && typeof ev.durationMs === 'number') {
      rows.push({
        group: ev.group,
        label: ev.label,
        durationMs: ev.durationMs,
        at: ev.at,
      });
    }
  }
  rows.sort((a, b) => b.durationMs - a.durationMs);
  return rows.slice(0, topN);
}

function sortedAverages(
  map: Map<string, OpAggregate>,
): [string, OpAggregate][] {
  return [...map.entries()].sort((a, b) => {
    const aAvg = a[1].totalMs / a[1].n;
    const bAvg = b[1].totalMs / b[1].n;
    return bAvg - aAvg;
  });
}

function recordSafe(ev: PerfEvent): void {
  try {
    pushEvent(ev);
  } catch {
    // never throw out of recording
  }
}

function safeIncrement(fn: () => void): void {
  try {
    fn();
  } catch {
    // never throw out of aggregation
  }
}

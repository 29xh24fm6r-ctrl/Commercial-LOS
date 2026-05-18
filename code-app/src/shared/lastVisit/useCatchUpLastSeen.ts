import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATCH_UP_MARKER_UPDATE_DELAY_MS,
  getCatchUpLastSeenMs,
  setCatchUpLastSeenMs,
  type CatchUpScope,
} from './catchUpLastSeen';

/**
 * Phase 90: React hook over the per-user catch-up last-seen marker.
 *
 * Mirrors Phase 72's `useLastVisit` behavior contract:
 *
 *   1. On mount (or when `scopeId` changes), snapshot the PRIOR
 *      marker once and freeze it in state. The card derivation
 *      uses the snapshot — so the "N new since your last visit"
 *      badge stays stable for the whole visit.
 *   2. After `CATCH_UP_MARKER_UPDATE_DELAY_MS` (2 s), write a fresh
 *      marker to localStorage so the NEXT visit's prior-marker
 *      reflects this one. The current visit's snapshot is
 *      unchanged.
 *
 * When `scope` is null (no stable identity available — e.g. the
 * banker provider hasn't resolved a bankerId yet, or the manager
 * provider has no teamId), the hook short-circuits:
 *   - priorLastSeenMs = undefined (first-visit-style behavior)
 *   - isInitialized = true (the card can render the disabled-badge
 *     state immediately rather than spinning)
 *   - no localStorage write happens.
 *
 * Local-only discipline (identical to Phase 72):
 *   - No prop callbacks. The marker write is a side effect of the
 *     mount; the consumer doesn't need to coordinate.
 *   - No Dataverse write, no audit row, no timeline event.
 *   - No cross-tab broadcast — a fresh tab IS a fresh visit by
 *     definition.
 */

export interface UseCatchUpLastSeenResult {
  /** The marker that was stored BEFORE the current visit. Frozen
   *  on mount; the only thing that mutates it is the Phase 94
   *  `markAllSeen()` call (manual "Mark all seen" click).
   *  `undefined` means first visit on this browser, OR the scope
   *  was null (no identity). */
  priorLastSeenMs: number | undefined;
  /** True once the prior marker has been read and the snapshot is
   *  ready. The card can hide the badge until this is true to avoid
   *  a flash of "first visit" copy on a returning user. */
  isInitialized: boolean;
  /** True when the caller passed `null` as the scope — i.e. no
   *  stable identity was available. The card uses this distinctly
   *  from "first visit" so the disclaimer can explain the missing
   *  marker honestly. */
  isUnscoped: boolean;
  /** Phase 94: bump the marker to `now` immediately. Updates the
   *  in-memory snapshot (so the catch-up "since last visit"
   *  derivation re-renders with newCount=0 right away) AND writes
   *  to localStorage (so the next visit's prior-marker reflects
   *  this). No-op when `scope` is null. */
  markAllSeen(now?: Date): void;
}

export function useCatchUpLastSeen(
  scope: CatchUpScope | null,
  options: { now?: () => number; delayMs?: number } = {},
): UseCatchUpLastSeenResult {
  const nowFn = options.now ?? (() => Date.now());
  const delayMs = options.delayMs ?? CATCH_UP_MARKER_UPDATE_DELAY_MS;

  // Internal snapshot — narrower than the public result because
  // markAllSeen is attached separately below (it's a stable
  // callback, not a piece of state).
  const [snapshot, setSnapshot] = useState<{
    priorLastSeenMs: number | undefined;
    isInitialized: boolean;
    isUnscoped: boolean;
  }>(() => ({
    priorLastSeenMs: undefined,
    isInitialized: false,
    isUnscoped: scope == null,
  }));

  // Track the last scopeId we initialized for. The ref + state
  // pair avoids re-reading localStorage on every render.
  const initializedForScopeId = useRef<string | null | undefined>(undefined);

  const currentScopeId = scope?.scopeId ?? null;

  useEffect(() => {
    if (initializedForScopeId.current === currentScopeId) return;
    initializedForScopeId.current = currentScopeId;

    if (currentScopeId == null) {
      setSnapshot({
        priorLastSeenMs: undefined,
        isInitialized: true,
        isUnscoped: true,
      });
      return undefined;
    }

    const prior = getCatchUpLastSeenMs(currentScopeId);
    setSnapshot({
      priorLastSeenMs: prior,
      isInitialized: true,
      isUnscoped: false,
    });
    // Schedule the marker bump. The current visit's UI continues
    // to use `prior` for its derivation.
    const handle = setTimeout(() => {
      setCatchUpLastSeenMs(currentScopeId, nowFn());
    }, delayMs);
    return () => clearTimeout(handle);
    // We intentionally exclude nowFn / delayMs from deps — they are
    // configuration captured at mount; changing them mid-visit
    // would not be meaningful for the marker bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScopeId]);

  // Phase 94: imperative "mark all seen" — bumps both the
  // in-memory snapshot AND localStorage to `now`. No-op when the
  // scope is null. Stable across renders.
  const markAllSeen = useCallback(
    (now?: Date) => {
      if (currentScopeId == null) return;
      const ms = (now ?? new Date()).getTime();
      if (!Number.isFinite(ms) || ms <= 0) return;
      setCatchUpLastSeenMs(currentScopeId, ms);
      setSnapshot((prev) => ({
        ...prev,
        priorLastSeenMs: Math.floor(ms),
        isInitialized: true,
        isUnscoped: false,
      }));
    },
    [currentScopeId],
  );

  return { ...snapshot, markAllSeen };
}

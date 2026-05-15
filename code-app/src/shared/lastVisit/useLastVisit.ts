import { useEffect, useRef, useState } from 'react';
import {
  MARKER_UPDATE_DELAY_MS,
  getLastVisitMs,
  setLastVisitMs,
} from './lastVisit';

/**
 * Phase 72: React hook over the per-deal last-visit marker.
 *
 * Behavior:
 *   1. On mount, snapshot the PRIOR marker once and freeze it in
 *      state. The UI uses the snapshot for derivation — so the
 *      "N new since last visit" badge stays stable for the whole
 *      visit.
 *   2. After MARKER_UPDATE_DELAY_MS (2s), write a fresh marker to
 *      localStorage so the NEXT visit's prior-marker reflects this
 *      one. The current visit's snapshot is unchanged.
 *
 * Why two-step:
 *   - If we bumped the marker inline with the prior-marker read,
 *     the next render would see "no new events" because the marker
 *     would already be "now."
 *   - If we never bumped, the same set of "new" events would stay
 *     "new" forever.
 *   - The 2s settle gives the banker time to register the badge.
 *
 * The hook is intentionally local-only:
 *   - No prop callbacks. The marker write is a side effect of the
 *     mount; the consumer doesn't need to coordinate.
 *   - No Dataverse write, no audit row, no timeline event.
 *   - No cross-tab broadcast: the localStorage write is visible to
 *     other tabs after they reload, which matches the local-only
 *     posture (a fresh tab IS a fresh visit by definition).
 */

export interface UseLastVisitResult {
  /** The marker that was stored BEFORE the current visit. Frozen
   *  on mount; never changes thereafter. `undefined` means first
   *  visit on this browser. */
  priorLastVisitMs: number | undefined;
  /** True once the prior marker has been read and the snapshot is
   *  ready. Useful for skipping render of the badge until the
   *  snapshot exists. */
  isInitialized: boolean;
}

export function useLastVisit(
  dealId: string,
  options: { now?: () => number; delayMs?: number } = {},
): UseLastVisitResult {
  const nowFn = options.now ?? (() => Date.now());
  const delayMs = options.delayMs ?? MARKER_UPDATE_DELAY_MS;

  // Snapshot the prior marker once per (dealId) and keep it stable
  // across re-renders. We deliberately do NOT subscribe to
  // localStorage changes — the snapshot represents "the value at
  // the start of this visit."
  const [snapshot, setSnapshot] = useState<{
    priorLastVisitMs: number | undefined;
    isInitialized: boolean;
  }>(() => ({ priorLastVisitMs: undefined, isInitialized: false }));

  // Track the last dealId we initialized for so re-renders with a
  // new dealId re-snapshot. The ref + state pair avoids re-reading
  // localStorage on every render.
  const initializedForDealId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (initializedForDealId.current === dealId) return;
    initializedForDealId.current = dealId;
    const prior = getLastVisitMs(dealId);
    setSnapshot({ priorLastVisitMs: prior, isInitialized: true });
    // Schedule the marker bump. The current visit's UI continues
    // to use `prior` for its derivation.
    const handle = setTimeout(() => {
      setLastVisitMs(dealId, nowFn());
    }, delayMs);
    return () => clearTimeout(handle);
    // We intentionally exclude nowFn / delayMs from deps — they are
    // configuration captured at mount; changing them mid-visit
    // would not be meaningful for the marker bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  return snapshot;
}

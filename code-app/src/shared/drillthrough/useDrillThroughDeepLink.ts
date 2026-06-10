/**
 * Phase 144D — drill-through deep-link hook.
 *
 * Thin wrapper over react-router's `useSearchParams` that exposes the active
 * drill-through target id from the URL and lets a surface open/close a target by
 * rewriting ONLY the drill query param. It performs NO fetch, NO navigation away
 * from the current page, and NO authorization — availability is decided by the
 * caller-supplied set of ids that already exist on the current authorized page.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DRILL_PARAM,
  sanitizeDrillThroughTargetId,
} from './drillThroughDeepLink';

export interface DrillThroughDeepLink {
  /** Validated drill target id from the URL, or null when absent/unsafe. */
  activeId: string | null;
  /**
   * True when `activeId` is present, valid, AND available on the current page
   * (present in `availableIds`, or any valid id when no set was supplied).
   */
  activeAvailable: boolean;
  /** True when `id` is the active, available deep-linked target. */
  isActive: (id: string) => boolean;
  /** Sets the drill param to `id` (preserving other params); no-op if unsafe. */
  open: (id: string) => void;
  /** Removes the drill param, preserving other params. */
  close: () => void;
}

/**
 * @param availableIds Ids that exist on the current authorized page (e.g. the
 * page's drill-through registry keys). When omitted, any syntactically valid id
 * is considered available; when provided, an unknown deep-link id fails closed.
 */
export function useDrillThroughDeepLink(availableIds?: Iterable<string>): DrillThroughDeepLink {
  const [searchParams, setSearchParams] = useSearchParams();

  const availableSet = useMemo(
    () => (availableIds ? new Set(availableIds) : undefined),
    // A new iterable each render is fine; callers typically pass a stable array.
    [availableIds],
  );

  const activeId = useMemo(
    () => sanitizeDrillThroughTargetId(searchParams.get(DRILL_PARAM)),
    [searchParams],
  );

  const activeAvailable = useMemo(() => {
    if (activeId === null) return false;
    return availableSet ? availableSet.has(activeId) : true;
  }, [activeId, availableSet]);

  const isActive = useCallback(
    (id: string) => activeAvailable && activeId === id,
    [activeAvailable, activeId],
  );

  const open = useCallback(
    (id: string) => {
      const safe = sanitizeDrillThroughTargetId(id);
      if (safe === null) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(DRILL_PARAM, safe);
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const close = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(DRILL_PARAM);
        return next;
      },
      { replace: false },
    );
  }, [setSearchParams]);

  return { activeId, activeAvailable, isActive, open, close };
}

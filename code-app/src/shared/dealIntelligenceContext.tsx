import { createContext, useContext, useMemo } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { deriveDealCockpitMetrics } from '../deals/dealCockpitMetrics';
import { deriveBlockers } from '../deals/blockerRules';
import {
  deriveDealIntelligenceViewModel,
  type DealIntelligenceViewModel,
} from './dealIntelligenceViewModel';

/**
 * Phase 123B — Deal Intelligence context.
 *
 * Wraps the existing DealDataProvider tree, derives the shared
 * `DealIntelligenceViewModel` (Phase 123A) from the already-authorized
 * deal record + the currently-loaded child data slots, and exposes
 * it to any descendant via `useDealIntelligence()`.
 *
 * Discipline:
 *   - The provider does NOT load anything itself; it consumes
 *     `useDealData()` and projects what is currently available.
 *   - AsyncResults that are still 'loading' or 'failed' are passed
 *     to the cockpit-metrics deriver as `undefined`. The deriver
 *     already understands that contract (counts default to zero,
 *     state defaults to 'unknown'). No fake values are invented.
 *   - The blocker deriver is always called — it tolerates undefined
 *     tasks / documents and is a pure function over the deal.
 *   - The view-model is memoized on the four `AsyncResult` slots +
 *     the deal so the VM identity is stable when nothing changed.
 *   - Pure / synchronous. No IO. No service calls.
 *
 * Permission-before-render is preserved: the caller (BankerDealWorkspace
 * / Manager / Team / Executive surfaces) already passed `loadDealForX`
 * before DealDataProvider mounted; this provider only sees authorized
 * data.
 */

const DealIntelligenceCtx = createContext<DealIntelligenceViewModel | null>(null);

interface DealIntelligenceProviderProps {
  children: React.ReactNode;
}

export function DealIntelligenceProvider({
  children,
}: DealIntelligenceProviderProps) {
  const data = useDealData();

  const vm = useMemo<DealIntelligenceViewModel>(() => {
    const tasks = data.tasks.kind === 'ready' ? data.tasks.data : undefined;
    const documents =
      data.documents.kind === 'ready' ? data.documents.data : undefined;
    const creditMemo =
      data.creditMemo.kind === 'ready' ? data.creditMemo.data : undefined;
    const activity =
      data.activity.kind === 'ready' ? data.activity.data : undefined;

    const metrics = deriveDealCockpitMetrics({
      deal: data.deal,
      tasks,
      documents,
      creditMemo,
      activity,
    });

    const blockers = deriveBlockers(data.deal, tasks, documents);

    return deriveDealIntelligenceViewModel({
      deal: data.deal,
      metrics,
      blockers,
    });
  }, [data.deal, data.tasks, data.documents, data.creditMemo, data.activity]);

  return (
    <DealIntelligenceCtx.Provider value={vm}>
      {children}
    </DealIntelligenceCtx.Provider>
  );
}

export function useDealIntelligence(): DealIntelligenceViewModel {
  const v = useContext(DealIntelligenceCtx);
  if (!v) {
    throw new Error(
      'useDealIntelligence must be used inside <DealIntelligenceProvider>.',
    );
  }
  return v;
}

/**
 * Opt-in variant for callers that may render outside the provider
 * (e.g. shared cards rendered by both Banker + Manager surfaces while
 * Phase 123B/123C wiring is still in progress). Returns `undefined`
 * when no provider is mounted — never throws.
 */
export function useOptionalDealIntelligence():
  | DealIntelligenceViewModel
  | undefined {
  return useContext(DealIntelligenceCtx) ?? undefined;
}

/**
 * Exported for tests that want to mount cards against a hand-built
 * view-model without computing one from a DealDataProvider. App code
 * should consume useDealIntelligence().
 */
export const DealIntelligenceContext = DealIntelligenceCtx;

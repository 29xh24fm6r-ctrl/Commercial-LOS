/**
 * Attention Console navigation.
 *
 * The Attention Console (see `DealBlockers.tsx`) renders derived
 * signal rows. Historically those rows looked actionable but a click
 * did nothing. This module maps each signal to the best existing
 * work surface so a click can scroll + focus that surface.
 *
 * Rules:
 *   - Read-only navigation only. `focusAttentionTarget` touches the
 *     DOM (scroll + focus) and never writes to Dataverse, never
 *     mutates deal state, and never emits an activity/audit row.
 *   - Signals without a known destination stay read-only: the row is
 *     rendered as plain status with no pointer/click affordance.
 *   - Selectors point at the `data-deal-card` / stage wrappers that
 *     BankerDealWorkspace already declares, mirroring the
 *     DealAutopilotPanel "Open <surface>" scroll-to pattern.
 */

export interface AttentionDestination {
  /** CSS selector for the wrapper to scroll into view + focus. */
  selector: string;
  /** Human-readable surface name, used in the button's aria-label. */
  label: string;
}

/**
 * Signal id → destination surface. Keys are the `BlockerSignal.id`
 * values produced by `deriveBlockers` / the credit-memo freshness
 * signal. Any id not listed here is treated as non-actionable and
 * rendered as read-only status.
 */
export const ATTENTION_SIGNAL_DESTINATIONS: Readonly<
  Record<string, AttentionDestination>
> = {
  // Overdue open tasks → the right-rail Tasks panel.
  'overdue-tasks': { selector: '[data-deal-card="tasks"]', label: 'Tasks' },
  // Overdue outstanding documents → the right-rail Documents panel.
  'overdue-documents': {
    selector: '[data-deal-card="documents"]',
    label: 'Documents',
  },
  // Missing required fields → the deal profile / details surface,
  // the best existing place to review (and later edit) deal fields.
  'missing-required': {
    selector: '[data-deal-card="deal-summary"]',
    label: 'Deal details',
  },
  // Past target close date lives on the deal record → deal details.
  'past-target-close': {
    selector: '[data-deal-card="deal-summary"]',
    label: 'Deal details',
  },
  // Stale-in-stage → the Stage Map, where stage/entry-date live.
  'stale-stage': {
    selector: '[data-deal-card="stage-progression"]',
    label: 'Stage map',
  },
  // Credit-memo freshness → the Credit Memo panel.
  'credit-memo-freshness': {
    selector: '[data-deal-card="credit-memo"]',
    label: 'Credit memo',
  },
};

/** Return the navigation destination for a signal id, or undefined
 *  when the signal has no known target (render it as read-only). */
export function attentionDestinationFor(
  signalId: string,
): AttentionDestination | undefined {
  return ATTENTION_SIGNAL_DESTINATIONS[signalId];
}

/**
 * Scroll the target surface into view and move focus to it.
 *
 * Read-only: only calls `scrollIntoView` + `focus` on an existing
 * element. Sets `tabindex="-1"` on the wrapper (if absent) so a
 * non-interactive container can receive programmatic focus without
 * joining the tab order — same approach as DealAutopilotPanel.
 *
 * No-ops safely when there is no DOM (SSR) or the target wrapper is
 * absent (e.g. the panel rendered in isolation in a test). Returns
 * true when a target was found and navigated to.
 */
export function focusAttentionTarget(selector: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (typeof el.focus === 'function') {
    if (!el.hasAttribute('tabindex')) {
      el.setAttribute('tabindex', '-1');
    }
    el.focus({ preventScroll: true });
  }
  return true;
}

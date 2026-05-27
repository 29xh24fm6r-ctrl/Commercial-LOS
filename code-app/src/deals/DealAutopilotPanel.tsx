import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import { checkCreditMemoConsistency } from '../shared/creditMemoConsistency/checkCreditMemoConsistency';
import {
  deriveNextBestActions,
  type AutopilotInput,
  type AutopilotPriority,
  type NextBestAction,
} from '../shared/autopilot/dealAutopilot';
import { useSuggestionLedger } from '../shared/autopilot/useSuggestionLedger';
import type { SuggestionLedgerEntry } from '../shared/autopilot/suggestionLedger';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { SeverityMeter } from '../shared/cockpitPrimitives';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 80: Deal Autopilot Lite panel.
 *
 * Surfaces 1–3 deterministic next-best-action suggestions on the
 * Banker Deal Workspace, derived from the deal record + open tasks +
 * documents + memos + activity timeline + Phase 73 memo-consistency
 * check. Every suggestion's `isAutomated` is the literal `false`
 * (typed-level contract) — the panel never executes anything. The
 * banker scrolls to the relevant card and chooses what to do.
 *
 * Allowed navigation: scrollIntoView to one of the four cards
 * BankerDealWorkspace wraps with a data-deal-card="..." attribute.
 * The panel never:
 *   - creates a task,
 *   - marks a document received / reviewed,
 *   - sends an email,
 *   - advances stage,
 *   - calls AI,
 *   - writes to Dataverse,
 *   - emits an audit row or timeline event.
 *
 * Phase 83 — local suggestion ledger:
 *   The panel calls useSuggestionLedger() so it can track per-
 *   suggestion "opened" + "dismissed" state in browser localStorage.
 *   Clicking the action button auto-records "opened"; an inline
 *   "Dismiss locally" button records "dismissed". A dismissed
 *   suggestion is visually muted with a "Dismissed locally" tag and
 *   a "Restore" button. The state is local-only, not synced, never
 *   resolves business workflow — the disclaimer states this.
 */

const PRIORITY_TO_SEVERITY: Record<AutopilotPriority, SeverityKey> = {
  high: 'atRisk',
  medium: 'info',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<AutopilotPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Phase 125C — premium priority chip color system.
 *
 * The Phase 80 `Badge variant={severity}` rendering is preserved
 * for the priority pill so all existing test selectors and
 * accessibility labels keep working. Phase 125C adds an inline
 * left-stripe color on each rollup row based on the priority,
 * pulling from the new cockpit accent palette (cobalt for
 * medium / teal for low / atRisk for high). This gives the
 * banker glanceable priority differentiation in the rendered
 * list without changing the badge or the derivation.
 */
const PRIORITY_TO_STRIPE_TOKEN: Record<AutopilotPriority, string> = {
  high: 'var(--cc-at-risk)',
  medium: 'var(--cc-cobalt)',
  low: 'var(--cc-teal)',
};

export function DealAutopilotPanel() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  // Phase 125 hotfix — hoisted ABOVE every early return so the
  // hook count is identical across initial-loading, no-suggestions,
  // and populated renders. The pre-hotfix version called this
  // hook AFTER the two early returns below, which produced React
  // error #310 ("Rendered more hooks during this render than
  // during the previous render") on the first deal that flipped
  // from `dataReady=false` to `suggestions.length > 0` — exactly
  // the path the Phase 121 seeded deal (`TEST — Deal Phase 121`,
  // closing in 7d) exercises in production. The ledger is still
  // only USED in the populated branch; calling it unconditionally
  // is the correct React Hooks contract.
  const ledger = useSuggestionLedger();

  // Wait until every input is ready before computing. The panel is
  // advisory; rendering against partial data could produce confusing
  // half-suggestions.
  const dataReady =
    tasks.kind === 'ready' &&
    documents.kind === 'ready' &&
    creditMemo.kind === 'ready' &&
    activity.kind === 'ready';

  const memoConsistencyFindingsCount = useMemo(() => {
    if (creditMemo.kind !== 'ready') return 0;
    const result = checkCreditMemoConsistency(deal, creditMemo.data);
    return result.findings.length;
  }, [deal, creditMemo]);

  const now = useMemo(() => new Date(), []);

  const suggestions: NextBestAction[] = useMemo(() => {
    if (!dataReady) return [];
    if (
      tasks.kind !== 'ready' ||
      documents.kind !== 'ready' ||
      creditMemo.kind !== 'ready' ||
      activity.kind !== 'ready'
    ) {
      return [];
    }
    const input: AutopilotInput = {
      deal: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        targetCloseDate: deal.targetCloseDate,
        stageEntryDate: deal.stageEntryDate,
      },
      openTasks: tasks.data.open.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
      })),
      outstandingDocuments: documents.data.outstanding.map((d) => ({
        id: d.id,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
        uploaded: d.uploaded,
      })),
      receivedDocuments: documents.data.received.map((d) => ({
        id: d.id,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
        uploaded: d.uploaded,
      })),
      memos: creditMemo.data.memos.map((m) => ({
        id: m.id,
        statusKey: m.statusKey,
      })),
      memoConsistencyFindingsCount,
      mostRecentActivityIso: activity.data[0]?.eventAt,
    };
    return deriveNextBestActions(input, now);
  }, [
    dataReady,
    tasks,
    documents,
    creditMemo,
    activity,
    deal,
    memoConsistencyFindingsCount,
    now,
  ]);

  if (!dataReady) {
    return (
      <Card>
        <CardHeader
          title="Next best actions"
          subtitle="Loading deal signals…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Next best actions"
          subtitle="Derived from current deal records. Nothing happens automatically."
        />
        <p style={styles.muted}>
          No next-best-action suggestions from current records.
        </p>
        <p style={styles.disclaimer}>
          Autopilot suggests, banker decides. This panel is read-only;
          it never creates tasks, sends emails, advances the stage,
          marks documents reviewed, or calls AI.
        </p>
      </Card>
    );
  }

  // Phase 125D — priority-bucket counts for the ActionConsole
  // header. The buckets always render (zero counts included) so
  // the console reads as a fixed instrument strip, not as a
  // collection of variable widgets.
  const highCount = suggestions.filter((s) => s.priority === 'high').length;
  const mediumCount = suggestions.filter((s) => s.priority === 'medium').length;
  const lowCount = suggestions.filter((s) => s.priority === 'low').length;

  return (
    <Card>
      <CardHeader
        title="Action Console"
        subtitle="Deterministic next-best actions — derived from authorized records. Banker decides."
      />
      <SeverityMeter
        buckets={[
          { severity: 'atRisk', count: highCount, label: 'High' },
          { severity: 'info', count: mediumCount, label: 'Medium' },
          { severity: 'clear', count: lowCount, label: 'Low' },
        ]}
      />
      <ul style={styles.list} aria-label="Next best actions for this deal">
        {suggestions.map((s) => {
          const ledgerKey = `deal-panel|${deal.id}|${s.id}`;
          const entry = ledger.entries[ledgerKey];
          return (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              dealId={deal.id}
              ledgerEntry={entry}
              onDismiss={() =>
                ledger.recordDismissed({
                  surface: 'deal-panel',
                  suggestionId: s.id,
                  dealId: deal.id,
                  titleSnapshot: s.title,
                })
              }
              onRestore={() => ledger.clear(ledgerKey)}
              onOpened={() =>
                ledger.recordOpened({
                  surface: 'deal-panel',
                  suggestionId: s.id,
                  dealId: deal.id,
                  titleSnapshot: s.title,
                })
              }
            />
          );
        })}
      </ul>
      <p style={styles.disclaimer}>
        Autopilot suggests, banker decides. This panel is read-only; it
        never creates tasks, sends emails, advances the stage, marks
        documents reviewed, or calls AI. Suggestions are derived from
        current deal records only. "Dismiss locally" and "Opened locally"
        are tracked on this browser only; they do not change deal status.
      </p>
    </Card>
  );
}

function SuggestionRow({
  suggestion,
  dealId,
  ledgerEntry,
  onDismiss,
  onRestore,
  onOpened,
}: {
  suggestion: NextBestAction;
  dealId: string;
  ledgerEntry: SuggestionLedgerEntry | undefined;
  onDismiss: () => void;
  onRestore: () => void;
  onOpened: () => void;
}) {
  function handleOpen() {
    // Record locally that the banker opened this suggestion. Local
    // ledger only — does not write to Dataverse, does not emit an
    // audit row, does not create a task.
    onOpened();
    // Scroll the target card into view. The card is identified by a
    // data-deal-card attribute on a wrapping div in
    // BankerDealWorkspace. If the wrapper is missing (e.g. during a
    // test render of the panel in isolation), this no-ops safely.
    if (typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>(
      `[data-deal-card="${suggestion.targetSurface}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Best-effort focus: if the card wrapper or its first focusable
    // descendant accepts focus, move focus there so keyboard users
    // follow the scroll. We never force a focus into a write
    // surface — focus lands on the card container.
    if (typeof el.focus === 'function') {
      // tabIndex -1 lets a div be focused programmatically without
      // joining the tab order. Set it on the wrapper if it doesn't
      // already declare a tabindex.
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
      }
      el.focus({ preventScroll: true });
    }
  }
  const severity = PRIORITY_TO_SEVERITY[suggestion.priority];
  const stripeColor = PRIORITY_TO_STRIPE_TOKEN[suggestion.priority];
  const descId = `autopilot-reason-${dealId}-${suggestion.id}`;
  const isDismissed = ledgerEntry?.action === 'dismissed';
  const isOpened = ledgerEntry?.action === 'opened';
  return (
    <li
      style={{
        ...styles.row,
        // Phase 125C — premium priority differentiation: cobalt for
        // medium, teal for low, at-risk red for high. Read-only
        // accent stripe; never changes data or derivation.
        borderLeft: `3px solid ${stripeColor}`,
        ...(isDismissed ? styles.rowDismissed : null),
      }}
    >
      <div style={styles.rowHead}>
        <span style={styles.rowTitle}>{suggestion.title}</span>
        <Badge
          variant={severity}
          appearance="outline"
          aria-label={`${PRIORITY_LABEL[suggestion.priority]} priority suggestion`}
        >
          {PRIORITY_LABEL[suggestion.priority]}
        </Badge>
      </div>
      <p id={descId} style={styles.rowReason}>
        {suggestion.reason}
      </p>
      {isDismissed ? (
        <div style={styles.rowFoot}>
          <span style={styles.dismissedTag}>
            Dismissed locally · {formatLedgerDate(ledgerEntry.recordedAt)} ·
            tracked on this browser
          </span>
          <button
            type="button"
            onClick={onRestore}
            style={styles.ledgerSecondaryButton}
            aria-label={`Restore suggestion ${suggestion.title}`}
          >
            Restore
          </button>
        </div>
      ) : (
        <div style={styles.rowFoot}>
          <button
            type="button"
            onClick={handleOpen}
            style={styles.openButton}
            aria-describedby={descId}
            aria-label={`${suggestion.suggestedActionLabel} — banker chooses what to do`}
          >
            {suggestion.suggestedActionLabel}
          </button>
          {isOpened && (
            <span style={styles.openedTag}>
              Opened locally · {formatLedgerDate(ledgerEntry.recordedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={onDismiss}
            style={styles.ledgerSecondaryButton}
            aria-label={`Dismiss suggestion ${suggestion.title} locally`}
          >
            Dismiss locally
          </button>
          <span style={styles.basisLine}>
            Basis: {suggestion.sourceSignals.join(', ')}
          </span>
        </div>
      )}
    </li>
  );
}

function formatLedgerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  row: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  rowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  rowTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  rowReason: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  rowFoot: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingTop: 2,
  },
  openButton: {
    background: palette.surface,
    color: palette.primary,
    border: `1px solid ${palette.primary}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  basisLine: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontFamily: typography.mono,
  },
  rowDismissed: {
    opacity: 0.6,
  },
  dismissedTag: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  openedTag: {
    fontSize: typography.size.xs,
    color: palette.clearFg,
    fontStyle: 'italic',
  },
  ledgerSecondaryButton: {
    background: 'transparent',
    color: palette.textMuted,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.sm,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
};

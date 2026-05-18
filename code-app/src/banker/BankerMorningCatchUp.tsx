import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveBankerMorningCatchUp,
  type BankerCatchUpItem,
  type BankerCatchUpPriority,
} from '../shared/activity/bankerMorningCatchUp';
import {
  buildCatchUpScope,
  summarizeCatchUpSinceLastSeen,
} from '../shared/lastVisit/catchUpLastSeen';
import { useCatchUpLastSeen } from '../shared/lastVisit/useCatchUpLastSeen';
import {
  buildCatchUpLedgerKey,
  type CatchUpLedgerEntry,
} from '../shared/activity/catchUpItemLedger';
import { useCatchUpItemLedger } from '../shared/activity/useCatchUpItemLedger';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 89: banker-side "morning catch-up" card on the Banker
 * Command Center.
 *
 * Reads `loadBankerWorkQueueData(bankerId)` — the same banker-
 * authorized two-step pipeline Phase 82's `<BankerAutopilotRollup />`
 * already uses — and passes it through the Phase 89 thin adapter
 * (`deriveBankerMorningCatchUp`) which delegates to Phase 88's
 * `deriveManagerMorningCatchUp` primitive.
 *
 * Complementary to (not duplicative of) `<BankerAutopilotRollup />`:
 *   - Autopilot answers "what should I DO next on this deal?" — one
 *     action-oriented row per deal.
 *   - Morning catch-up answers "what HAPPENED across my pipeline /
 *     what NEEDS attention?" — multiple observation-oriented items
 *     per deal possible, including data-quality items.
 *
 * Banker-only by construction: lives under BankerProvider, consumes
 * `loadBankerWorkQueueData(bankerId)`. The banker IS the assigned
 * banker on every deal in the result, so the
 * `missing-assigned-banker` data-quality signal never fires here
 * (the adapter stamps the signed-in banker's name on every deal
 * before the primitive runs its check).
 *
 * No Dataverse write, no audit row, no timeline event. No AI. No
 * automation. No real-time / push surface — the card refreshes when
 * its load runs, which happens on mount.
 */

const PRIORITY_TO_SEVERITY: Record<BankerCatchUpPriority, SeverityKey> = {
  high: 'atRisk',
  medium: 'info',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<BankerCatchUpPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function BankerMorningCatchUp() {
  const { bankerId, fullName } = useBanker();
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Phase 90: local-only "since last visit" marker scoped to the
  // signed-in banker. The hook snapshots the prior marker on mount
  // and bumps it after a 2-second settle. The card uses the snapshot
  // for the "N new since your last visit" badge.
  const scope = useMemo(
    () => buildCatchUpScope({ surface: 'banker', userId: bankerId }),
    [bankerId],
  );
  const lastSeen = useCatchUpLastSeen(scope);

  const reload = useCallback(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: 'failed', message });
      });
    return () => {
      cancelled = true;
    };
  }, [bankerId]);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  return (
    <Card>
      <CardHeader
        title="Morning catch-up"
        subtitle="Derived from your current records. Nothing happens automatically."
      />
      <BodyWithLedger
        state={state}
        bankerName={fullName}
        priorLastSeenMs={lastSeen.priorLastSeenMs}
        isInitialized={lastSeen.isInitialized}
        isUnscoped={lastSeen.isUnscoped}
      />
    </Card>
  );
}

/** Hooks the catch-up item ledger in and delegates to Body. Split
 *  out so the ledger hook only runs when the card is mounted, and
 *  so the Body remains testable as a pure function over its props
 *  if we ever need to split it further. */
function BodyWithLedger(props: {
  state: State;
  bankerName: string | undefined;
  priorLastSeenMs: number | undefined;
  isInitialized: boolean;
  isUnscoped: boolean;
}) {
  const ledger = useCatchUpItemLedger();
  return <Body {...props} ledger={ledger} />;
}

function Body({
  state,
  bankerName,
  priorLastSeenMs,
  isInitialized,
  isUnscoped,
  ledger,
}: {
  state: State;
  bankerName: string | undefined;
  priorLastSeenMs: number | undefined;
  isInitialized: boolean;
  isUnscoped: boolean;
  ledger: ReturnType<typeof useCatchUpItemLedger>;
}) {
  const now = useMemo(() => new Date(), []);

  if (state.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load catch-up" detail={state.message} />
    );
  }
  if (state.kind === 'loading') {
    return <p style={styles.muted}>Loading catch-up…</p>;
  }

  const items = deriveBankerMorningCatchUp(
    {
      deals: state.data.deals.map((d) => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        targetCloseDate: d.targetCloseDate,
        stageEntryDate: d.stageEntryDate,
        lastActivityOn: d.lastActivityOn,
      })),
      tasks: state.data.tasks.map((t) => ({
        id: t.id,
        dealId: t.dealId,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
      })),
      outstandingDocuments: state.data.outstandingDocuments.map((d) => ({
        id: d.id,
        dealId: d.dealId,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
      })),
      pendingReviewDocuments: state.data.pendingReviewDocuments.map((d) => ({
        id: d.id,
        dealId: d.dealId,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
      })),
      memos: state.data.memos.map((m) => ({
        id: m.id,
        dealId: m.dealId,
        statusKey: m.statusKey,
      })),
      bankerName,
    },
    now,
  );

  // Phase 91: filter out currently-snoozed items entirely (they
  // re-appear after snoozeUntil passes); keep dismissed items in
  // the list so the user can Restore them. The filtering happens
  // BEFORE the "since last visit" comparison so the count line
  // reflects only items the user can actually see.
  const visibleItems = items.filter((item) => {
    const entry = ledger.entries[
      buildCatchUpLedgerKey({ surface: 'banker-catch-up', itemKey: item.id })
    ];
    if (entry?.action === 'snoozed') {
      const untilMs = Date.parse(entry.snoozeUntil ?? '');
      if (Number.isFinite(untilMs) && untilMs > now.getTime()) return false;
    }
    return true;
  });

  // Phase 90: derive "since last visit" overlay. When the scope is
  // unavailable (no bankerId resolved yet) OR the snapshot has not
  // initialized, fall through with isFirstVisit semantics — the badge
  // simply doesn't render until we have a reliable comparison base.
  const sinceLastSeen = summarizeCatchUpSinceLastSeen(
    visibleItems,
    isInitialized && !isUnscoped ? priorLastSeenMs : undefined,
    now,
  );

  if (visibleItems.length === 0) {
    return (
      <>
        <p style={styles.muted}>No catch-up items from current records.</p>
        {renderSinceLastVisitLine(sinceLastSeen, isUnscoped, /*populated*/ false)}
        <p style={styles.disclaimer}>
          Derived from your current records. Nothing happens automatically.
          Not AI-generated.
        </p>
      </>
    );
  }

  return (
    <div style={styles.section}>
      {renderSinceLastVisitLine(sinceLastSeen, isUnscoped, /*populated*/ true)}
      <ul style={styles.list} aria-label="Banker morning catch-up items">
        {visibleItems.map((item) => {
          const ledgerKey = buildCatchUpLedgerKey({
            surface: 'banker-catch-up',
            itemKey: item.id,
          });
          return (
            <FeedItemRow
              key={item.id}
              item={item}
              isNew={sinceLastSeen.isNew(item.occurredAt)}
              ledgerEntry={ledger.entries[ledgerKey]}
              onDismiss={() =>
                ledger.recordDismissed({
                  surface: 'banker-catch-up',
                  itemKey: item.id,
                  itemKind: item.kind,
                  dealId: item.dealId,
                  titleSnapshot: item.title,
                })
              }
              onSnooze={() =>
                ledger.recordSnoozed({
                  surface: 'banker-catch-up',
                  itemKey: item.id,
                  itemKind: item.kind,
                  dealId: item.dealId,
                  titleSnapshot: item.title,
                })
              }
              onRestore={() => ledger.clear(ledgerKey)}
            />
          );
        })}
      </ul>
      <p style={styles.signalCoverage}>
        Catch-up uses your current pipeline records (deals, open tasks,
        outstanding and pending-review documents, memos). Items observed
        only; no action runs from this card.
      </p>
      <p style={styles.disclaimer}>
        Derived from your current records. Nothing happens automatically.
        Not AI-generated. No AI or automated decisions. Pipeline scope
        is the banker's authorized deals; deals outside that scope are
        not evaluated and not surfaced here. "New since your last visit"
        is tracked on this browser only; it is not synced and does not
        change deal status. "Dismiss locally" and "Snooze locally" are
        tracked on this browser only; they do not change deal status.
      </p>
    </div>
  );
}

function renderSinceLastVisitLine(
  summary: { newCount: number; isFirstVisit: boolean },
  isUnscoped: boolean,
  populated: boolean,
): ReactElement | null {
  if (isUnscoped) {
    return (
      <p
        style={populated ? styles.sinceLine : styles.sinceLineEmpty}
        aria-label="Catch-up last-seen status"
      >
        Last-seen marker unavailable for this browser.
      </p>
    );
  }
  if (summary.isFirstVisit) {
    return (
      <p
        style={populated ? styles.sinceLine : styles.sinceLineEmpty}
        aria-label="Catch-up last-seen status"
      >
        First visit on this browser.
      </p>
    );
  }
  if (summary.newCount === 0) {
    return (
      <p
        style={populated ? styles.sinceLine : styles.sinceLineEmpty}
        aria-label="Catch-up last-seen status"
      >
        No new items since your last visit on this browser.
      </p>
    );
  }
  return (
    <p
      style={populated ? styles.sinceLine : styles.sinceLineEmpty}
      aria-label="Catch-up last-seen status"
    >
      {summary.newCount} new since your last visit on this browser.
    </p>
  );
}

function FeedItemRow({
  item,
  isNew,
  ledgerEntry,
  onDismiss,
  onSnooze,
  onRestore,
}: {
  item: BankerCatchUpItem;
  isNew: boolean;
  ledgerEntry: CatchUpLedgerEntry | undefined;
  onDismiss: () => void;
  onSnooze: () => void;
  onRestore: () => void;
}) {
  const navigate = useNavigate();
  const severity = PRIORITY_TO_SEVERITY[item.priority];
  const isDismissedRow = ledgerEntry?.action === 'dismissed';
  return (
    <li
      style={isDismissedRow ? { ...styles.row, ...styles.rowDismissed } : styles.row}
    >
      <div style={styles.rowHead}>
        <button
          type="button"
          onClick={() => navigate(`/deals/${item.dealId}`)}
          style={styles.dealNameButton}
          aria-label={`Open deal ${item.dealName}`}
        >
          {item.dealName}
        </button>
        <div style={styles.rowBadges}>
          {isNew && !isDismissedRow && (
            <Badge
              variant="info"
              appearance="soft"
              aria-label="New since your last visit on this browser"
            >
              New
            </Badge>
          )}
          <Badge
            variant={severity}
            appearance="outline"
            aria-label={`${PRIORITY_LABEL[item.priority]} priority`}
          >
            {PRIORITY_LABEL[item.priority]}
          </Badge>
        </div>
      </div>
      <p style={styles.rowTitle}>{item.title}</p>
      <p style={styles.rowReason}>{item.reason}</p>
      <div style={styles.rowMeta}>
        <span>
          <span style={styles.metaLabel}>Source: </span>
          {item.source}
        </span>
        {item.occurredAt && (
          <span>
            <span style={styles.metaLabel}>Anchored: </span>
            {formatAnchor(item.occurredAt)}
          </span>
        )}
      </div>
      <div style={styles.ledgerRow}>
        {isDismissedRow ? (
          <>
            <span style={styles.dismissedTag}>
              Dismissed locally · {formatLedgerDate(ledgerEntry.recordedAt)}
              {' '}· tracked on this browser
            </span>
            <button
              type="button"
              onClick={onRestore}
              style={styles.ledgerSecondaryButton}
              aria-label={`Restore catch-up item for ${item.dealName}`}
            >
              Restore
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onDismiss}
              style={styles.ledgerSecondaryButton}
              aria-label={`Dismiss catch-up item for ${item.dealName} locally`}
            >
              Dismiss locally
            </button>
            <button
              type="button"
              onClick={onSnooze}
              style={styles.ledgerSecondaryButton}
              aria-label={`Snooze catch-up item for ${item.dealName} 24 hours locally`}
            >
              Snooze 24h
            </button>
          </>
        )}
      </div>
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

function ErrorBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={styles.errorBox} role="alert">
      <div style={styles.errorTitle}>{title}</div>
      <div style={styles.errorDetail}>{detail}</div>
      <div style={styles.errorHint}>Refresh to retry.</div>
    </div>
  );
}

function formatAnchor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: spacing.md },
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
  dealNameButton: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: palette.primary,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: 3,
    fontFamily: typography.family,
  },
  rowTitle: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
    fontWeight: typography.weight.medium,
  },
  rowReason: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
  },
  rowMeta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.xs,
    color: palette.textMuted,
    paddingTop: 2,
  },
  metaLabel: { color: palette.textSubtle },
  rowBadges: {
    display: 'flex',
    gap: spacing.xs,
    alignItems: 'center',
    flexShrink: 0,
  },
  rowDismissed: { opacity: 0.6 },
  ledgerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  dismissedTag: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
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
  sinceLine: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  sinceLineEmpty: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
    paddingTop: spacing.xs,
  },
  signalCoverage: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    fontStyle: 'italic',
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
  errorBox: {
    background: palette.blockedBg,
    border: `1px solid ${palette.blockedBg}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  errorTitle: {
    color: palette.blockedFg,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.md,
  },
  errorDetail: { color: palette.text, fontSize: typography.size.sm },
  errorHint: {
    color: palette.textMuted,
    fontSize: typography.size.xs,
    fontStyle: 'italic',
  },
};

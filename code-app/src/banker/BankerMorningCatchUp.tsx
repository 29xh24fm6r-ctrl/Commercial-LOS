import { useCallback, useEffect, useMemo, useState } from 'react';
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
      <Body state={state} bankerName={fullName} />
    </Card>
  );
}

function Body({
  state,
  bankerName,
}: {
  state: State;
  bankerName: string | undefined;
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

  if (items.length === 0) {
    return (
      <>
        <p style={styles.muted}>No catch-up items from current records.</p>
        <p style={styles.disclaimer}>
          Derived from your current records. Nothing happens automatically.
          Not AI-generated.
        </p>
      </>
    );
  }

  return (
    <div style={styles.section}>
      <ul style={styles.list} aria-label="Banker morning catch-up items">
        {items.map((item) => (
          <FeedItemRow key={item.id} item={item} />
        ))}
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
        not evaluated and not surfaced here.
      </p>
    </div>
  );
}

function FeedItemRow({ item }: { item: BankerCatchUpItem }) {
  const navigate = useNavigate();
  const severity = PRIORITY_TO_SEVERITY[item.priority];
  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <button
          type="button"
          onClick={() => navigate(`/deals/${item.dealId}`)}
          style={styles.dealNameButton}
          aria-label={`Open deal ${item.dealName}`}
        >
          {item.dealName}
        </button>
        <Badge
          variant={severity}
          appearance="outline"
          aria-label={`${PRIORITY_LABEL[item.priority]} priority`}
        >
          {PRIORITY_LABEL[item.priority]}
        </Badge>
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
    </li>
  );
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

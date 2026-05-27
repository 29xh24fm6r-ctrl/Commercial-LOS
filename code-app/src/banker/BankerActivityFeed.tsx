import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { LoadingState } from '../shared/LoadingState';
import { ErrorState } from '../shared/ErrorState';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 120 — banker cross-deal Activity feed (wave-2 restoration).
 *
 * Honest scope: this feed surfaces recent-modification timestamps
 * (`modifiedon` from deals + tasks + outstanding documents +
 * pending-review documents + memos) already loaded by
 * `loadBankerWorkQueueData`. Each row is real data — a row whose
 * `modifiedon` value we observed in the current load.
 *
 * What this is NOT:
 *   - Not the per-deal `ActivityTimeline` (which loads
 *     `cr664_dealtimelineevent` rows). That table is not queried
 *     banker-cross-deal anywhere in the app today, and Phase 120
 *     does not add a new loader for it.
 *   - Not a notification stream / push feed.
 *   - Not an audit log surface.
 *
 * The disclaimer wording in the card subtitle states exactly this
 * so the user knows the per-deal timeline is the canonical source
 * for status changes / communication events.
 *
 * No governed write is triggered by rendering this card. No
 * email-lane import. The component takes no Outlook adapter.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

interface ActivityRow {
  key: string;
  kind: 'Deal' | 'Task' | 'Document' | 'Memo';
  title: string;
  dealId: string | undefined;
  dealName: string | undefined;
  timestampIso: string;
}

const MAX_ROWS = 20;

export function BankerActivityFeed() {
  const { bankerId } = useBanker();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
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

  const rows = useMemo(() => {
    if (state.kind !== 'ready') return [] as ActivityRow[];
    return deriveActivityRows(state.data);
  }, [state]);

  if (state.kind === 'loading') {
    return <LoadingState message="Loading recent updates…" />;
  }
  if (state.kind === 'failed') {
    return (
      <ErrorState
        title="Could not load recent updates"
        detail={state.message}
        hint="Refresh to retry."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        title="Recent updates across your active deals"
        subtitle="Derived from modifiedon timestamps on deals, tasks, documents, and memos already loaded by your work queue. Not the per-deal Activity Timeline — open a specific deal for its full event history."
      />
      {rows.length === 0 ? (
        <p style={styles.empty}>
          No recent updates on your active deals. When deals, tasks,
          documents, or memos are touched, they will appear here.
        </p>
      ) : (
        <ul style={styles.list}>
          {rows.map((r) => (
            <li key={r.key} style={styles.item}>
              <div style={styles.itemHeader}>
                <Badge variant="neutral" appearance="outline">{r.kind}</Badge>
                <span style={styles.itemWhen}>{formatRelative(r.timestampIso)}</span>
              </div>
              <div style={styles.itemTitle}>{r.title}</div>
              {r.dealName && (
                <button
                  type="button"
                  style={styles.dealLink}
                  onClick={() => r.dealId && navigate(`/deals/${r.dealId}`)}
                  disabled={!r.dealId}
                  aria-label={`Open deal ${r.dealName}`}
                >
                  Deal: {r.dealName}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function deriveActivityRows(data: BankerWorkQueueData): ActivityRow[] {
  const dealById = new Map<string, string>();
  for (const d of data.deals) dealById.set(d.id, d.name);

  const rows: ActivityRow[] = [];

  for (const d of data.deals) {
    if (!d.lastActivityOn) continue;
    rows.push({
      key: `deal:${d.id}`,
      kind: 'Deal',
      title: d.name,
      dealId: d.id,
      dealName: d.name,
      timestampIso: d.lastActivityOn,
    });
  }
  for (const t of data.tasks) {
    if (!t.modifiedOn) continue;
    rows.push({
      key: `task:${t.id}`,
      kind: 'Task',
      title: t.title,
      dealId: t.dealId,
      dealName: dealById.get(t.dealId),
      timestampIso: t.modifiedOn,
    });
  }
  for (const docList of [data.outstandingDocuments, data.pendingReviewDocuments]) {
    for (const doc of docList) {
      if (!doc.modifiedOn) continue;
      rows.push({
        key: `doc:${doc.id}`,
        kind: 'Document',
        title: doc.name,
        dealId: doc.dealId,
        dealName: dealById.get(doc.dealId),
        timestampIso: doc.modifiedOn,
      });
    }
  }
  for (const m of data.memos) {
    const ts = m.modifiedOn ?? m.generatedAt;
    if (!ts) continue;
    rows.push({
      key: `memo:${m.id}`,
      kind: 'Memo',
      title: m.name,
      dealId: m.dealId,
      dealName: dealById.get(m.dealId),
      timestampIso: ts,
    });
  }

  return rows
    .filter((r) => !Number.isNaN(new Date(r.timestampIso).getTime()))
    .sort((a, b) => {
      const at = new Date(a.timestampIso).getTime();
      const bt = new Date(b.timestampIso).getTime();
      return bt - at;
    })
    .slice(0, MAX_ROWS);
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.snug,
    padding: `${spacing.lg} ${spacing.xl}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
    textAlign: 'center' as const,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    background: palette.surface,
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  itemWhen: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    letterSpacing: typography.letterSpacing.label,
  },
  itemTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  dealLink: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: palette.primary,
    cursor: 'pointer',
    fontSize: typography.size.xs,
    fontFamily: typography.family,
    textAlign: 'left',
  },
};

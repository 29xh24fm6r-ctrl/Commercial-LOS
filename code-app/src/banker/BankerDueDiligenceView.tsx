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
 * Phase 120 — banker cross-deal Due Diligence view (wave-2 restoration).
 *
 * The original product's Due Diligence tab listed all documents the
 * banker still owed or still needed to review, across every deal.
 * Phase 120 restores that surface as a read-oriented banker-cross-deal
 * documents view, composed from `loadBankerWorkQueueData`'s already-
 * loaded outstanding + pending-review document buckets.
 *
 * Read-only by deliberate scope:
 *   - The existing governed write actions (Request / Mark Received /
 *     Mark Reviewed / Create Review Task) live on `MyWorkQueue` and
 *     the per-deal `DealDocuments` card. The Phase 120 tab does
 *     NOT duplicate those buttons — its job is the overview view,
 *     not a second write surface.
 *   - Each row provides an "Open deal" affordance to navigate to
 *     the per-deal DealDocuments card where the governed action
 *     buttons live.
 *
 * No new Dataverse query. No governed write. No email-lane import.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function BankerDueDiligenceView() {
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

  const groups = useMemo(() => {
    if (state.kind !== 'ready') {
      return { outstanding: [], pendingReview: [], dealName: new Map<string, string>() };
    }
    const dealName = new Map<string, string>();
    for (const d of state.data.deals) dealName.set(d.id, d.name);
    return {
      outstanding: state.data.outstandingDocuments,
      pendingReview: state.data.pendingReviewDocuments,
      dealName,
    };
  }, [state]);

  if (state.kind === 'loading') {
    return <LoadingState message="Loading due-diligence documents…" />;
  }
  if (state.kind === 'failed') {
    return (
      <ErrorState
        title="Could not load due-diligence documents"
        detail={state.message}
        hint="Refresh to retry."
      />
    );
  }

  const totalCount = groups.outstanding.length + groups.pendingReview.length;

  return (
    <Card>
      <CardHeader
        title="Due diligence — documents across your active deals"
        subtitle="Read-oriented overview. To request, mark received, or mark reviewed, open the per-deal Documents card."
      />
      {totalCount === 0 ? (
        <p style={styles.empty}>
          No outstanding or pending-review documents on your active
          deals. When documents are requested or received, they will
          appear here.
        </p>
      ) : (
        <div style={styles.sectionStack}>
          <section style={styles.section} aria-label="Outstanding documents">
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Outstanding</span>
              <span style={styles.sectionCount}>
                {groups.outstanding.length} document{groups.outstanding.length === 1 ? '' : 's'}
              </span>
            </div>
            {groups.outstanding.length === 0 ? (
              <p style={styles.empty}>No outstanding documents.</p>
            ) : (
              <ul style={styles.list}>
                {groups.outstanding.map((doc) => (
                  <li key={doc.id} style={styles.item}>
                    <div style={styles.itemHeaderRow}>
                      <span style={styles.itemTitle}>{doc.name}</span>
                      <Badge variant="neutral" appearance="outline">Awaiting receipt</Badge>
                    </div>
                    <DocMeta
                      dealName={groups.dealName.get(doc.dealId)}
                      onOpen={() => doc.dealId && navigate(`/deals/${doc.dealId}`)}
                      due={doc.dueDate}
                      requested={doc.requestDate}
                      received={undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={styles.section} aria-label="Pending-review documents">
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Pending review</span>
              <span style={styles.sectionCount}>
                {groups.pendingReview.length} document{groups.pendingReview.length === 1 ? '' : 's'}
              </span>
            </div>
            {groups.pendingReview.length === 0 ? (
              <p style={styles.empty}>No documents pending review.</p>
            ) : (
              <ul style={styles.list}>
                {groups.pendingReview.map((doc) => (
                  <li key={doc.id} style={styles.item}>
                    <div style={styles.itemHeaderRow}>
                      <span style={styles.itemTitle}>{doc.name}</span>
                      <Badge variant="neutral" appearance="outline">Received, awaiting review</Badge>
                    </div>
                    <DocMeta
                      dealName={groups.dealName.get(doc.dealId)}
                      onOpen={() => doc.dealId && navigate(`/deals/${doc.dealId}`)}
                      due={doc.dueDate}
                      requested={doc.requestDate}
                      received={doc.receivedDate}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}

function DocMeta({
  dealName,
  onOpen,
  due,
  requested,
  received,
}: {
  dealName: string | undefined;
  onOpen: () => void;
  due: string | undefined;
  requested: string | undefined;
  received: string | undefined;
}) {
  return (
    <div style={styles.meta}>
      {dealName && (
        <button
          type="button"
          style={styles.dealLink}
          onClick={onOpen}
          aria-label={`Open deal ${dealName}`}
        >
          Deal: {dealName}
        </button>
      )}
      <span style={styles.metaItem}>Due: {formatDate(due)}</span>
      <span style={styles.metaItem}>Requested: {formatDate(requested)}</span>
      <span style={styles.metaItem}>Received: {formatDate(received)}</span>
    </div>
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
  sectionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottom: `2px solid ${palette.border}`,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: palette.text,
    letterSpacing: typography.letterSpacing.heading,
  },
  sectionCount: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
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
  itemHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  metaItem: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
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

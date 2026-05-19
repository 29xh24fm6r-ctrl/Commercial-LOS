import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveRelationshipMemory,
  type RelationshipDealSnapshot,
  type RelationshipMemoryEntry,
} from '../shared/relationship/relationshipMemory';
import { buildRelationshipMemoryTeamsSummary } from '../shared/relationship/relationshipMemoryTeamsSummary';
import { SummaryOutlookHandoffButtons } from '../shared/email/SummaryOutlookHandoffButtons';
import { relationshipMemoryOutlookSubject } from '../shared/email/summaryOutlookHandoff';
import { RelationshipNoteDraftModal } from './RelationshipNoteDraftModal';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 76: deterministic relationship-memory snapshot.
 *
 * Per-client view derived from the banker work-queue data the
 * workspace already loads. Surfaces the same data the banker can
 * find by walking each deal individually, but rolled up by client
 * name so a borrower interaction has one place to look:
 *   - active deal count and total pipeline;
 *   - most-recent activity + nearest upcoming close;
 *   - open asks (outstanding documents + open tasks, listed
 *     separately so the banker can see whose ask is whose);
 *   - attention badges (overdue tasks, pending review, closing
 *     soon, stage attention, draft memos).
 *
 * Grouping is by normalized client-name (the only client-identity
 * field on the deal record today). Two deals naming the borrower
 * differently appear as separate entries — an honest limitation the
 * disclaimer spells out. The Phase 76 doc enumerates the future
 * upgrade path (borrower entity id, relationship graph table,
 * Outlook/Teams activity ingestion).
 *
 * Not AI. Not a relationship score. Not a verified household /
 * entity linkage. Not cross-borrower deduplication. No new write.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function RelationshipMemory() {
  const { bankerId } = useBanker();
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

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader
          title="Relationship Memory"
          subtitle="Loading client snapshot…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Card>
        <CardHeader
          title="Relationship Memory"
          subtitle="Could not load client snapshot."
        />
        <ErrorBlock
          title="Could not load relationship memory"
          detail={state.message}
        />
      </Card>
    );
  }

  return <Ready data={state.data} />;
}

function Ready({ data }: { data: BankerWorkQueueData }) {
  const { fullName } = useBanker();
  const now = useMemo(() => new Date(), []);
  const entries = useMemo(
    () => deriveRelationshipMemory(data, now),
    [data, now],
  );
  const nowMs = now.getTime();
  // Phase 78: local-only relationship-note draft. State lives in
  // React only; closing the modal drops the draft. No Dataverse
  // write, no audit, no timeline.
  const [draftFor, setDraftFor] = useState<RelationshipMemoryEntry | null>(
    null,
  );

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Relationship Memory"
          subtitle="No active deals assigned to you."
        />
        <p style={styles.muted}>
          When deals are assigned to you, this snapshot will populate by
          client name from visible records.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Relationship Memory"
          subtitle={`${entries.length} client${entries.length === 1 ? '' : 's'} — derived from visible records. Client-name grouped.`}
        />
        <ul style={styles.list} aria-label="Relationship memory clients">
          {entries.map((entry) => (
            <ClientRow
              key={entry.clientNameKey}
              entry={entry}
              nowMs={nowMs}
              onDraftNote={() => setDraftFor(entry)}
            />
          ))}
        </ul>
        <p style={styles.disclaimer}>
          Derived from visible records. Client-name grouped, so two deals
          naming the borrower differently ("Acme, LLC" vs "Acme LLC")
          appear as separate entries. This is a relationship snapshot, not
          a verified relationship graph, not a household linkage, not a
          relationship score. No predictive claim. Open the relevant deal
          to act.
        </p>
      </Card>
      {draftFor && (
        <RelationshipNoteDraftModal
          clientName={
            draftFor.isClientNameMissing
              ? '(no borrower name on record)'
              : draftFor.clientNameDisplay
          }
          bankerName={fullName}
          deals={draftFor.deals.map((d) => ({
            dealName: d.dealName,
            stage: d.stage,
          }))}
          onClose={() => setDraftFor(null)}
        />
      )}
    </>
  );
}

function ClientRow({
  entry,
  nowMs,
  onDraftNote,
}: {
  entry: RelationshipMemoryEntry;
  nowMs: number;
  onDraftNote: () => void;
}) {
  const navigate = useNavigate();
  const displayName = entry.isClientNameMissing
    ? '(no borrower name on record)'
    : entry.clientNameDisplay;
  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <span style={styles.clientName}>{displayName}</span>
        <div style={styles.rowMetaInline}>
          <span style={styles.metaItem}>
            {entry.activeDealCount} active deal
            {entry.activeDealCount === 1 ? '' : 's'}
          </span>
          {entry.totalAmount > 0 && (
            <span style={styles.metaItem}>
              · Pipeline {formatCurrency(entry.totalAmount)}
              {entry.dealsMissingAmount > 0 && (
                <span style={styles.gapInline}>
                  {' '}
                  ({entry.dealsMissingAmount} missing $)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      <div style={styles.timelineRow}>
        <span style={styles.metaLabel}>Last activity:</span>{' '}
        <span style={styles.metaValue}>
          {formatRelativeIso(entry.mostRecentActivityIso, nowMs)}
        </span>
        <span style={styles.timelineSep}>·</span>
        <span style={styles.metaLabel}>Nearest upcoming close:</span>{' '}
        <span style={styles.metaValue}>
          {formatRelativeIso(entry.nearestUpcomingCloseIso, nowMs, {
            future: true,
          })}
        </span>
      </div>

      <div style={styles.asksRow}>
        <span style={styles.metaItem}>
          <span style={styles.metaLabel}>Open document requests:</span>{' '}
          <strong>{entry.outstandingDocumentCount}</strong>
        </span>
        <span style={styles.metaItem}>
          <span style={styles.metaLabel}>Open tasks:</span>{' '}
          <strong>{entry.openTaskCount}</strong>
          {entry.overdueTaskCount > 0 && (
            <span style={styles.overdueInline}>
              {' '}
              ({entry.overdueTaskCount} overdue)
            </span>
          )}
        </span>
      </div>

      {(entry.pendingReviewDocumentCount > 0 ||
        entry.closingSoonCount > 0 ||
        entry.stageAtRiskCount > 0 ||
        entry.draftMemoCount > 0) && (
        <div style={styles.badgeRow}>
          {entry.pendingReviewDocumentCount > 0 && (
            <Badge
              variant="atRisk"
              appearance="outline"
              aria-label={`Documents may require review: ${entry.pendingReviewDocumentCount}`}
            >
              {entry.pendingReviewDocumentCount} may require review
            </Badge>
          )}
          {entry.closingSoonCount > 0 && (
            <Badge
              variant="info"
              appearance="outline"
              aria-label={`Closing within 14 days: ${entry.closingSoonCount}`}
            >
              {entry.closingSoonCount} closing soon
            </Badge>
          )}
          {entry.stageAtRiskCount > 0 && (
            <Badge
              variant="atRisk"
              appearance="outline"
              aria-label={`Deals at or past 30 days in current stage: ${entry.stageAtRiskCount}`}
            >
              {entry.stageAtRiskCount} stage attention
            </Badge>
          )}
          {entry.draftMemoCount > 0 && (
            <Badge
              variant="neutral"
              appearance="outline"
              aria-label={`Draft credit memos: ${entry.draftMemoCount}`}
            >
              {entry.draftMemoCount} draft memo
              {entry.draftMemoCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      )}

      <ul style={styles.dealList} aria-label="Active deals">
        {entry.deals.map((d) => (
          <DealPill
            key={d.dealId}
            deal={d}
            onOpen={() => navigate(`/deals/${d.dealId}`)}
          />
        ))}
      </ul>

      <div style={styles.rowActions}>
        <button
          type="button"
          onClick={onDraftNote}
          style={styles.draftNoteButton}
          aria-label={`Draft relationship note for ${entry.isClientNameMissing ? 'this client (no borrower name on record)' : entry.clientNameDisplay}`}
        >
          Draft relationship note
        </button>
        <RelationshipMemoryTeamsCopyButton entry={entry} />
      </div>
      <RelationshipMemoryOutlookHandoff entry={entry} />
    </li>
  );
}

/**
 * Phase 101: Outlook handoff sibling for each Phase 100 Relationship
 * Memory row. Emits the same plain-text snapshot the Phase 100 Teams
 * copy button does, wrapped in the verbatim Phase 101 subject
 * "Relationship snapshot — <Client Name>" (or "(no borrower name
 * on record)" placeholder when missing). Does NOT save relationship
 * notes, open the Phase 78 draft modal, or mutate the Phase 83 /
 * 90 / 91 ledgers.
 */
function RelationshipMemoryOutlookHandoff({
  entry,
}: {
  entry: RelationshipMemoryEntry;
}) {
  const body = useMemo(
    () =>
      buildRelationshipMemoryTeamsSummary({
        entry,
        generatedAt: new Date(),
      }),
    [entry],
  );
  const ariaName = entry.isClientNameMissing
    ? '(no borrower name on record)'
    : entry.clientNameDisplay;
  return (
    <SummaryOutlookHandoffButtons
      subject={relationshipMemoryOutlookSubject(
        entry.clientNameDisplay,
        entry.isClientNameMissing,
      )}
      body={body}
      ariaContext={`${ariaName} relationship snapshot`}
    />
  );
}

/**
 * Phase 100: inline "Copy Teams summary" button per relationship
 * row. Pure render + clipboard write.
 *
 * Critically:
 *   - The click does NOT mutate the Phase 78 relationship-note
 *     draft state (the modal's `draftFor` slot owned by the parent
 *     `Ready` component is never touched).
 *   - The click does NOT mutate the Phase 83 Autopilot suggestion
 *     ledger (`cc:autopilotSuggestionLedger:v1`), the Phase 90
 *     last-seen markers (`cc:lastVisit:catchUp:*`), the Phase 91
 *     dismiss / snooze ledger (`cc:catchUpItemLedger:v1`), or any
 *     other local state the banker workspace tracks. The component
 *     reads from the already-derived `RelationshipMemoryEntry`
 *     aggregate.
 *   - The click does NOT load or refetch any data. The aggregate is
 *     passed in by the parent.
 *   - The summary string lives only in this component's `useMemo`
 *     cache + (on click) the browser clipboard.
 */
type RelationshipMemoryCopyState =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' };

function RelationshipMemoryTeamsCopyButton({
  entry,
}: {
  entry: RelationshipMemoryEntry;
}) {
  const [copyState, setCopyState] = useState<RelationshipMemoryCopyState>({
    kind: 'idle',
  });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const summary = useMemo(
    () =>
      buildRelationshipMemoryTeamsSummary({
        entry,
        generatedAt: new Date(),
      }),
    [entry],
  );

  const ariaName = entry.isClientNameMissing
    ? 'this client (no borrower name on record)'
    : entry.clientNameDisplay;

  async function handleCopy() {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(summary);
        setCopyState({ kind: 'copied' });
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          setCopyState({ kind: 'idle' });
        }, 4000);
        return;
      }
      setCopyState({ kind: 'copy-failed' });
    } catch {
      setCopyState({ kind: 'copy-failed' });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleCopy}
        style={styles.copyTeamsButton}
        aria-label={`Copy Teams summary for ${ariaName}`}
      >
        Copy Teams summary
      </button>
      {copyState.kind === 'copied' && (
        <span style={styles.copySuccessTag} role="status">
          Copied to clipboard. Paste into Teams.
        </span>
      )}
      {copyState.kind === 'copy-failed' && (
        <span style={styles.copyFailTag} role="alert">
          Clipboard unavailable. Select and copy manually.
        </span>
      )}
    </>
  );
}

function DealPill({
  deal,
  onOpen,
}: {
  deal: RelationshipDealSnapshot;
  onOpen: () => void;
}) {
  return (
    <li style={styles.dealPillWrap}>
      <button
        type="button"
        onClick={onOpen}
        style={styles.dealPill}
        aria-label={`Open deal ${deal.dealName}`}
      >
        {deal.stage && (
          <span style={styles.dealPillStage}>{deal.stage}</span>
        )}
        <span style={styles.dealPillName}>{deal.dealName}</span>
      </button>
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

function formatRelativeIso(
  iso: string | undefined,
  nowMs: number,
  opts?: { future?: boolean },
): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const days = Math.floor((nowMs - ms) / MS_PER_DAY);
  if (opts?.future) {
    const daysAhead = Math.floor((ms - nowMs) / MS_PER_DAY);
    if (daysAhead < 0) return 'past target';
    if (daysAhead === 0) return 'today';
    if (daysAhead === 1) return 'tomorrow';
    if (daysAhead < 30) return `in ${daysAhead}d`;
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

const styles: Record<string, React.CSSProperties> = {
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
    gap: 6,
  },
  rowHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  clientName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  rowMetaInline: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaItem: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  timelineRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    alignItems: 'center',
  },
  timelineSep: { color: palette.divider, padding: `0 ${spacing.xxs}` },
  asksRow: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.text,
  },
  overdueInline: {
    color: palette.atRiskFg,
    fontWeight: typography.weight.semibold,
  },
  gapInline: {
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  badgeRow: {
    display: 'flex',
    gap: spacing.xxs,
    flexWrap: 'wrap',
  },
  dealList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  dealPillWrap: { margin: 0 },
  dealPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xxs,
    padding: `${spacing.xxs} ${spacing.sm}`,
    background: palette.surface,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.pill,
    cursor: 'pointer',
    fontFamily: typography.family,
    fontSize: typography.size.xs,
  },
  dealPillStage: {
    color: palette.primary,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.label,
  },
  dealPillName: { color: palette.text },
  rowActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: spacing.xxs,
  },
  draftNoteButton: {
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
  disclaimer: {
    margin: 0,
    paddingTop: spacing.sm,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
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
  copyTeamsButton: {
    background: palette.surfaceAlt,
    color: palette.text,
    border: `1px solid ${palette.border}`,
    borderRadius: radius.sm,
    padding: `${spacing.xs} ${spacing.md}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  copySuccessTag: {
    fontSize: typography.size.xs,
    color: palette.clearFg,
    fontStyle: 'italic',
  },
  copyFailTag: {
    fontSize: typography.size.xs,
    color: palette.blockedFg,
    fontStyle: 'italic',
  },
};

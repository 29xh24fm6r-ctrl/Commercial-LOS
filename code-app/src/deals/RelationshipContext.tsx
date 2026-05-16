import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from '../banker/workQueueQueries';
import {
  deriveCrossDealContext,
  type CrossDealContextResult,
  type RelationshipDealSnapshot,
  type RelationshipMemoryEntry,
} from '../shared/relationship/relationshipMemory';
import { RelationshipNoteDraftModal } from '../banker/RelationshipNoteDraftModal';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 77: Deal Workspace cross-deal relationship context.
 *
 * For the current deal's client name, surfaces other already-
 * authorized deals carried by the same banker for the same
 * (normalized) client name. Reuses the Phase 76 derivation
 * (deriveCrossDealContext) — the current deal is excluded from the
 * aggregates so its own counts do not double-up.
 *
 * Banker-only by construction:
 *   - mounted from BankerDealWorkspace (Phase 4 / banker route);
 *   - data comes from loadBankerWorkQueueData(bankerId) — the same
 *     banker-authorized two-step pipeline + child query the Phase
 *     32 work queue uses;
 *   - if BankerContext is missing (manager / team / executive deal
 *     workspaces), the component returns null so the card never
 *     leaks data outside its role boundary.
 *
 * What this is NOT:
 *   - Not AI / Copilot / predictive.
 *   - Not a relationship graph; client-name grouping only.
 *   - Not a household linkage / verified entity linkage.
 *   - Not a relationship score / risk score.
 *   - Not a permission escalator — deals not loaded by
 *     loadBankerWorkQueueData(bankerId) are simply not visible.
 *   - No new write surface; no audit / timeline emission.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function RelationshipContext() {
  const { deal } = useDealData();
  const banker = useOptionalBanker();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const bankerId = banker?.bankerId;

  const reload = useCallback(() => {
    if (!bankerId) return () => undefined;
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

  // Phase 77 role boundary: this card is banker-only. The manager /
  // team / executive deal workspaces do not mount BankerProvider, so
  // useOptionalBanker() returns undefined there. Render nothing in
  // that case — the card never appears outside the banker surface.
  if (!bankerId) return null;

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader
          title="Relationship context"
          subtitle="Loading other visible deals for this client…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Card>
        <CardHeader
          title="Relationship context"
          subtitle="Could not load related deals."
        />
        <ErrorBlock
          title="Could not load relationship context"
          detail={state.message}
        />
      </Card>
    );
  }

  return (
    <Ready
      dealId={deal.id}
      clientName={deal.clientName}
      bankerName={banker?.fullName}
      data={state.data}
    />
  );
}

function Ready({
  dealId,
  clientName,
  bankerName,
  data,
}: {
  dealId: string;
  clientName: string | undefined;
  bankerName: string | undefined;
  data: BankerWorkQueueData;
}) {
  const now = useMemo(() => new Date(), []);
  const result: CrossDealContextResult = useMemo(
    () => deriveCrossDealContext(data, dealId, clientName, now),
    [data, dealId, clientName, now],
  );
  // Phase 78: local-only relationship-note draft. State lives in
  // React only; closing the modal drops the draft. No write, no
  // audit, no timeline. Modal opens with deals scoped to the
  // current client (excluding the current deal — same set the
  // card already renders).
  const [draftOpen, setDraftOpen] = useState(false);

  if (result.kind === 'no-client-name') {
    return (
      <Card>
        <CardHeader
          title="Relationship context"
          subtitle="No borrower name on record for this deal."
        />
        <p style={styles.muted}>
          This deal does not carry a client name on the record, so other
          visible deals cannot be grouped for relationship context.
          Client-name grouping is the limit of this surface today.
        </p>
        <p style={styles.disclaimer}>
          Derived from visible records. Client-name grouped. May not
          include all related borrowers. No predictive claim.
        </p>
      </Card>
    );
  }

  if (result.kind === 'no-other-deals') {
    return (
      <>
        <Card>
          <CardHeader
            title="Relationship context"
            subtitle={`No other visible deals for ${result.clientNameDisplay}.`}
          />
          <p style={styles.muted}>
            No other visible deals for this client from current records.
            Client-name grouped, so a sibling deal naming the borrower
            differently ("Acme, LLC" vs "Acme LLC") would not appear here.
          </p>
          <div style={styles.rowActions}>
            <button
              type="button"
              onClick={() => setDraftOpen(true)}
              style={styles.draftNoteButton}
              aria-label={`Draft relationship note for ${result.clientNameDisplay}`}
            >
              Draft relationship note
            </button>
          </div>
          <p style={styles.disclaimer}>
            Derived from visible records. Client-name grouped. May not
            include all related borrowers. No predictive claim.
          </p>
        </Card>
        {draftOpen && (
          <RelationshipNoteDraftModal
            clientName={result.clientNameDisplay}
            bankerName={bankerName}
            // The sibling list is empty in this branch; the modal
            // gracefully omits the Active deals block when no deals
            // are supplied.
            deals={[]}
            onClose={() => setDraftOpen(false)}
          />
        )}
      </>
    );
  }

  const { entry } = result;
  const nowMs = now.getTime();

  return (
    <>
      <Card>
        <CardHeader
          title="Relationship context"
          subtitle={`${entry.activeDealCount} other visible deal${entry.activeDealCount === 1 ? '' : 's'} for ${entry.clientNameDisplay} — derived from visible records.`}
        />
      <div style={styles.section}>
        <div style={styles.timelineRow}>
          <span style={styles.metaLabel}>Latest activity (other deals):</span>{' '}
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

        <DealPillList entry={entry} />

        <div style={styles.rowActions}>
          <button
            type="button"
            onClick={() => setDraftOpen(true)}
            style={styles.draftNoteButton}
            aria-label={`Draft relationship note for ${entry.clientNameDisplay}`}
          >
            Draft relationship note
          </button>
        </div>

        <p style={styles.disclaimer}>
          Derived from visible records. Client-name grouped — sibling
          deals naming the borrower differently ("Acme, LLC" vs "Acme
          LLC") appear as separate entries and are NOT shown here. May
          not include all related borrowers. Not a verified relationship
          graph, not a household linkage, not a relationship score. No
          predictive claim.
        </p>
      </div>
      </Card>
      {draftOpen && (
        <RelationshipNoteDraftModal
          clientName={entry.clientNameDisplay}
          bankerName={bankerName}
          deals={entry.deals.map((d) => ({
            dealName: d.dealName,
            stage: d.stage,
          }))}
          onClose={() => setDraftOpen(false)}
        />
      )}
    </>
  );
}

function DealPillList({ entry }: { entry: RelationshipMemoryEntry }) {
  const navigate = useNavigate();
  return (
    <ul style={styles.dealList} aria-label="Other visible deals for this client">
      {entry.deals.map((d) => (
        <DealPill
          key={d.dealId}
          deal={d}
          onOpen={() => navigate(`/deals/${d.dealId}`)}
        />
      ))}
    </ul>
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
        aria-label={`Open related deal ${deal.dealName}`}
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
  const days = Math.floor((nowMs - ms) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const styles: Record<string, React.CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
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
  metaItem: { fontSize: typography.size.sm, color: palette.textMuted },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  overdueInline: {
    color: palette.atRiskFg,
    fontWeight: typography.weight.semibold,
  },
  badgeRow: { display: 'flex', gap: spacing.xxs, flexWrap: 'wrap' },
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
};

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManager } from './ManagerContext';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedMemoSection,
  TeamScopedTask,
} from './managerQueries';
import {
  useManagerBankerFilter,
  type ManagerBankerFilterView,
} from './ManagerBankerFilter';
import {
  deriveManagerMorningCatchUp,
  type ManagerCatchUpItem,
  type ManagerCatchUpPriority,
} from '../shared/activity/managerMorningCatchUp';
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
import { buildCatchUpTeamsSummary } from '../shared/activity/catchUpTeamsSummary';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 88: deterministic "morning catch-up" card on the Manager
 * Workspace.
 *
 * Reads the Phase 87 manager-scoped child data (teamPipeline +
 * teamTasks + teamDocuments + teamMemos) through `useManagerData()`,
 * passes it to the pure Phase 88 derivation, and renders the
 * top 8 items.
 *
 * Complementary to (not duplicative of) <ManagerAutopilotRollup />:
 *   - Autopilot answers "what should this banker DO next?" — one
 *     row per deal, action-oriented.
 *   - Morning catch-up answers "what HAPPENED across the team?" —
 *     multiple rows per deal possible, observation-oriented,
 *     including data-quality items (missing stage, missing assigned
 *     banker).
 *
 * Boundary: lives only on the Manager Command Center. Reads
 * already-loaded manager-authorized data; no new query shape, no
 * permission widening. No Dataverse write, no audit row, no
 * timeline event, no governed write. No AI. No automation. No
 * real-time notification surface.
 */

const PRIORITY_TO_SEVERITY: Record<ManagerCatchUpPriority, SeverityKey> = {
  high: 'atRisk',
  medium: 'info',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<ManagerCatchUpPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function ManagerMorningCatchUp() {
  const { bankerId, teamId } = useManager();
  const {
    teamPipeline,
    teamTasks,
    teamDocuments,
    teamMemos,
    teamMemoSections,
  } = useManagerData();

  // Phase 90: local-only "since last visit" marker scoped to
  // (manager identity + team). Different banker viewing the same
  // team gets a different scope key; same banker switching teams
  // also gets a different scope key.
  const scope = useMemo(
    () => buildCatchUpScope({ surface: 'manager', userId: bankerId, teamId }),
    [bankerId, teamId],
  );
  const lastSeen = useCatchUpLastSeen(scope);

  const filter = useManagerBankerFilter();

  return (
    <Card>
      <CardHeader
        title="Morning catch-up"
        subtitle="Derived from current manager-visible records. Nothing happens automatically."
        trailing={
          filter.selection.kind !== 'all' ? (
            <span style={styles.filterTag} aria-label={filter.selectionLabel}>
              {filter.selectionLabel}
            </span>
          ) : null
        }
      />
      <BodyWithLedger
        teamPipeline={teamPipeline}
        teamTasks={teamTasks}
        teamDocuments={teamDocuments}
        teamMemos={teamMemos}
        teamMemoSections={teamMemoSections}
        priorLastSeenMs={lastSeen.priorLastSeenMs}
        isInitialized={lastSeen.isInitialized}
        isUnscoped={lastSeen.isUnscoped}
        markAllSeen={lastSeen.markAllSeen}
        filter={filter}
      />
    </Card>
  );
}

function BodyWithLedger(props: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
  teamMemoSections: AsyncResult<TeamScopedMemoSection[]>;
  priorLastSeenMs: number | undefined;
  isInitialized: boolean;
  isUnscoped: boolean;
  markAllSeen: (now?: Date) => void;
  filter: ManagerBankerFilterView;
}) {
  const ledger = useCatchUpItemLedger();
  return <Body {...props} ledger={ledger} />;
}

function Body({
  teamPipeline,
  teamTasks,
  teamDocuments,
  teamMemos,
  teamMemoSections,
  priorLastSeenMs,
  isInitialized,
  isUnscoped,
  markAllSeen,
  ledger,
  filter,
}: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
  teamMemoSections: AsyncResult<TeamScopedMemoSection[]>;
  priorLastSeenMs: number | undefined;
  isInitialized: boolean;
  isUnscoped: boolean;
  markAllSeen: (now?: Date) => void;
  ledger: ReturnType<typeof useCatchUpItemLedger>;
  filter: ManagerBankerFilterView;
}) {
  const now = useMemo(() => new Date(), []);

  const items = useMemo(() => {
    if (
      teamPipeline.kind !== 'ready' ||
      teamTasks.kind !== 'ready' ||
      teamDocuments.kind !== 'ready' ||
      teamMemos.kind !== 'ready' ||
      teamMemoSections.kind !== 'ready'
    ) {
      return null;
    }
    // Phase 92: apply the manager banker filter before derivation.
    // Children (tasks, documents, memos) are narrowed to the
    // surviving deal-ids so the morning-catch-up derivation
    // operates on a coherent subset.
    const filteredDeals = teamPipeline.data.filter(filter.matchesDeal);
    const visibleDealIds = new Set(filteredDeals.map((d) => d.id));
    return deriveManagerMorningCatchUp(
      {
        deals: filteredDeals.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          assignedBankerName: d.assignedBankerName,
          targetCloseDate: d.targetCloseDate,
          stageEntryDate: d.stageEntryDate,
          modifiedOn: d.modifiedOn,
          clientName: d.clientName,
          amount: d.amount,
          collateralSummary: d.collateralSummary,
        })),
        tasks: teamTasks.data
          .filter((t) => t.dealId && visibleDealIds.has(t.dealId))
          .map((t) => ({
            id: t.id,
            dealId: t.dealId,
            title: t.title,
            dueDate: t.dueDate,
            completed: t.completed,
          })),
        documents: teamDocuments.data
          .filter((doc) => doc.dealId && visibleDealIds.has(doc.dealId))
          .map((doc) => ({
            id: doc.id,
            dealId: doc.dealId,
            name: doc.name,
            receivedDate: doc.receivedDate,
            reviewer: doc.reviewer,
            status: doc.status,
          })),
        memos: teamMemos.data
          .filter((m) => m.dealId && visibleDealIds.has(m.dealId))
          .map((m) => ({
            id: m.id,
            dealId: m.dealId,
            statusKey: m.statusKey,
            textPreview: m.textPreview,
          })),
        memoSections: teamMemoSections.data
          .filter((s) => s.dealId && visibleDealIds.has(s.dealId))
          .map((s) => ({
            id: s.id,
            dealId: s.dealId,
            sectionLabel: s.sectionLabel,
            textPreview: s.textPreview,
          })),
      },
      now,
    );
  }, [
    teamPipeline,
    teamTasks,
    teamDocuments,
    teamMemos,
    teamMemoSections,
    now,
    filter,
  ]);

  // Surface failed slots BEFORE the loading state so a transient
  // service failure is visible (same pattern Phase 84/87 carry).
  if (teamPipeline.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load catch-up" detail={teamPipeline.message} />
    );
  }
  if (teamTasks.kind === 'failed') {
    return <ErrorBlock title="Could not load catch-up" detail={teamTasks.message} />;
  }
  if (teamDocuments.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load catch-up" detail={teamDocuments.message} />
    );
  }
  if (teamMemos.kind === 'failed') {
    return <ErrorBlock title="Could not load catch-up" detail={teamMemos.message} />;
  }
  if (teamMemoSections.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load catch-up"
        detail={teamMemoSections.message}
      />
    );
  }

  if (items == null) {
    return <p style={styles.muted}>Loading catch-up…</p>;
  }

  // Phase 91: filter snoozed items (with active snoozeUntil) out of
  // the visible feed; keep dismissed items so the user can Restore.
  const visibleItems = items.filter((item) => {
    const entry = ledger.entries[
      buildCatchUpLedgerKey({ surface: 'manager-catch-up', itemKey: item.id })
    ];
    if (entry?.action === 'snoozed') {
      const untilMs = Date.parse(entry.snoozeUntil ?? '');
      if (Number.isFinite(untilMs) && untilMs > now.getTime()) return false;
    }
    return true;
  });

  // Phase 90: derive "since last visit" overlay. When the scope is
  // unavailable (no bankerId/teamId resolved yet) OR the snapshot has
  // not initialized, fall through with isFirstVisit semantics — the
  // badge simply doesn't render until we have a reliable comparison
  // base.
  const sinceLastSeen = summarizeCatchUpSinceLastSeen(
    visibleItems,
    isInitialized && !isUnscoped ? priorLastSeenMs : undefined,
    now,
  );

  if (visibleItems.length === 0) {
    const emptyCopy = filterAwareEmptyCopy(filter.selection);
    return (
      <>
        <p style={styles.muted}>{emptyCopy}</p>
        {renderSinceLastVisitLine(sinceLastSeen, isUnscoped, /*populated*/ false, markAllSeen)}
        <p style={styles.disclaimer}>
          Derived from current manager-visible records. Nothing happens
          automatically. Not AI-generated.
        </p>
      </>
    );
  }

  return (
    <div style={styles.section}>
      {renderSinceLastVisitLine(sinceLastSeen, isUnscoped, /*populated*/ true, markAllSeen)}
      <ul style={styles.list} aria-label="Manager morning catch-up items">
        {visibleItems.map((item) => {
          const ledgerKey = buildCatchUpLedgerKey({
            surface: 'manager-catch-up',
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
                  surface: 'manager-catch-up',
                  itemKey: item.id,
                  itemKind: item.kind,
                  dealId: item.dealId,
                  titleSnapshot: item.title,
                })
              }
              onSnooze={() =>
                ledger.recordSnoozed({
                  surface: 'manager-catch-up',
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
      <CatchUpTeamsCopyButton
        visibleItems={visibleItems}
        sinceLastSeen={sinceLastSeen}
        isInitialized={isInitialized}
        isUnscoped={isUnscoped}
        now={now}
      />
      <p style={styles.signalCoverage}>
        Catch-up uses manager-visible records (deals, open tasks,
        document checklist rows, credit memos). Items observed only;
        no action runs from this card.
      </p>
      <p style={styles.disclaimer}>
        Derived from current manager-visible records. Nothing happens
        automatically. Not AI-generated. No AI or automated decisions.
        Manager visibility is scoped to the manager's team pipeline;
        deals outside that scope are not evaluated and not surfaced
        here. "New since your last visit" is tracked on this browser
        only; it is not synced and does not change deal status.
        "Dismiss locally" and "Snooze locally" are tracked on this
        browser only; they do not change deal status. Copying the
        Teams summary is local-only — it does not post to Teams,
        mark items seen, dismiss them, or snooze them.
      </p>
    </div>
  );
}

/**
 * Phase 98: "Copy Teams summary" inline component for the manager
 * catch-up card. Same posture as the sibling banker copy button —
 * pure render + clipboard write. Does NOT mutate the Phase 90
 * last-seen marker, the Phase 91 ledger, or the Phase 94 mark-all-
 * seen action. The manager surface includes the per-item owner
 * banker name in the pasted summary so the manager can see
 * ownership at a glance.
 */
type CopyState =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' };

function CatchUpTeamsCopyButton({
  visibleItems,
  sinceLastSeen,
  isInitialized,
  isUnscoped,
  now,
}: {
  visibleItems: readonly ManagerCatchUpItem[];
  sinceLastSeen: { newCount: number; isFirstVisit: boolean };
  isInitialized: boolean;
  isUnscoped: boolean;
  now: Date;
}) {
  const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const summary = useMemo(() => {
    return buildCatchUpTeamsSummary({
      surface: 'manager',
      visibleItemCount: visibleItems.length,
      lastSeen:
        isInitialized && !isUnscoped
          ? {
              firstVisit: sinceLastSeen.isFirstVisit,
              newCount: sinceLastSeen.newCount,
            }
          : undefined,
      items: visibleItems.map((item) => ({
        dealId: item.dealId,
        dealName: item.dealName,
        ownerName: item.ownerName,
        priority: item.priority,
        title: item.title,
        reason: item.reason,
      })),
      generatedAt: now,
    });
  }, [
    visibleItems,
    sinceLastSeen.isFirstVisit,
    sinceLastSeen.newCount,
    isInitialized,
    isUnscoped,
    now,
  ]);

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
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
    <div style={styles.copyRow} aria-label="Copy Teams summary action row">
      <button
        type="button"
        onClick={handleCopy}
        style={styles.copyButton}
        aria-label="Copy Teams summary for manager morning catch-up"
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
    </div>
  );
}

function filterAwareEmptyCopy(
  selection: ManagerBankerFilterView['selection'],
): string {
  if (selection.kind === 'banker') {
    return `No catch-up items for ${selection.name} from current records.`;
  }
  if (selection.kind === 'unassigned') {
    return 'No catch-up items for Unassigned from current records.';
  }
  return 'No catch-up items from current records.';
}

function renderSinceLastVisitLine(
  summary: { newCount: number; isFirstVisit: boolean },
  isUnscoped: boolean,
  populated: boolean,
  markAllSeen: (now?: Date) => void,
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
  // Phase 94: surface a "Mark all seen" button next to the count
  // line. Click bumps the local marker to `now` immediately,
  // dropping every "New" badge + count back to zero. Local-only:
  // no Dataverse write, no audit, no notification, no sync.
  return (
    <div
      style={populated ? styles.sinceLineRow : styles.sinceLineRowEmpty}
      aria-label="Catch-up last-seen status"
    >
      <span style={styles.sinceLineText}>
        {summary.newCount} new since your last visit on this browser.
      </span>
      <button
        type="button"
        onClick={() => markAllSeen()}
        style={styles.markAllSeenButton}
        aria-label="Mark all catch-up items seen on this browser"
      >
        Mark all seen
      </button>
      <span style={styles.markAllSeenHint}>
        Clears local new-item markers only
      </span>
    </div>
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
  item: ManagerCatchUpItem;
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
        {item.ownerName && (
          <span>
            <span style={styles.metaLabel}>Banker: </span>
            {item.ownerName}
          </span>
        )}
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
  filterTag: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
  },
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
  sinceLineRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
    margin: 0,
  },
  sinceLineRowEmpty: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: spacing.sm,
    margin: 0,
    paddingTop: spacing.xs,
  },
  sinceLineText: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
  markAllSeenButton: {
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
  markAllSeenHint: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic',
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
  copyRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  copyButton: {
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

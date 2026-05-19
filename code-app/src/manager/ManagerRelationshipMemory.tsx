import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import {
  useManagerBankerFilter,
  type ManagerBankerFilterView,
} from './ManagerBankerFilter';
import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedTask,
} from './managerQueries';
import {
  deriveRelationshipMemory,
  type RelationshipDealSnapshot,
  type RelationshipMemoryEntry,
} from '../shared/relationship/relationshipMemory';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 102: manager-facing Relationship Memory card.
 *
 * Same Phase 76 deterministic derivation (`deriveRelationshipMemory`)
 * applied to the manager's already-authorized team-scoped data:
 *   - teamPipeline   → deals
 *   - teamTasks      → tasks
 *   - teamDocuments  → outstandingDocuments (status==='outstanding')
 *                    + pendingReviewDocuments (status==='received')
 *   - teamMemos      → memos
 *
 * The same Phase 92 banker filter the manager's other cards honor
 * is applied BEFORE derivation so the rollup, catch-up, and
 * relationship-memory views stay consistent when the manager
 * narrows to one banker.
 *
 * What this is NOT (mirrors Phase 76 disclaimer):
 *   - Not AI / Copilot / predictive.
 *   - Not a relationship graph. Client-name grouped only — there is
 *     no `cr664_borrower` FK on the deal record today.
 *   - Not a household linkage / verified entity linkage.
 *   - Not a relationship score / risk score.
 *   - Not a permission widener — every row is already inside the
 *     manager's team scope via `loadManagerTeamPipeline` /
 *     `loadManagerTeam*`.
 *   - Not a new write surface; no audit / timeline / governed
 *     write.
 *   - Not a copy-to-Teams / Outlook handoff surface. Phase 102 is
 *     deliberately read-only — no handoff buttons. The Phase 100 /
 *     101 handoff surfaces are banker-only by design (the per-row
 *     copy is most useful for the assigned banker; the manager
 *     view is for cross-banker awareness, not solicitation).
 */

const TOP_N_MANAGER_RM_CLIENTS = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_DEALS_PER_ROW = 5;

export function ManagerRelationshipMemory() {
  const { teamPipeline, teamTasks, teamDocuments, teamMemos } =
    useManagerData();
  const filter = useManagerBankerFilter();
  return (
    <Card>
      <CardHeader
        title="Relationship Memory"
        subtitle="Client-name grouped, derived from manager-visible records."
        trailing={
          filter.selection.kind !== 'all' ? (
            <span style={styles.filterTag} aria-label={filter.selectionLabel}>
              {filter.selectionLabel}
            </span>
          ) : null
        }
      />
      <Body
        teamPipeline={teamPipeline}
        teamTasks={teamTasks}
        teamDocuments={teamDocuments}
        teamMemos={teamMemos}
        filter={filter}
      />
    </Card>
  );
}

function Body({
  teamPipeline,
  teamTasks,
  teamDocuments,
  teamMemos,
  filter,
}: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
  filter: ManagerBankerFilterView;
}) {
  const now = useMemo(() => new Date(), []);

  const entries = useMemo(() => {
    if (
      teamPipeline.kind !== 'ready' ||
      teamTasks.kind !== 'ready' ||
      teamDocuments.kind !== 'ready' ||
      teamMemos.kind !== 'ready'
    ) {
      return null;
    }
    // Phase 92 filter narrows the deal universe; children are
    // narrowed to the surviving deal-ids so the derivation operates
    // on a coherent subset.
    const filteredDeals = teamPipeline.data.filter(filter.matchesDeal);
    const visibleDealIds = new Set(filteredDeals.map((d) => d.id));

    return deriveRelationshipMemory(
      {
        deals: filteredDeals.map((d) => ({
          id: d.id,
          name: d.name,
          clientName: d.clientName,
          stage: d.stage,
          amount: d.amount,
          targetCloseDate: d.targetCloseDate,
          lastActivityOn: d.modifiedOn,
          stageEntryDate: d.stageEntryDate,
        })),
        tasks: teamTasks.data
          .filter((t) => t.dealId && visibleDealIds.has(t.dealId) && !t.completed)
          .map((t) => ({
            dealId: t.dealId!,
            dueDate: t.dueDate,
          })),
        outstandingDocuments: teamDocuments.data
          .filter(
            (d) =>
              d.dealId &&
              visibleDealIds.has(d.dealId) &&
              d.status === 'outstanding',
          )
          .map((d) => ({ dealId: d.dealId! })),
        pendingReviewDocuments: teamDocuments.data
          .filter(
            (d) =>
              d.dealId &&
              visibleDealIds.has(d.dealId) &&
              d.status === 'received',
          )
          .map((d) => ({
            dealId: d.dealId!,
            receivedDate: d.receivedDate,
          })),
        memos: teamMemos.data
          .filter((m) => m.dealId && visibleDealIds.has(m.dealId))
          .map((m) => ({
            dealId: m.dealId!,
            statusKey: m.statusKey,
          })),
      },
      now,
    );
  }, [teamPipeline, teamTasks, teamDocuments, teamMemos, filter, now]);

  // Surface failed slots BEFORE the loading state — same pattern as
  // the autopilot rollup + catch-up cards on this workspace.
  if (teamPipeline.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load Relationship Memory"
        detail={teamPipeline.message}
      />
    );
  }
  if (teamTasks.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load Relationship Memory"
        detail={teamTasks.message}
      />
    );
  }
  if (teamDocuments.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load Relationship Memory"
        detail={teamDocuments.message}
      />
    );
  }
  if (teamMemos.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load Relationship Memory"
        detail={teamMemos.message}
      />
    );
  }

  if (entries == null) {
    return <p style={styles.muted}>Loading client snapshot…</p>;
  }

  if (entries.length === 0) {
    return (
      <>
        <p style={styles.muted}>
          {filterAwareEmptyCopy(filter.selection)}
        </p>
        <p style={styles.disclaimer}>
          Derived from manager-visible records. Client-name grouped, so
          two deals naming the borrower differently ("Acme, LLC" vs
          "Acme LLC") appear as separate entries. This is a
          relationship snapshot, not a verified relationship graph,
          not a household linkage, not a relationship score. No
          predictive claim.
        </p>
      </>
    );
  }

  const visible = entries.slice(0, TOP_N_MANAGER_RM_CLIENTS);
  const overflow = entries.length - visible.length;
  const nowMs = now.getTime();

  return (
    <div style={styles.section}>
      <p style={styles.scanLine}>
        Showing {visible.length} of {entries.length} client
        {entries.length === 1 ? '' : 's'} — sorted by attention signals.
      </p>
      <ul
        style={styles.list}
        aria-label="Manager relationship memory clients"
      >
        {visible.map((entry) => (
          <ClientRow
            key={entry.clientNameKey}
            entry={entry}
            nowMs={nowMs}
          />
        ))}
      </ul>
      {overflow > 0 && (
        <p style={styles.overflowLine}>
          … and {overflow} more client{overflow === 1 ? '' : 's'} not
          shown. Narrow the banker filter to see a focused subset.
        </p>
      )}
      <p style={styles.disclaimer}>
        Derived from manager-visible records. Client-name grouped, so
        two deals naming the borrower differently ("Acme, LLC" vs
        "Acme LLC") appear as separate entries. This is a relationship
        snapshot, not a verified relationship graph, not a household
        linkage, not a relationship score. Manager visibility is
        scoped to the manager's team pipeline; deals outside that
        scope are not evaluated and not surfaced here. Open the
        relevant deal to act. No AI or automated decisions.
      </p>
    </div>
  );
}

function ClientRow({
  entry,
  nowMs,
}: {
  entry: RelationshipMemoryEntry;
  nowMs: number;
}) {
  const displayName = entry.isClientNameMissing
    ? '(no borrower name on record)'
    : entry.clientNameDisplay;
  const visibleDeals = entry.deals.slice(0, MAX_DEALS_PER_ROW);
  const overflow = entry.deals.length - visibleDeals.length;

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

      <ul style={styles.dealList} aria-label="Active deals for client">
        {visibleDeals.map((d) => (
          <DealPill key={d.dealId} deal={d} />
        ))}
        {overflow > 0 && (
          <li style={styles.dealOverflow}>
            … and {overflow} more deal{overflow === 1 ? '' : 's'} not
            shown.
          </li>
        )}
      </ul>
    </li>
  );
}

function DealPill({ deal }: { deal: RelationshipDealSnapshot }) {
  const navigate = useNavigate();
  return (
    <li style={styles.dealPillWrap}>
      <button
        type="button"
        onClick={() => navigate(`/deals/${deal.dealId}`)}
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

function filterAwareEmptyCopy(
  selection: ManagerBankerFilterView['selection'],
): string {
  if (selection.kind === 'banker') {
    return `No clients with active deals for ${selection.name} from current records.`;
  }
  if (selection.kind === 'unassigned') {
    return 'No clients with unassigned active deals from current records.';
  }
  return 'No clients with active deals on the team from current records.';
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

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const abs = Math.abs(Math.round(amount));
  const sign = amount < 0 ? '-' : '';
  const withSeparators = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${withSeparators}`;
}

function formatRelativeIso(
  iso: string | undefined,
  nowMs: number,
  opts: { future?: boolean } = {},
): string {
  if (!iso) return opts.future ? 'None' : '—';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const diff = opts.future ? ms - nowMs : nowMs - ms;
  if (diff < 0) {
    // Inverted direction — keep label honest rather than fabricating
    // a different anchor.
    return opts.future ? 'None' : 'today';
  }
  const days = Math.floor(diff / MS_PER_DAY);
  if (opts.future) {
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
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
  scanLine: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textSubtle,
  },
  overflowLine: {
    margin: 0,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
  },
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
    gap: spacing.xs,
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
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap' },
  gapInline: { color: palette.textSubtle, fontStyle: 'italic' },
  timelineRow: {
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  timelineSep: { padding: `0 ${spacing.xs}` },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
  asksRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.md,
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  overdueInline: { color: palette.atRiskFg, fontStyle: 'italic' },
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dealList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dealPillWrap: { display: 'inline-flex' },
  dealPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    background: palette.surface,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    cursor: 'pointer',
    color: palette.text,
    fontFamily: typography.family,
  },
  dealPillStage: {
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  dealPillName: {
    fontWeight: typography.weight.medium,
    color: palette.primary,
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    textUnderlineOffset: 3,
  },
  dealOverflow: {
    fontSize: typography.size.xs,
    color: palette.textMuted,
    fontStyle: 'italic',
    alignSelf: 'center',
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

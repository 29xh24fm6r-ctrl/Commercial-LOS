import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  deriveManagerAutopilotRollup,
  type ManagerRollupDeal,
  type ManagerRollupDocumentInput,
} from '../shared/autopilot/managerAutopilotRollup';
import type { AutopilotPriority } from '../shared/autopilot/dealAutopilot';
import { useSuggestionLedger } from '../shared/autopilot/useSuggestionLedger';
import type { SuggestionLedgerEntry } from '../shared/autopilot/suggestionLedger';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 81 → Phase 87 → Phase 95: manager-side Autopilot rollup card.
 *
 * Phase 81 shipped this card with deal-record signal coverage only
 * (4 of 8 Phase 80 signals). Phase 87 broadened coverage to 7 of 8.
 * Phase 95 adds the 8th — memo-consistency-findings — by loading
 * memo textPreview + per-deal sections from the manager-scoped
 * loaders so the Phase 73 deterministic consistency check can run.
 *
 * Signal coverage on the Phase 95 card:
 *   ✓ overdue-tasks             (HIGH)
 *   ✓ pending-review-documents  (HIGH)
 *   ✓ closing-soon-stale-activity (HIGH)
 *   ✓ closing-soon              (MEDIUM)
 *   ✓ stage-aging               (MEDIUM)
 *   ✓ outstanding-documents     (MEDIUM)
 *   ✓ memo-consistency-findings (MEDIUM) — Phase 95
 *   ✓ draft-memo                (LOW)
 *   ✓ stale-activity            (LOW)
 *
 * Banker / team / executive workspaces unchanged. The card mounts
 * only inside ManagerWorkspace and uses useManagerData() — so even
 * if it were mounted from a non-manager workspace by accident the
 * data provider context would not be present.
 *
 * No Dataverse write. No audit. No timeline. No AI. No automation.
 * `isAutomated: false` is enforced on every NextBestAction by the
 * type system (see dealAutopilot.ts).
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

export function ManagerAutopilotRollup() {
  const {
    teamPipeline,
    teamTasks,
    teamDocuments,
    teamMemos,
    teamMemoSections,
  } = useManagerData();
  const filter = useManagerBankerFilter();
  return (
    <Card>
      <CardHeader
        title="Team next-best-action signals"
        subtitle="Derived from current records. Nothing happens automatically."
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
        teamMemoSections={teamMemoSections}
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
  teamMemoSections,
  filter,
}: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
  teamMemoSections: AsyncResult<TeamScopedMemoSection[]>;
  filter: ManagerBankerFilterView;
}) {
  const now = useMemo(() => new Date(), []);
  const ledger = useSuggestionLedger();

  const rollup = useMemo(() => {
    if (
      teamPipeline.kind !== 'ready' ||
      teamTasks.kind !== 'ready' ||
      teamDocuments.kind !== 'ready' ||
      teamMemos.kind !== 'ready' ||
      teamMemoSections.kind !== 'ready'
    ) {
      return null;
    }
    // Phase 92: apply the manager banker filter BEFORE running the
    // deterministic rollup. The filter narrows the deal universe;
    // children are then narrowed to the surviving deal-ids so the
    // derivation operates on a coherent subset (no orphan task /
    // document / memo rows that point at a hidden deal).
    const filteredDeals = teamPipeline.data.filter(filter.matchesDeal);
    const visibleDealIds = new Set(filteredDeals.map((d) => d.id));
    return deriveManagerAutopilotRollup(
      {
        deals: filteredDeals.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          targetCloseDate: d.targetCloseDate,
          stageEntryDate: d.stageEntryDate,
          modifiedOn: d.modifiedOn,
          assignedBankerName: d.assignedBankerName,
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
          .map(
            (doc): ManagerRollupDocumentInput => ({
              id: doc.id,
              dealId: doc.dealId,
              name: doc.name,
              receivedDate: doc.receivedDate,
              reviewer: doc.reviewer,
              uploaded: doc.uploaded,
              status: doc.status,
            }),
          ),
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
  // service failure is visible to the manager rather than hidden
  // behind a perpetual "Loading…" placeholder (same pattern Phase 84
  // applies on the team rollup card).
  if (teamPipeline.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load team signals" detail={teamPipeline.message} />
    );
  }
  if (teamTasks.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load team signals" detail={teamTasks.message} />
    );
  }
  if (teamDocuments.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load team signals"
        detail={teamDocuments.message}
      />
    );
  }
  if (teamMemos.kind === 'failed') {
    return (
      <ErrorBlock title="Could not load team signals" detail={teamMemos.message} />
    );
  }
  if (teamMemoSections.kind === 'failed') {
    return (
      <ErrorBlock
        title="Could not load team signals"
        detail={teamMemoSections.message}
      />
    );
  }

  if (
    teamPipeline.kind === 'loading' ||
    teamTasks.kind === 'loading' ||
    teamDocuments.kind === 'loading' ||
    teamMemos.kind === 'loading' ||
    teamMemoSections.kind === 'loading'
  ) {
    return <p style={styles.muted}>Loading team signals…</p>;
  }

  if (rollup == null || teamPipeline.data.length === 0) {
    return (
      <>
        <p style={styles.muted}>
          No active deals on the team yet. Signals will populate as deals
          enter the pipeline.
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically. No
          AI or automated decisions.
        </p>
      </>
    );
  }

  // Phase 92: the unfiltered pipeline has deals, but the active
  // banker filter excluded all of them — render a filter-aware
  // empty state.
  if (rollup.totalDealsScanned === 0) {
    return (
      <>
        <p style={styles.muted}>
          {emptyForFilterCopy(filter.selection)}
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically. No
          AI or automated decisions.
        </p>
      </>
    );
  }

  if (rollup.dealsWithSuggestions === 0) {
    return (
      <>
        <p style={styles.muted}>
          No next-best-action suggestions from current records.
        </p>
        <p style={styles.signalCoverage}>
          Manager rollup uses the available manager-scoped records on
          your team's pipeline (deals, open tasks, document checklist
          rows, credit memos, and memo draft sections).
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically. No
          AI or automated decisions.
        </p>
      </>
    );
  }

  return (
    <div style={styles.section}>
      <div style={styles.countsRow} aria-label="Priority counts">
        <CountChip
          label="High"
          value={rollup.highPriorityDealCount}
          variant="atRisk"
        />
        <CountChip
          label="Medium"
          value={rollup.mediumPriorityDealCount}
          variant="info"
        />
        <CountChip
          label="Low"
          value={rollup.lowPriorityDealCount}
          variant="neutral"
        />
        <span style={styles.scanLine}>
          Scanned {rollup.totalDealsScanned} team deal
          {rollup.totalDealsScanned === 1 ? '' : 's'} · {rollup.dealsWithSuggestions} with signals
        </span>
      </div>

      <ul style={styles.list} aria-label="Top team deals with next-best-action signals">
        {rollup.topDeals.map((d) => {
          const ledgerKey = `manager-rollup|${d.dealId}|${d.topSuggestion.id}`;
          return (
            <RollupRow
              key={d.dealId}
              row={d}
              ledgerEntry={ledger.entries[ledgerKey]}
              onDismiss={() =>
                ledger.recordDismissed({
                  surface: 'manager-rollup',
                  suggestionId: d.topSuggestion.id,
                  dealId: d.dealId,
                  titleSnapshot: d.topSuggestion.title,
                })
              }
              onRestore={() => ledger.clear(ledgerKey)}
              onOpened={() =>
                ledger.recordOpened({
                  surface: 'manager-rollup',
                  suggestionId: d.topSuggestion.id,
                  dealId: d.dealId,
                  titleSnapshot: d.topSuggestion.title,
                })
              }
            />
          );
        })}
      </ul>

      <p style={styles.signalCoverage}>
        Manager rollup uses the available manager-scoped records on your
        team's pipeline (deals, open tasks, document checklist rows,
        credit memos). Memo consistency findings appear on each deal's
        Next Best Actions panel inside the Deal Workspace; they do not
        fire on this rollup.
      </p>
      <p style={styles.disclaimer}>
        Derived from current records. Nothing happens automatically.
        No AI or automated decisions. Manager visibility is scoped to
        the manager's team pipeline; deals outside that scope are not
        evaluated and not surfaced here. "Dismiss locally" and
        "Opened locally" are tracked on this browser only; they do
        not change deal status.
      </p>
    </div>
  );
}

function RollupRow({
  row,
  ledgerEntry,
  onDismiss,
  onRestore,
  onOpened,
}: {
  row: ManagerRollupDeal;
  ledgerEntry: SuggestionLedgerEntry | undefined;
  onDismiss: () => void;
  onRestore: () => void;
  onOpened: () => void;
}) {
  const navigate = useNavigate();
  const severity = PRIORITY_TO_SEVERITY[row.highestPriority];
  const isDismissed = ledgerEntry?.action === 'dismissed';
  const isOpened = ledgerEntry?.action === 'opened';
  return (
    <li
      style={isDismissed ? { ...styles.row, ...styles.rowDismissed } : styles.row}
    >
      <div style={styles.rowHead}>
        <button
          type="button"
          onClick={() => {
            onOpened();
            navigate(`/deals/${row.dealId}`);
          }}
          style={styles.dealNameButton}
          aria-label={`Open deal ${row.dealName}`}
        >
          {row.dealName}
        </button>
        <Badge
          variant={severity}
          appearance="outline"
          aria-label={`${PRIORITY_LABEL[row.highestPriority]} priority signal`}
        >
          {PRIORITY_LABEL[row.highestPriority]}
        </Badge>
      </div>
      <p style={styles.rowSuggestion}>
        {row.topSuggestion.title}
        {row.suggestionCount > 1 ? (
          <span style={styles.moreInline}>
            {' '}
            (+{row.suggestionCount - 1} more on this deal)
          </span>
        ) : null}
      </p>
      <p style={styles.rowReason}>{row.topSuggestion.reason}</p>
      <div style={styles.rowMeta}>
        <span>
          <span style={styles.metaLabel}>Banker: </span>
          {row.assignedBankerName ?? '— (unassigned)'}
        </span>
        {row.stage && (
          <span>
            <span style={styles.metaLabel}>Stage: </span>
            {row.stage}
          </span>
        )}
        <span>
          <span style={styles.metaLabel}>Target close: </span>
          {formatTargetClose(row.targetCloseDate)}
        </span>
      </div>
      <div style={styles.ledgerRow}>
        {isDismissed ? (
          <>
            <span style={styles.dismissedTag}>
              Dismissed locally · {formatLedgerDate(ledgerEntry.recordedAt)}
              {' '}· tracked on this browser
            </span>
            <button
              type="button"
              onClick={onRestore}
              style={styles.ledgerSecondaryButton}
              aria-label={`Restore suggestion for ${row.dealName}`}
            >
              Restore
            </button>
          </>
        ) : (
          <>
            {isOpened && (
              <span style={styles.openedTag}>
                Opened locally · {formatLedgerDate(ledgerEntry.recordedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={onDismiss}
              style={styles.ledgerSecondaryButton}
              aria-label={`Dismiss suggestion for ${row.dealName} locally`}
            >
              Dismiss locally
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function emptyForFilterCopy(
  selection: ManagerBankerFilterView['selection'],
): string {
  if (selection.kind === 'banker') {
    return `No deals match the current filter (focused on ${selection.name}).`;
  }
  if (selection.kind === 'unassigned') {
    return 'No deals match the current filter (focused on Unassigned).';
  }
  return 'No active deals on the team yet. Signals will populate as deals enter the pipeline.';
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

function CountChip({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: SeverityKey;
}) {
  return (
    <Badge
      variant={variant}
      appearance="outline"
      aria-label={`${label} priority: ${value} deal${value === 1 ? '' : 's'}`}
    >
      {label}: {value}
    </Badge>
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

function formatTargetClose(iso: string | undefined): string {
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
  countsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
  },
  scanLine: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    marginLeft: spacing.xs,
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
  rowSuggestion: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
    fontWeight: typography.weight.medium,
  },
  moreInline: {
    color: palette.textSubtle,
    fontWeight: typography.weight.regular,
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

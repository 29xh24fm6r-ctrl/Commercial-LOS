import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBanker } from './BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from './workQueueQueries';
import {
  deriveBankerAutopilotRollup,
  type BankerRollupDeal,
} from '../shared/autopilot/bankerAutopilotRollup';
import type { AutopilotPriority } from '../shared/autopilot/dealAutopilot';
import { useSuggestionLedger } from '../shared/autopilot/useSuggestionLedger';
import type { SuggestionLedgerEntry } from '../shared/autopilot/suggestionLedger';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 82: banker-side Autopilot rollup card on the Banker Command
 * Center.
 *
 * Reuses the Phase 80 derivation via the Phase 82 thin aggregator
 * `deriveBankerAutopilotRollup` against the banker work-queue data
 * the workspace already loads. Surfaces:
 *   - HIGH / MEDIUM / LOW priority counts across the banker's
 *     pipeline,
 *   - top 5 deals ranked by priority → suggestion count → nearest
 *     close → name,
 *   - per-row top suggestion title + reason, priority badge,
 *     client + stage + target-close meta,
 *   - read-only deal-name click-through to /deals/<id>.
 *
 * Banker-only by construction: lives under BankerProvider, consumes
 * `loadBankerWorkQueueData(bankerId)` — the same banker-authorized
 * loader the work queue + relationship memory + personal activity
 * summary already use. No new query shape.
 *
 * Signal coverage on the banker rollup is honestly narrower than
 * the Phase 80 per-deal panel by ONE signal:
 *   ✓ overdue-tasks, pending-review-documents,
 *     closing-soon-stale-activity, closing-soon, stage-aging,
 *     outstanding-documents, draft-memo, stale-activity
 *   ✗ memo-consistency-findings — requires full CreditMemoData
 *     (sections), which the banker work-queue loader does not
 *     fetch. The signal still fires on the Phase 80 panel inside
 *     each deal workspace.
 *
 * No Dataverse write. No audit. No timeline. No AI. No automation.
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

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed'; message: string };

export function BankerAutopilotRollup() {
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
          title="My next-best-action signals"
          subtitle="Loading personal pipeline signals…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }
  if (state.kind === 'failed') {
    return (
      <Card>
        <CardHeader
          title="My next-best-action signals"
          subtitle="Could not load pipeline signals."
        />
        <ErrorBlock
          title="Could not load my next-best-action signals"
          detail={state.message}
        />
      </Card>
    );
  }

  return <Ready data={state.data} />;
}

function Ready({ data }: { data: BankerWorkQueueData }) {
  const now = useMemo(() => new Date(), []);
  const ledger = useSuggestionLedger();
  const rollup = useMemo(
    () =>
      deriveBankerAutopilotRollup(
        {
          deals: data.deals.map((d) => ({
            id: d.id,
            name: d.name,
            clientName: d.clientName,
            stage: d.stage,
            targetCloseDate: d.targetCloseDate,
            stageEntryDate: d.stageEntryDate,
            lastActivityOn: d.lastActivityOn,
          })),
          tasks: data.tasks.map((t) => ({
            id: t.id,
            dealId: t.dealId,
            title: t.title,
            dueDate: t.dueDate,
            completed: t.completed,
          })),
          outstandingDocuments: data.outstandingDocuments.map((doc) => ({
            id: doc.id,
            dealId: doc.dealId,
            name: doc.name,
            receivedDate: doc.receivedDate,
            reviewer: doc.reviewer,
            uploaded: doc.uploaded,
          })),
          pendingReviewDocuments: data.pendingReviewDocuments.map((doc) => ({
            id: doc.id,
            dealId: doc.dealId,
            name: doc.name,
            receivedDate: doc.receivedDate,
            reviewer: doc.reviewer,
            uploaded: doc.uploaded,
          })),
          memos: data.memos.map((m) => ({
            id: m.id,
            dealId: m.dealId,
            statusKey: m.statusKey,
          })),
        },
        now,
      ),
    [data, now],
  );

  if (rollup.totalDealsScanned === 0) {
    return (
      <Card>
        <CardHeader
          title="My next-best-action signals"
          subtitle="Derived from current records. Nothing happens automatically."
        />
        <p style={styles.muted}>
          No active deals assigned to you yet. Signals will populate as
          deals enter your pipeline.
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically. No
          AI or automated decisions.
        </p>
      </Card>
    );
  }

  if (rollup.dealsWithSuggestions === 0) {
    return (
      <Card>
        <CardHeader
          title="My next-best-action signals"
          subtitle="Derived from current records. Nothing happens automatically."
        />
        <p style={styles.muted}>
          No next-best-action suggestions from current records.
        </p>
        <p style={styles.signalCoverage}>
          Banker rollup uses your work-queue data (deals, open tasks,
          outstanding + pending-review documents, memos). Memo
          consistency findings appear on each deal's Next Best Actions
          panel inside the Deal Workspace; they do not fire on this
          rollup.
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically.
          No AI or automated decisions.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="My next-best-action signals"
        subtitle="Derived from current records. Nothing happens automatically."
      />
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
            Scanned {rollup.totalDealsScanned} of your deal
            {rollup.totalDealsScanned === 1 ? '' : 's'} ·{' '}
            {rollup.dealsWithSuggestions} with signals
          </span>
        </div>

        <ul
          style={styles.list}
          aria-label="My top deals with next-best-action signals"
        >
          {rollup.topDeals.map((d) => {
            const ledgerKey = `banker-rollup|${d.dealId}|${d.topSuggestion.id}`;
            return (
              <RollupRow
                key={d.dealId}
                row={d}
                ledgerEntry={ledger.entries[ledgerKey]}
                onDismiss={() =>
                  ledger.recordDismissed({
                    surface: 'banker-rollup',
                    suggestionId: d.topSuggestion.id,
                    dealId: d.dealId,
                    titleSnapshot: d.topSuggestion.title,
                  })
                }
                onRestore={() => ledger.clear(ledgerKey)}
                onOpened={() =>
                  ledger.recordOpened({
                    surface: 'banker-rollup',
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
          Banker rollup uses your work-queue data (deals, open tasks,
          outstanding + pending-review documents, memos). Memo
          consistency findings appear on each deal's Next Best Actions
          panel inside the Deal Workspace; they do not fire on this
          rollup.
        </p>
        <p style={styles.disclaimer}>
          Derived from current records. Nothing happens automatically.
          No AI or automated decisions. Open a deal to act — the Phase
          80 per-deal panel and the existing card actions are the only
          places a write happens. "Dismiss locally" and "Opened locally"
          are tracked on this browser only; they do not change deal
          status.
        </p>
      </div>
    </Card>
  );
}

function RollupRow({
  row,
  ledgerEntry,
  onDismiss,
  onRestore,
  onOpened,
}: {
  row: BankerRollupDeal;
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
      style={
        isDismissed ? { ...styles.row, ...styles.rowDismissed } : styles.row
      }
    >
      <div style={styles.rowHead}>
        <button
          type="button"
          onClick={() => {
            // Opening a deal from the rollup counts as "opened" in
            // the local ledger. Same intent the per-deal panel uses
            // when the banker clicks the action button.
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
        {row.clientName && (
          <span>
            <span style={styles.metaLabel}>Client: </span>
            {row.clientName}
          </span>
        )}
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

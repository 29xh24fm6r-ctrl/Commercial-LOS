import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManagerData, type AsyncResult } from './ManagerDataProvider';
import type {
  TeamDeal,
  TeamScopedDocument,
  TeamScopedMemo,
  TeamScopedTask,
} from './managerQueries';
import {
  deriveManagerMorningCatchUp,
  type ManagerCatchUpItem,
  type ManagerCatchUpPriority,
} from '../shared/activity/managerMorningCatchUp';
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
  const { teamPipeline, teamTasks, teamDocuments, teamMemos } = useManagerData();
  return (
    <Card>
      <CardHeader
        title="Morning catch-up"
        subtitle="Derived from current manager-visible records. Nothing happens automatically."
      />
      <Body
        teamPipeline={teamPipeline}
        teamTasks={teamTasks}
        teamDocuments={teamDocuments}
        teamMemos={teamMemos}
      />
    </Card>
  );
}

function Body({
  teamPipeline,
  teamTasks,
  teamDocuments,
  teamMemos,
}: {
  teamPipeline: AsyncResult<TeamDeal[]>;
  teamTasks: AsyncResult<TeamScopedTask[]>;
  teamDocuments: AsyncResult<TeamScopedDocument[]>;
  teamMemos: AsyncResult<TeamScopedMemo[]>;
}) {
  const now = useMemo(() => new Date(), []);

  const items = useMemo(() => {
    if (
      teamPipeline.kind !== 'ready' ||
      teamTasks.kind !== 'ready' ||
      teamDocuments.kind !== 'ready' ||
      teamMemos.kind !== 'ready'
    ) {
      return null;
    }
    return deriveManagerMorningCatchUp(
      {
        deals: teamPipeline.data.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          assignedBankerName: d.assignedBankerName,
          targetCloseDate: d.targetCloseDate,
          stageEntryDate: d.stageEntryDate,
          modifiedOn: d.modifiedOn,
        })),
        tasks: teamTasks.data.map((t) => ({
          id: t.id,
          dealId: t.dealId,
          title: t.title,
          dueDate: t.dueDate,
          completed: t.completed,
        })),
        documents: teamDocuments.data.map((doc) => ({
          id: doc.id,
          dealId: doc.dealId,
          name: doc.name,
          receivedDate: doc.receivedDate,
          reviewer: doc.reviewer,
          status: doc.status,
        })),
        memos: teamMemos.data.map((m) => ({
          id: m.id,
          dealId: m.dealId,
          statusKey: m.statusKey,
        })),
      },
      now,
    );
  }, [teamPipeline, teamTasks, teamDocuments, teamMemos, now]);

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

  if (items == null) {
    return <p style={styles.muted}>Loading catch-up…</p>;
  }

  if (items.length === 0) {
    return (
      <>
        <p style={styles.muted}>No catch-up items from current records.</p>
        <p style={styles.disclaimer}>
          Derived from current manager-visible records. Nothing happens
          automatically. Not AI-generated.
        </p>
      </>
    );
  }

  return (
    <div style={styles.section}>
      <ul style={styles.list} aria-label="Manager morning catch-up items">
        {items.map((item) => (
          <FeedItemRow key={item.id} item={item} />
        ))}
      </ul>
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
        here.
      </p>
    </div>
  );
}

function FeedItemRow({ item }: { item: ManagerCatchUpItem }) {
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

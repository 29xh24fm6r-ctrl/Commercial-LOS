import { useMemo } from 'react';
import { useDealData } from './DealDataProvider';
import { checkCreditMemoConsistency } from '../shared/creditMemoConsistency/checkCreditMemoConsistency';
import {
  deriveNextBestActions,
  type AutopilotInput,
  type AutopilotPriority,
  type NextBestAction,
} from '../shared/autopilot/dealAutopilot';
import { Card, CardHeader } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

/**
 * Phase 80: Deal Autopilot Lite panel.
 *
 * Surfaces 1–3 deterministic next-best-action suggestions on the
 * Banker Deal Workspace, derived from the deal record + open tasks +
 * documents + memos + activity timeline + Phase 73 memo-consistency
 * check. Every suggestion's `isAutomated` is the literal `false`
 * (typed-level contract) — the panel never executes anything. The
 * banker scrolls to the relevant card and chooses what to do.
 *
 * Allowed navigation: scrollIntoView to one of the four cards
 * BankerDealWorkspace wraps with a data-deal-card="..." attribute.
 * The panel never:
 *   - creates a task,
 *   - marks a document received / reviewed,
 *   - sends an email,
 *   - advances stage,
 *   - calls AI,
 *   - writes to Dataverse,
 *   - emits an audit row or timeline event,
 *   - persists a suggestion ledger.
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

export function DealAutopilotPanel() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();

  // Wait until every input is ready before computing. The panel is
  // advisory; rendering against partial data could produce confusing
  // half-suggestions.
  const dataReady =
    tasks.kind === 'ready' &&
    documents.kind === 'ready' &&
    creditMemo.kind === 'ready' &&
    activity.kind === 'ready';

  const memoConsistencyFindingsCount = useMemo(() => {
    if (creditMemo.kind !== 'ready') return 0;
    const result = checkCreditMemoConsistency(deal, creditMemo.data);
    return result.findings.length;
  }, [deal, creditMemo]);

  const now = useMemo(() => new Date(), []);

  const suggestions: NextBestAction[] = useMemo(() => {
    if (!dataReady) return [];
    if (
      tasks.kind !== 'ready' ||
      documents.kind !== 'ready' ||
      creditMemo.kind !== 'ready' ||
      activity.kind !== 'ready'
    ) {
      return [];
    }
    const input: AutopilotInput = {
      deal: {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        targetCloseDate: deal.targetCloseDate,
        stageEntryDate: deal.stageEntryDate,
      },
      openTasks: tasks.data.open.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        completed: t.completed,
      })),
      outstandingDocuments: documents.data.outstanding.map((d) => ({
        id: d.id,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
        uploaded: d.uploaded,
      })),
      receivedDocuments: documents.data.received.map((d) => ({
        id: d.id,
        name: d.name,
        receivedDate: d.receivedDate,
        reviewer: d.reviewer,
        uploaded: d.uploaded,
      })),
      memos: creditMemo.data.memos.map((m) => ({
        id: m.id,
        statusKey: m.statusKey,
      })),
      memoConsistencyFindingsCount,
      mostRecentActivityIso: activity.data[0]?.eventAt,
    };
    return deriveNextBestActions(input, now);
  }, [
    dataReady,
    tasks,
    documents,
    creditMemo,
    activity,
    deal,
    memoConsistencyFindingsCount,
    now,
  ]);

  if (!dataReady) {
    return (
      <Card>
        <CardHeader
          title="Next best actions"
          subtitle="Loading deal signals…"
        />
        <p style={styles.muted}>Loading…</p>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Next best actions"
          subtitle="Derived from current deal records. Nothing happens automatically."
        />
        <p style={styles.muted}>
          No next-best-action suggestions from current records.
        </p>
        <p style={styles.disclaimer}>
          Autopilot suggests, banker decides. This panel is read-only;
          it never creates tasks, sends emails, advances the stage,
          marks documents reviewed, or calls AI.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Next best actions"
        subtitle="Derived from current deal records. Nothing happens automatically."
      />
      <ul style={styles.list} aria-label="Next best actions for this deal">
        {suggestions.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} />
        ))}
      </ul>
      <p style={styles.disclaimer}>
        Autopilot suggests, banker decides. This panel is read-only; it
        never creates tasks, sends emails, advances the stage, marks
        documents reviewed, or calls AI. Suggestions are derived from
        current deal records only.
      </p>
    </Card>
  );
}

function SuggestionRow({ suggestion }: { suggestion: NextBestAction }) {
  function handleOpen() {
    // Scroll the target card into view. The card is identified by a
    // data-deal-card attribute on a wrapping div in
    // BankerDealWorkspace. If the wrapper is missing (e.g. during a
    // test render of the panel in isolation), this no-ops safely.
    if (typeof document === 'undefined') return;
    const el = document.querySelector<HTMLElement>(
      `[data-deal-card="${suggestion.targetSurface}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Best-effort focus: if the card wrapper or its first focusable
    // descendant accepts focus, move focus there so keyboard users
    // follow the scroll. We never force a focus into a write
    // surface — focus lands on the card container.
    if (typeof el.focus === 'function') {
      // tabIndex -1 lets a div be focused programmatically without
      // joining the tab order. Set it on the wrapper if it doesn't
      // already declare a tabindex.
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
      }
      el.focus({ preventScroll: true });
    }
  }
  const severity = PRIORITY_TO_SEVERITY[suggestion.priority];
  const descId = `autopilot-reason-${suggestion.id}`;
  return (
    <li style={styles.row}>
      <div style={styles.rowHead}>
        <span style={styles.rowTitle}>{suggestion.title}</span>
        <Badge
          variant={severity}
          appearance="outline"
          aria-label={`${PRIORITY_LABEL[suggestion.priority]} priority suggestion`}
        >
          {PRIORITY_LABEL[suggestion.priority]}
        </Badge>
      </div>
      <p id={descId} style={styles.rowReason}>
        {suggestion.reason}
      </p>
      <div style={styles.rowFoot}>
        <button
          type="button"
          onClick={handleOpen}
          style={styles.openButton}
          aria-describedby={descId}
          aria-label={`${suggestion.suggestedActionLabel} — banker chooses what to do`}
        >
          {suggestion.suggestedActionLabel}
        </button>
        <span style={styles.basisLine}>
          Basis: {suggestion.sourceSignals.join(', ')}
        </span>
      </div>
    </li>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  rowTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  rowReason: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  rowFoot: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    paddingTop: 2,
  },
  openButton: {
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
  basisLine: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontFamily: typography.mono,
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.sm,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
};

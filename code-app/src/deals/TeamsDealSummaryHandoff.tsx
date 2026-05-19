import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import {
  loadBankerWorkQueueData,
  type BankerWorkQueueData,
} from '../banker/workQueueQueries';
import {
  buildTeamsDealSummary,
  type TeamsDealSummaryInput,
  type TeamsDealSummaryTopSuggestion,
} from './teamsDealSummary';
import { checkCreditMemoConsistency } from '../shared/creditMemoConsistency/checkCreditMemoConsistency';
import {
  deriveNextBestActions,
  type AutopilotInput,
} from '../shared/autopilot/dealAutopilot';
import { deriveCrossDealContext } from '../shared/relationship/relationshipMemory';
import { buildRelationshipContextNote } from '../shared/relationship/relationshipContextNote';
import { Card, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 96 → Phase 97: local-only "Copy Teams summary" handoff card
 * on the Banker Deal Workspace.
 *
 * Renders a plain-text deal summary the banker can copy and paste
 * into Microsoft Teams (any chat or channel). The app does not post
 * to Teams, send anything, sync with Teams, notify anyone, or call
 * Graph. Sibling to the Phase 86 `<TeamsChatHandoff />` deep-link
 * card — that card opens the banker's Teams client; this card
 * generates the message body the banker pastes after the Teams
 * composer opens.
 *
 * Phase 97 adds an optional relationship-context line to the
 * generated summary. The line is derived from the SAME Phase 76/77
 * primitive `<RelationshipContext />` already uses on this same
 * Deal Workspace — `deriveCrossDealContext` over
 * `loadBankerWorkQueueData(bankerId)`. The note is rendered by the
 * pure `buildRelationshipContextNote` formatter, which returns
 * `undefined` when there is no useful content (no client name on
 * record OR no other visible deals); Phase 96's formatter then
 * omits the entire "Relationship: " line. No new derivation logic
 * is introduced — Phase 97 is wiring + a one-line formatter.
 *
 * What this is NOT (intentional non-capabilities):
 *   - Not a Teams integration. The app does not post to Teams, read
 *     from Teams, or sync with Teams.
 *   - Not a notification surface. The app does not raise a Teams
 *     activity-feed notification on the banker's behalf.
 *   - Not a Graph caller. No token acquisition, no Graph API calls.
 *   - Not a Dataverse write. No audit row, no timeline event, no
 *     governed-write entry.
 *   - Not a relationship graph. The relationship line is
 *     client-name grouped, same limitation Phase 76/77 carries.
 *   - Not an AI / Copilot surface. The relationship note is
 *     deterministic.
 *
 * Local-only inventory entry: LOCAL_ONLY_FLOWS.teams-deal-summary-handoff.
 */

type CopyState =
  | { kind: 'idle' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' };

type RelationshipState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: BankerWorkQueueData }
  | { kind: 'failed' };

export function TeamsDealSummaryHandoff() {
  const { deal, tasks, documents, creditMemo, activity } = useDealData();
  const banker = useOptionalBanker();
  const [copyState, setCopyState] = useState<CopyState>({ kind: 'idle' });
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase 97: load the banker work queue (the same banker-authorized
  // two-step pipeline `<RelationshipContext />` already uses) so we
  // can derive a one-line cross-deal context note. When the loader
  // is unavailable (no bankerId) or it fails, we silently fall back
  // to omitting the relationship line — the rest of the summary
  // still renders unchanged. NEVER throws into Teams handoff paths.
  const bankerId = banker?.bankerId;
  const [relationshipState, setRelationshipState] = useState<RelationshipState>(
    { kind: 'idle' },
  );

  const reloadRelationship = useCallback(() => {
    if (!bankerId) {
      setRelationshipState({ kind: 'idle' });
      return () => undefined;
    }
    let cancelled = false;
    setRelationshipState({ kind: 'loading' });
    loadBankerWorkQueueData(bankerId)
      .then((data) => {
        if (!cancelled) setRelationshipState({ kind: 'ready', data });
      })
      .catch(() => {
        if (cancelled) return;
        // Phase 97 explicitly does NOT surface this as an error to
        // the banker — the relationship line is optional. The card
        // continues to render with the rest of the summary.
        setRelationshipState({ kind: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [bankerId]);

  useEffect(() => {
    const cleanup = reloadRelationship();
    return cleanup;
  }, [reloadRelationship]);

  // Stable "now" so derivation + the generated-on date line line up
  // for the lifetime of this render. The banker rarely keeps a deal
  // workspace open across day boundaries, and a single render's
  // summary should be internally consistent (same timestamp for the
  // Phase 80 derivation AND the Prepared-by line).
  const now = useMemo(() => new Date(), []);

  const dataReady =
    tasks.kind === 'ready' &&
    documents.kind === 'ready' &&
    creditMemo.kind === 'ready' &&
    activity.kind === 'ready';

  const memoConsistencyFindingsCount = useMemo(() => {
    if (creditMemo.kind !== 'ready') return 0;
    return checkCreditMemoConsistency(deal, creditMemo.data).findings.length;
  }, [deal, creditMemo]);

  const topSuggestion: TeamsDealSummaryTopSuggestion | undefined = useMemo(() => {
    if (!dataReady) return undefined;
    if (
      tasks.kind !== 'ready' ||
      documents.kind !== 'ready' ||
      creditMemo.kind !== 'ready' ||
      activity.kind !== 'ready'
    ) {
      return undefined;
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
    const suggestions = deriveNextBestActions(input, now);
    const top = suggestions[0];
    return top ? { title: top.title, reason: top.reason } : undefined;
  }, [
    dataReady,
    deal,
    tasks,
    documents,
    creditMemo,
    activity,
    memoConsistencyFindingsCount,
    now,
  ]);

  // Pending-review documents on the rollup count = received docs
  // with no reviewer (the Phase 80 7-day window is for the signal,
  // not the headline count — the summary line should reflect every
  // doc currently in that state).
  const counts = useMemo(() => {
    if (
      tasks.kind !== 'ready' ||
      documents.kind !== 'ready'
    ) {
      return {
        openTaskCount: 0,
        outstandingDocumentCount: 0,
        pendingReviewDocumentCount: 0,
      };
    }
    return {
      openTaskCount: tasks.data.open.length,
      outstandingDocumentCount: documents.data.outstanding.length,
      pendingReviewDocumentCount: documents.data.received.filter(
        (d) => !(d.reviewer && d.reviewer.trim().length > 0),
      ).length,
    };
  }, [tasks, documents]);

  // Phase 97: derive the one-line relationship context note from
  // the Phase 76/77 cross-deal primitive. When the banker pipeline
  // isn't loaded yet OR the deal has no client name OR no other
  // visible deals share the client-name group, the note is
  // `undefined` and Phase 96's formatter omits the entire
  // "Relationship: " line.
  const relationshipContextNote = useMemo(() => {
    if (relationshipState.kind !== 'ready') return undefined;
    const result = deriveCrossDealContext(
      relationshipState.data,
      deal.id,
      deal.clientName,
      now,
    );
    return buildRelationshipContextNote(result, { now });
  }, [relationshipState, deal.id, deal.clientName, now]);

  const summary = useMemo(() => {
    if (!dataReady) return undefined;
    const input: TeamsDealSummaryInput = {
      dealName: deal.name,
      clientName: deal.clientName,
      stage: deal.stage,
      status: deal.status,
      amount: deal.amount,
      targetCloseDate: deal.targetCloseDate,
      openTaskCount: counts.openTaskCount,
      outstandingDocumentCount: counts.outstandingDocumentCount,
      pendingReviewDocumentCount: counts.pendingReviewDocumentCount,
      memoConsistencyFindingCount: memoConsistencyFindingsCount,
      topSuggestion,
      bankerName: banker?.fullName ?? undefined,
      relationshipContextNote,
      generatedAt: now,
    };
    return buildTeamsDealSummary(input);
  }, [
    dataReady,
    deal,
    counts,
    memoConsistencyFindingsCount,
    topSuggestion,
    banker?.fullName,
    relationshipContextNote,
    now,
  ]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!summary) return;
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

  if (!dataReady) {
    return (
      <Card>
        <CardHeader
          title="Copy Teams summary"
          subtitle="Generates a deal summary you can paste into a Teams chat or channel."
        />
        <p style={styles.muted}>Loading deal data…</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Copy Teams summary"
        subtitle="Generates a deal summary you can paste into a Teams chat or channel. The app does not post to Teams."
      />
      <div style={styles.body}>
        <p style={styles.lead}>
          Click <strong>Copy Teams summary</strong> to copy the preview to
          your clipboard. Paste into Teams. <strong>You send the message
          manually</strong> — the app does not post anything.
        </p>
        <pre
          style={styles.preview}
          aria-label="Teams summary preview"
          data-testid="teams-deal-summary-preview"
        >
          {summary}
        </pre>
        <div style={styles.actionRow}>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!summary}
            style={styles.primaryButton}
            aria-label={`Copy Teams summary for ${deal.name}`}
          >
            Copy Teams summary
          </button>
          {copyState.kind === 'copied' && (
            <span style={styles.successTag} role="status">
              Copied to clipboard. Paste into Teams.
            </span>
          )}
          {copyState.kind === 'copy-failed' && (
            <span style={styles.failTag} role="alert">
              Clipboard unavailable. Select the preview text and copy
              manually.
            </span>
          )}
        </div>
        <p style={styles.disclaimer}>
          Local copy only. Not posted to Teams. Paste into Teams. You
          send the message manually. No Dataverse write. No audit row.
          No timeline event. No Graph call. No Teams notification
          raised. No calendar update. The preview is generated from
          deal records you already see on this page.
        </p>
      </div>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  lead: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    fontStyle: 'italic',
  },
  preview: {
    margin: 0,
    padding: spacing.sm,
    background: palette.surfaceAlt,
    border: `1px solid ${palette.divider}`,
    borderRadius: radius.sm,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: typography.size.xs,
    color: palette.text,
    whiteSpace: 'pre-wrap',
    lineHeight: typography.lineHeight.normal,
    maxHeight: 320,
    overflowY: 'auto',
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryButton: {
    background: palette.primary,
    color: palette.surface,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  successTag: {
    fontSize: typography.size.xs,
    color: palette.clearFg,
    fontStyle: 'italic',
  },
  failTag: {
    fontSize: typography.size.xs,
    color: palette.blockedFg,
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
};

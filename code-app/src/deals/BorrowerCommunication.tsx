import { useCallback, useMemo, useState } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';
import { DraftBorrowerUpdateModal } from './DraftBorrowerUpdateModal';
import { BorrowerSafeStatusPacketModal } from './BorrowerSafeStatusPacketModal';
import {
  sendBorrowerUpdateEmail,
  type SendBorrowerUpdateEmailInput,
} from './sendBorrowerUpdateEmail';
import { Card } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { WidgetHeader } from '../shared/cockpitPrimitives';
import { MailIcon } from '../shared/cockpitIcons';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Read-only borrower communication card. Filtered VIEW of the canonical
 * activity ledger already loaded by DealDataProvider — no new query,
 * no new data source. cr664_DealTimelineEvent's eventType enum has
 * three values that are unambiguously borrower-facing communication:
 * EmailLogged, CallLogged, BorrowerUpdateSent. MeetingLogged is
 * excluded because the ledger doesn't distinguish borrower meetings
 * from internal/vendor meetings.
 */
const BORROWER_COMM_TYPES = new Set<TimelineEventTypeKey>([
  'EmailLogged',
  'CallLogged',
  'BorrowerUpdateSent',
]);

interface BorrowerCommunicationProps {
  /** Phase 36: read-only manager path — no Draft Borrower Update
   *  button, no modal mounted. The filtered timeline still renders.
   *  Defaults to false. */
  readOnly?: boolean;
}

export function BorrowerCommunication({
  readOnly = false,
}: BorrowerCommunicationProps = {}) {
  const { deal, activity, documents, tasks, refresh } = useDealData();
  const banker = useOptionalBanker();
  const filtered = useFilteredActivity(activity);
  const [showDraft, setShowDraft] = useState(false);

  // Phase 108: wrap sendBorrowerUpdateEmail so the activity ledger
  // reloads after the action returns. Mirrors the Phase-104 document-
  // request pattern in DealDocuments.tsx (refresh fires once per
  // attempt, after await, regardless of outcome — the action handles
  // its own audit + timeline coordination, and the activity surface
  // should reflect whatever did land). Validation failures that
  // happen BEFORE the action call short-circuit and do NOT refresh.
  const handleSendBorrowerUpdate = useCallback(
    async (input: SendBorrowerUpdateEmailInput) => {
      if (!banker?.systemUserId) {
        return {
          kind: 'unknown' as const,
          message:
            'Cannot send: missing system user id. The modal Send button should already be disabled in this state.',
        };
      }
      const outcome = await sendBorrowerUpdateEmail(input);
      refresh('after-borrower-update-email');
      return outcome;
    },
    [banker?.systemUserId, refresh],
  );
  // Phase 66: borrower-safe status packet (local preview + copy).
  // Local-only flow — no write. Surfaced alongside the Phase-23
  // draft action when a banker is authorized to view the deal.
  const [showPacket, setShowPacket] = useState(false);

  // Phase 23 draft flow surfaces the action whenever a banker is
  // authorized to view the deal. No write happens on click; the modal
  // is local-only. Phase 36: in manager read-only mode neither the
  // trigger button nor the modal renders.
  const outstandingDocs = documents.kind === 'ready' ? documents.data.outstanding : [];
  const openTasks = tasks.kind === 'ready' ? tasks.data.open : [];
  // The packet needs the full DealDocumentsResult (outstanding +
  // received + reviewed). It's only meaningful when documents are
  // ready; we surface the trigger anyway and let the modal render
  // empty-state sections if the data is loading.
  const fullDocs =
    documents.kind === 'ready'
      ? documents.data
      : { outstanding: [], received: [], reviewed: [] };

  // Phase 125E — communication events count from the timeline.
  const commEventCount =
    activity.kind === 'ready' ? filtered.length : undefined;

  return (
    <>
      <Card>
        <WidgetHeader
          title="Borrower Communication"
          subtitle="Email, call, and update events from the deal timeline."
          icon={<MailIcon />}
          iconTone="info"
          count={commEventCount}
          countTone={commEventCount === 0 ? 'neutral' : 'info'}
          trailing={
            readOnly ? undefined : (
              <div style={styles.actionRow}>
                <button
                  type="button"
                  onClick={() => setShowPacket(true)}
                  style={styles.secondaryButton}
                  aria-label="Open borrower-safe status packet"
                >
                  Borrower-safe status packet
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraft(true)}
                  style={styles.draftButton}
                  aria-label="Draft borrower update"
                >
                  Draft Borrower Update
                </button>
              </div>
            )
          }
        />
        <Body activity={activity} filtered={filtered} />
      </Card>
      {!readOnly && showDraft && (
        <DraftBorrowerUpdateModal
          deal={deal}
          outstandingDocuments={outstandingDocs}
          openTasks={openTasks}
          bankerName={banker?.fullName}
          dealId={deal.id}
          systemUserId={banker?.systemUserId}
          writeDisabledReason={banker?.writeDisabledReason}
          onSendEmail={handleSendBorrowerUpdate}
          onClose={() => setShowDraft(false)}
        />
      )}
      {!readOnly && showPacket && (
        <BorrowerSafeStatusPacketModal
          deal={deal}
          documents={fullDocs}
          bankerName={banker?.fullName}
          onClose={() => setShowPacket(false)}
        />
      )}
    </>
  );
}

function useFilteredActivity(activity: AsyncResult<TimelineEvent[]>): TimelineEvent[] {
  return useMemo(() => {
    if (activity.kind !== 'ready') return [];
    return activity.data.filter(
      (e) => e.eventTypeKey != null && BORROWER_COMM_TYPES.has(e.eventTypeKey),
    );
  }, [activity]);
}

function Body({
  activity,
  filtered,
}: {
  activity: AsyncResult<TimelineEvent[]>;
  filtered: TimelineEvent[];
}) {
  if (activity.kind === 'loading')
    return <p style={styles.muted}>Loading communication…</p>;
  if (activity.kind === 'failed')
    return <ErrorBlock title="Could not load communication" detail={activity.message} />;

  if (filtered.length === 0)
    return <p style={styles.muted}>No recorded borrower communication on this deal yet.</p>;

  return (
    <ol style={styles.list}>
      {filtered.map((e) => (
        <CommRow key={e.id} event={e} />
      ))}
    </ol>
  );
}

function CommRow({ event }: { event: TimelineEvent }) {
  const actor = event.isSystemGenerated ? 'System' : event.actorName ?? 'Unknown user';
  return (
    <li style={styles.row}>
      <StatusDot variant="info" />
      <div style={styles.body}>
        <div style={styles.titleRow}>
          <span style={styles.title}>{event.title}</span>
          {event.eventType && <Badge variant="info">{event.eventType}</Badge>}
        </div>
        {event.summary && <p style={styles.summary}>{event.summary}</p>}
        <div style={styles.meta}>
          <Meta label="When" value={formatWhen(event.eventAt)} />
          <Meta label="By" value={actor} />
        </div>
      </div>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value ?? '—'}</span>
    </span>
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

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const absolute = d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (days < 0) return absolute;
  if (days === 0) {
    const hours = Math.floor((Date.now() - d.getTime()) / 3_600_000);
    if (hours <= 0) return `just now (${absolute})`;
    return `${hours}h ago (${absolute})`;
  }
  if (days === 1) return `yesterday (${absolute})`;
  if (days < 30) return `${days}d ago (${absolute})`;
  return absolute;
}

const styles: Record<string, React.CSSProperties> = {
  muted: {
    margin: 0,
    color: palette.textMuted,
    fontSize: typography.size.sm,
    lineHeight: 1.4,
    padding: `${spacing.md} ${spacing.lg}`,
    background: palette.surfaceAlt,
    border: `1px dashed ${palette.borderStrong}`,
    borderRadius: radius.md,
    textAlign: 'center' as const,
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
    display: 'grid',
    gridTemplateColumns: '14px 1fr',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    alignItems: 'start',
  },
  body: { display: 'flex', flexDirection: 'column', gap: 4 },
  titleRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  title: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  summary: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  meta: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    fontSize: typography.size.sm,
    color: palette.textMuted,
  },
  metaItem: { whiteSpace: 'nowrap', display: 'inline-flex', gap: 4 },
  metaLabel: { color: palette.textSubtle },
  metaValue: { color: palette.text },
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
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
  draftButton: {
    background: palette.primary,
    color: palette.textInverse,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.xxs} ${spacing.sm}`,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
    letterSpacing: typography.letterSpacing.label,
    textTransform: 'uppercase',
  },
  actionRow: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  secondaryButton: {
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
};

import { useMemo } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';
import { summarizeActivitySinceLastVisit } from '../shared/lastVisit/lastVisit';
import { useLastVisit } from '../shared/lastVisit/useLastVisit';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

export function ActivityTimeline() {
  const { deal, activity } = useDealData();
  // Phase 72: per-deal last-visit marker (local-browser only, no
  // Dataverse write). The hook snapshots the prior marker on mount
  // and schedules a fresh marker write after a short settle so the
  // banker sees the "N new since your last visit" badge before it
  // clears for the next visit.
  const { priorLastVisitMs, isInitialized } = useLastVisit(deal.id);
  const sinceLastVisit = useMemo(() => {
    if (!isInitialized) return undefined;
    if (activity.kind !== 'ready') return undefined;
    return summarizeActivitySinceLastVisit(activity.data, priorLastVisitMs);
  }, [activity, priorLastVisitMs, isInitialized]);

  return (
    <Card>
      <CardHeader
        title="Activity Timeline"
        subtitle={subtitleFor(activity, sinceLastVisit, priorLastVisitMs)}
      />
      <Body activity={activity} sinceLastVisit={sinceLastVisit} />
    </Card>
  );
}

function subtitleFor(
  activity: AsyncResult<TimelineEvent[]>,
  sinceLastVisit: ReturnType<typeof summarizeActivitySinceLastVisit> | undefined,
  priorLastVisitMs: number | undefined,
): string | undefined {
  if (activity.kind !== 'ready') return undefined;
  if (activity.data.length === 0) return undefined;
  const base = `${activity.data.length} event${activity.data.length === 1 ? '' : 's'}, newest first`;
  // First visit on this browser: no prior marker to compare. Be
  // explicit so the banker knows the badge will appear next time.
  if (priorLastVisitMs === undefined) {
    return `${base} · first visit on this browser`;
  }
  if (!sinceLastVisit) return base;
  if (sinceLastVisit.newCount === 0) {
    return `${base} · No new activity since your last visit`;
  }
  return `${base} · ${sinceLastVisit.newCount} new since your last visit (locally tracked, this browser)`;
}

function Body({
  activity,
  sinceLastVisit,
}: {
  activity: AsyncResult<TimelineEvent[]>;
  sinceLastVisit: ReturnType<typeof summarizeActivitySinceLastVisit> | undefined;
}) {
  if (activity.kind === 'loading') return <p style={styles.muted}>Loading activity…</p>;
  if (activity.kind === 'failed')
    return <ErrorBlock title="Could not load activity" detail={activity.message} />;

  const events = activity.data;
  if (events.length === 0)
    return <p style={styles.muted}>No timeline events on this deal yet.</p>;

  return (
    <ol style={styles.list}>
      {events.map((e) => (
        <EventRow
          key={e.id}
          event={e}
          isNewSinceLastVisit={
            sinceLastVisit ? sinceLastVisit.isNew(e.eventAt) : false
          }
        />
      ))}
    </ol>
  );
}

function EventRow({
  event,
  isNewSinceLastVisit,
}: {
  event: TimelineEvent;
  isNewSinceLastVisit: boolean;
}) {
  const sev = severityFor(event.eventTypeKey);
  const actor = event.isSystemGenerated ? 'System' : event.actorName ?? 'Unknown user';
  const sourceLabel = friendlyEntityLabel(event.relatedEntityType);

  return (
    <li
      style={isNewSinceLastVisit ? { ...styles.row, ...styles.rowNew } : styles.row}
      data-new-since-last-visit={isNewSinceLastVisit ? 'true' : undefined}
    >
      <div style={styles.lane}>
        <StatusDot variant={sev} />
      </div>
      <div style={styles.body}>
        <div style={styles.titleRow}>
          <span style={styles.title}>{event.title}</span>
          {event.eventType && (
            <Badge
              variant={sev}
              title={event.eventTypeKey ? `Event type key: ${event.eventTypeKey}` : undefined}
            >
              {event.eventType}
            </Badge>
          )}
          {event.eventSubType && (
            <span
              style={styles.subTypeBadge}
              title={event.eventSubType}
            >
              {event.eventSubType}
            </span>
          )}
          {isNewSinceLastVisit && (
            <Badge
              variant="info"
              appearance="outline"
              title="New since your last visit on this browser. Locally tracked; not synced across devices."
              // Phase 74: aria-label parity — the bare visible "New"
              // is ambiguous to screen readers without the title
              // context. Provide the full meaning explicitly.
              aria-label="New since your last visit on this browser, locally tracked"
            >
              New
            </Badge>
          )}
        </div>
        {event.summary && <p style={styles.summary}>{event.summary}</p>}
        <div style={styles.meta}>
          <Meta label="When" value={formatWhen(event.eventAt)} />
          {/* Phase 58: subtly distinguish system-generated events
              from banker actions via italicized actor value. No new
              color, no new layout. */}
          <Meta
            label="By"
            value={actor}
            italic={event.isSystemGenerated}
          />
          {sourceLabel && (
            <Meta
              label="Source"
              value={sourceLabel}
              valueTitle={
                event.relatedEntityType && event.relatedEntityType !== sourceLabel
                  ? `Schema entity: ${event.relatedEntityType}`
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </li>
  );
}

function Meta({
  label,
  value,
  italic,
  valueTitle,
}: {
  label: string;
  value: string | undefined;
  italic?: boolean;
  valueTitle?: string;
}) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span
        style={italic ? styles.metaValueItalic : styles.metaValue}
        title={valueTitle}
      >
        {value ?? '—'}
      </span>
    </span>
  );
}

/** Phase 58: maps schema entity names (e.g. cr664_documentchecklist)
 *  to banker-friendly source labels. Falls back to the raw value
 *  when no mapping is documented, so a future schema entity does
 *  not silently disappear — it just shows its raw name with the
 *  full identifier on the title attribute. */
function friendlyEntityLabel(
  entityType: string | undefined,
): string | undefined {
  if (!entityType) return undefined;
  const map: Record<string, string> = {
    cr664_dealtask1: 'Task',
    cr664_documentchecklist: 'Document',
    cr664_creditmemo1: 'Credit memo',
    cr664_creditmemodraftsection: 'Credit memo section',
    cr664_loandeal: 'Deal',
    cr664_alertqueue: 'Alert',
    cr664_dataqualityflag: 'Data quality flag',
  };
  return map[entityType] ?? entityType;
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

/** Color discipline (red stays reserved for DealBlockers.blocked only):
 *   amber = BlockerOpened
 *   clear = positive resolution (BlockerResolved, TaskCompleted,
 *           DocumentUploaded)
 *   info  = banker action / communication
 *   neutral = system + process events */
function severityFor(key: TimelineEventTypeKey | undefined): SeverityKey {
  switch (key) {
    case 'BlockerOpened':
      return 'atRisk';
    case 'BlockerResolved':
    case 'TaskCompleted':
    case 'DocumentUploaded':
      return 'clear';
    case 'CallLogged':
    case 'EmailLogged':
    case 'MeetingLogged':
    case 'NoteLogged':
    case 'BorrowerUpdateSent':
      return 'info';
    case 'StageChanged':
    case 'TaskCreated':
    case 'DocumentRequested':
    case 'DocumentGenerated':
    case 'ApprovalSubmitted':
    case 'ApprovalDecision':
    case undefined:
    default:
      return 'neutral';
  }
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
    fontSize: typography.size.md,
    fontStyle: 'italic',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '22px 1fr',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  // Phase 72: subtle left-border accent on rows newer than the
  // banker's prior last visit. No new color (info palette already
  // exists), no layout shift — the border is inside the existing
  // padding so the row width is unchanged.
  rowNew: {
    borderLeft: `3px solid ${palette.primary}`,
    paddingLeft: spacing.xs,
    marginLeft: -spacing.xs,
    background: palette.surfaceAlt,
    borderRadius: radius.sm,
  },
  lane: { display: 'flex', justifyContent: 'center', paddingTop: 6 },
  body: { display: 'flex', flexDirection: 'column', gap: 4 },
  titleRow: { display: 'flex', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' },
  title: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: palette.text,
  },
  subTypeBadge: {
    padding: '0.1rem 0.45rem',
    borderRadius: radius.sm,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    background: palette.neutralBg,
    color: palette.textMuted,
  },
  summary: {
    margin: 0,
    fontSize: typography.size.md,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
    // Phase 58: long URLs / very long words wrap instead of pushing
    // the timeline row beyond the card edge.
    wordBreak: 'break-word',
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
  // Phase 58: subtle italic for system-generated event actors
  // ("By: System"). No new color, no new layout — same color as
  // the plain value, just italicized.
  metaValueItalic: {
    color: palette.text,
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
  errorHint: { color: palette.textMuted, fontSize: typography.size.xs, fontStyle: 'italic' },
};

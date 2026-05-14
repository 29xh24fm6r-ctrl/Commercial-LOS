import { useDealData, type AsyncResult } from './DealDataProvider';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';
import { Card, CardHeader } from '../shared/Card';
import { Badge, StatusDot } from '../shared/Badge';
import { palette, radius, spacing, typography, type SeverityKey } from '../shared/theme';

export function ActivityTimeline() {
  const { activity } = useDealData();
  return (
    <Card>
      <CardHeader title="Activity Timeline" subtitle={subtitleFor(activity)} />
      <Body activity={activity} />
    </Card>
  );
}

function subtitleFor(activity: AsyncResult<TimelineEvent[]>): string | undefined {
  if (activity.kind !== 'ready') return undefined;
  if (activity.data.length === 0) return undefined;
  return `${activity.data.length} event${activity.data.length === 1 ? '' : 's'}, newest first`;
}

function Body({ activity }: { activity: AsyncResult<TimelineEvent[]> }) {
  if (activity.kind === 'loading') return <p style={styles.muted}>Loading activity…</p>;
  if (activity.kind === 'failed')
    return <ErrorBlock title="Could not load activity" detail={activity.message} />;

  const events = activity.data;
  if (events.length === 0)
    return <p style={styles.muted}>No timeline events on this deal yet.</p>;

  return (
    <ol style={styles.list}>
      {events.map((e) => (
        <EventRow key={e.id} event={e} />
      ))}
    </ol>
  );
}

function EventRow({ event }: { event: TimelineEvent }) {
  const sev = severityFor(event.eventTypeKey);
  const actor = event.isSystemGenerated ? 'System' : event.actorName ?? 'Unknown user';
  const sourceLabel = friendlyEntityLabel(event.relatedEntityType);

  return (
    <li style={styles.row}>
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

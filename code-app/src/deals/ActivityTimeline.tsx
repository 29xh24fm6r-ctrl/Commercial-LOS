import { useDealData, type AsyncResult } from './DealDataProvider';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';

/**
 * Read-only activity timeline scoped to the current deal. Consumes the
 * deal data provider — no fetch of its own. Single source:
 * cr664_DealTimelineEvent (the canonical ledger). Newest events first.
 */
export function ActivityTimeline() {
  const { activity } = useDealData();
  return (
    <section style={styles.card} aria-labelledby="deal-activity-heading">
      <h3 id="deal-activity-heading" style={styles.heading}>
        Activity Timeline
      </h3>
      <Body activity={activity} />
    </section>
  );
}

function Body({ activity }: { activity: AsyncResult<TimelineEvent[]> }) {
  if (activity.kind === 'loading') {
    return <p style={styles.muted}>Loading activity…</p>;
  }
  if (activity.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load activity</div>
        <div style={styles.errorDetail}>{activity.message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    );
  }

  const events = activity.data;
  if (events.length === 0) {
    return <p style={styles.muted}>No timeline events on this deal yet.</p>;
  }

  return (
    <ol style={styles.list}>
      {events.map((e) => (
        <EventRow key={e.id} event={e} />
      ))}
    </ol>
  );
}

function EventRow({ event }: { event: TimelineEvent }) {
  const palette = paletteFor(event.eventTypeKey);
  const actor = event.isSystemGenerated
    ? 'System'
    : event.actorName ?? 'Unknown user';

  return (
    <li style={styles.row}>
      <div style={styles.lane}>
        <span aria-hidden="true" style={{ ...styles.dot, background: palette.dot }} />
      </div>
      <div style={styles.body}>
        <div style={styles.titleRow}>
          <span style={styles.title}>{event.title}</span>
          {event.eventType && (
            <span
              style={{
                ...styles.typeBadge,
                background: palette.badgeBg,
                color: palette.badgeFg,
              }}
            >
              {event.eventType}
            </span>
          )}
          {event.eventSubType && (
            <span style={styles.subTypeBadge}>{event.eventSubType}</span>
          )}
        </div>
        {event.summary && <p style={styles.summary}>{event.summary}</p>}
        <div style={styles.meta}>
          <Meta label="When" value={formatWhen(event.eventAt)} />
          <Meta label="By" value={actor} />
          {event.relatedEntityType && (
            <Meta label="Source" value={event.relatedEntityType} />
          )}
        </div>
      </div>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string | undefined }) {
  return (
    <span style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}:</span>{' '}
      <span style={styles.metaValue}>{value ?? '—'}</span>
    </span>
  );
}

/**
 * Color discipline (red reserved for blocker card only):
 *   amber   = an issue surfaced     (BlockerOpened)
 *   green   = a positive resolution (BlockerResolved, TaskCompleted,
 *                                    DocumentUploaded)
 *   blue    = banker action / communication
 *   neutral = system / process events
 */
function paletteFor(key: TimelineEventTypeKey | undefined): {
  dot: string;
  badgeBg: string;
  badgeFg: string;
} {
  switch (key) {
    case 'BlockerOpened':
      return { dot: '#a86400', badgeBg: '#fff4d6', badgeFg: '#6a3f00' };
    case 'BlockerResolved':
    case 'TaskCompleted':
    case 'DocumentUploaded':
      return { dot: '#1e7e34', badgeBg: '#e7f4ea', badgeFg: '#155724' };
    case 'CallLogged':
    case 'EmailLogged':
    case 'MeetingLogged':
    case 'NoteLogged':
    case 'BorrowerUpdateSent':
      return { dot: '#4a5fc1', badgeBg: '#eef0fa', badgeFg: '#2e3b86' };
    case 'StageChanged':
    case 'TaskCreated':
    case 'DocumentRequested':
    case 'DocumentGenerated':
    case 'ApprovalSubmitted':
    case 'ApprovalDecision':
    case undefined:
    default:
      return { dot: '#5a6a85', badgeBg: '#eef0f4', badgeFg: '#404655' };
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
  card: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: 6,
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  muted: { margin: 0, color: '#888', fontSize: '0.9rem', fontStyle: 'italic' },
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
    gap: '0.6rem',
    paddingBottom: '0.85rem',
    paddingTop: '0.25rem',
  },
  lane: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 7,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: '50%',
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
  },
  title: { fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' },
  typeBadge: {
    padding: '0.1rem 0.45rem',
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  subTypeBadge: {
    padding: '0.1rem 0.45rem',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontWeight: 500,
    background: '#f0f1f3',
    color: '#555',
  },
  summary: {
    margin: 0,
    fontSize: '0.88rem',
    color: '#444',
    lineHeight: 1.45,
  },
  meta: {
    display: 'flex',
    gap: '0.9rem',
    flexWrap: 'wrap',
    fontSize: '0.78rem',
    color: '#666',
  },
  metaItem: { whiteSpace: 'nowrap' },
  metaLabel: { color: '#888' },
  metaValue: { color: '#444' },
  errorBox: {
    background: '#fef6f6',
    border: '1px solid #f3d3d3',
    borderRadius: 4,
    padding: '0.65rem 0.85rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  errorTitle: { color: '#7a0014', fontWeight: 600, fontSize: '0.9rem' },
  errorDetail: { color: '#444', fontSize: '0.85rem' },
  errorHint: { color: '#888', fontSize: '0.8rem', fontStyle: 'italic' },
};

import { useMemo } from 'react';
import { useDealData, type AsyncResult } from './DealDataProvider';
import type { TimelineEvent, TimelineEventTypeKey } from './activityQueries';

/**
 * Read-only borrower communication card. Filtered VIEW of the canonical
 * activity ledger already loaded by DealDataProvider — no new query,
 * no new data source. The card's state mirrors the activity load state
 * (loading / failed / ready) because the source is shared.
 *
 * cr664_DealTimelineEvent's eventType enum has three values that are
 * unambiguously borrower-facing communication: EmailLogged, CallLogged,
 * and BorrowerUpdateSent. MeetingLogged is excluded because the ledger
 * doesn't distinguish borrower meetings from internal/vendor meetings;
 * including all meetings would over-show.
 */
const BORROWER_COMM_TYPES = new Set<TimelineEventTypeKey>([
  'EmailLogged',
  'CallLogged',
  'BorrowerUpdateSent',
]);

export function BorrowerCommunication() {
  const { activity } = useDealData();
  const filtered = useFilteredActivity(activity);

  return (
    <section style={styles.card} aria-labelledby="borrower-comm-heading">
      <header style={styles.header}>
        <h3 id="borrower-comm-heading" style={styles.heading}>
          Borrower Communication
        </h3>
        <p style={styles.subtitle}>
          Email, call, and borrower update events from the deal timeline.
        </p>
      </header>
      <Body activity={activity} filtered={filtered} />
    </section>
  );
}

function useFilteredActivity(
  activity: AsyncResult<TimelineEvent[]>,
): TimelineEvent[] {
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
  if (activity.kind === 'loading') {
    return <p style={styles.muted}>Loading communication…</p>;
  }
  if (activity.kind === 'failed') {
    return (
      <div style={styles.errorBox} role="alert">
        <div style={styles.errorTitle}>Could not load communication</div>
        <div style={styles.errorDetail}>{activity.message}</div>
        <div style={styles.errorHint}>Refresh to retry.</div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p style={styles.muted}>No recorded borrower communication on this deal yet.</p>
    );
  }

  return (
    <ol style={styles.list}>
      {filtered.map((e) => (
        <CommRow key={e.id} event={e} />
      ))}
    </ol>
  );
}

function CommRow({ event }: { event: TimelineEvent }) {
  const palette = paletteFor(event.eventTypeKey);
  const actor = event.isSystemGenerated ? 'System' : event.actorName ?? 'Unknown user';

  return (
    <li style={styles.row}>
      <span aria-hidden="true" style={{ ...styles.dot, background: palette.dot }} />
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
      <span style={styles.metaLabel}>{label}:</span>{' '}
      <span style={styles.metaValue}>{value ?? '—'}</span>
    </span>
  );
}

/** All three included types are banker outreach communications — same
 *  blue palette as the corresponding events in ActivityTimeline. */
function paletteFor(key: TimelineEventTypeKey | undefined): {
  dot: string;
  badgeBg: string;
  badgeFg: string;
} {
  if (
    key === 'EmailLogged' ||
    key === 'CallLogged' ||
    key === 'BorrowerUpdateSent'
  ) {
    return { dot: '#4a5fc1', badgeBg: '#eef0fa', badgeFg: '#2e3b86' };
  }
  return { dot: '#5a6a85', badgeBg: '#eef0f4', badgeFg: '#404655' };
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
  header: { display: 'flex', flexDirection: 'column', gap: '0.2rem' },
  heading: { margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#222' },
  subtitle: { margin: 0, color: '#666', fontSize: '0.82rem' },
  muted: { margin: 0, color: '#888', fontSize: '0.9rem', fontStyle: 'italic' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.65rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '14px 1fr',
    gap: '0.65rem',
    paddingTop: '0.4rem',
    paddingBottom: '0.4rem',
    alignItems: 'start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    marginTop: 7,
  },
  body: { display: 'flex', flexDirection: 'column', gap: '0.3rem' },
  titleRow: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' },
  title: { fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a' },
  typeBadge: {
    padding: '0.1rem 0.45rem',
    borderRadius: 999,
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
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

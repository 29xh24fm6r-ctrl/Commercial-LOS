import { useEffect, useMemo, useState } from 'react';
import { useDealData } from '../deals/DealDataProvider';
import { useBanker } from '../banker/BankerContext';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import {
  getBankerCalendarReadAdapter,
  type BankerCalendarReadState,
} from './outlookCalendarReadAdapter';
import type { CalendarTimeRange } from './bankerAvailability';
import { MeetingProposalControl } from './MeetingProposalControl';

function buildCandidateWindows(now = new Date()): CalendarTimeRange[] {
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 14, 0, 0);
  return [0, 1, 2].map((offset) => ({
    start: new Date(base + offset * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(base + offset * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  }));
}

export function DealCalendarAvailabilityPanel() {
  const { deal } = useDealData();
  const banker = useBanker();
  const dealName = (deal as typeof deal & { dealName?: string }).dealName ?? deal.name;
  const candidateWindows = useMemo(() => buildCandidateWindows(), []);
  const [state, setState] = useState<BankerCalendarReadState>({
    kind: 'loading',
    mode: 'disabled',
    events: [],
    availability: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, kind: 'loading' }));
    getBankerCalendarReadAdapter()
      .load({
        bankerEmail: banker?.email,
        dealId: deal.id,
        dealName,
        timezone: 'UTC',
        candidateWindows,
      })
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            mode: 'disabled',
            events: [],
            availability: [],
            message: error instanceof Error ? error.message : 'Calendar read failed.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [banker?.email, candidateWindows, deal.id, dealName]);

  const statusLabel =
    state.kind === 'ready' ? 'READ_ONLY_READY' :
    state.kind === 'disabled' ? 'WRITE_DISABLED' :
    state.kind === 'not_configured' ? 'NOT_CONFIGURED' :
    state.kind === 'blocked' ? 'BLOCKED' :
    state.kind === 'error' ? 'UNKNOWN' :
    state.kind === 'empty' ? 'READ_ONLY_READY' :
    'UNKNOWN';

  return (
    <Card accentColor={palette.cobalt}>
      <CardHeader
        title="Calendar & banker availability"
        subtitle="Read-only Outlook Calendar view. Meeting writes are disabled."
        trailing={<span style={pillStyle}>{statusLabel}</span>}
      />
      <section aria-label="Upcoming banker meetings" style={sectionStyle}>
        {state.kind === 'loading' && <p style={mutedStyle}>Loading calendar readiness...</p>}
        {state.kind !== 'loading' && state.message && <p style={mutedStyle}>{state.message}</p>}
        {state.events.length > 0 ? (
          <ul style={listStyle}>
            {state.events.map((event) => (
              <li key={event.id} style={itemStyle}>
                <strong>{event.subject}</strong>
                <span>{new Date(event.start).toLocaleString()} - {new Date(event.end).toLocaleString()}</span>
                <span>Timezone: {event.timezone}</span>
                {event.organizer && <span>Organizer: {event.organizer}</span>}
                {event.attendees && event.attendees.length > 0 && (
                  <span>Attendees: {event.attendees.join('; ')}</span>
                )}
                <span>{event.onlineMeeting ? 'Online meeting indicator returned' : event.location ?? 'No location returned'}</span>
                <span>{event.dealId === deal.id ? `Related to ${dealName}` : 'Deal relationship not returned'}</span>
              </li>
            ))}
          </ul>
        ) : (
          state.kind !== 'loading' && <p style={mutedStyle}>No upcoming meetings returned. No availability is fabricated.</p>
        )}
      </section>
      <section aria-label="Proposed time windows" style={sectionStyle}>
        <h4 style={subheadStyle}>Proposed time windows</h4>
        {state.availability.length > 0 ? (
          <ul style={listStyle}>
            {state.availability.map((window) => (
              <li key={`${window.start}-${window.end}`} style={itemStyle}>
                <strong>{window.status.replace(/_/g, ' ')}</strong>
                <span>{new Date(window.start).toLocaleString()} - {new Date(window.end).toLocaleString()} ({window.timezone})</span>
                {window.conflictSubjects.length > 0 && (
                  <span>Conflicts: {window.conflictSubjects.join('; ')}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p style={mutedStyle}>Availability will display only after the calendar adapter returns real events.</p>
        )}
      </section>
      <MeetingProposalControl
        dealId={deal.id}
        dealName={dealName}
        candidateStart={candidateWindows[0]?.start ?? new Date().toISOString()}
        candidateEnd={candidateWindows[0]?.end ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()}
        timezone={candidateWindows[0]?.timezone ?? 'UTC'}
        requiredAttendees={[]}
      />
      <CardFooter>
        <span>No Outlook calendar create/update/delete is executed from this panel.</span>
        <span>Scheduling requires a future explicit confirmation flow and audit event.</span>
      </CardFooter>
    </Card>
  );
}

const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const itemStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.sm, display: 'flex', flexDirection: 'column', gap: 3, fontSize: typography.size.sm };
const mutedStyle: React.CSSProperties = { margin: 0, color: palette.textMuted, fontSize: typography.size.sm };
const pillStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.pill, padding: '2px 8px', fontSize: typography.size.xs, color: palette.textMuted };
const subheadStyle: React.CSSProperties = { margin: 0, fontSize: typography.size.sm, color: palette.text };

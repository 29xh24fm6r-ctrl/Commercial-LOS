import { useMemo, useState } from 'react';
import { useBanker } from '../banker/BankerContext';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import type { BankerCalendarReadRequest, BankerCalendarReadState } from './outlookCalendarReadAdapter';
import { getBankerCalendarReadAdapter } from './outlookCalendarReadAdapter';

function buildDiagnosticRequest(bankerEmail: string | undefined): BankerCalendarReadRequest {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    bankerEmail,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    candidateWindows: [{ start, end, timezone: 'UTC' }],
    top: 5,
  };
}

export function OutlookCalendarReadDiagnosticPanel() {
  const banker = useBanker();
  const request = useMemo(() => buildDiagnosticRequest(banker.email), [banker.email]);
  const [state, setState] = useState<BankerCalendarReadState | undefined>();
  const [loading, setLoading] = useState(false);

  async function runDiagnostic() {
    setLoading(true);
    try {
      setState(await getBankerCalendarReadAdapter().load(request));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card accentColor={palette.cobalt}>
      <CardHeader
        title="Outlook Calendar read diagnostic"
        subtitle="Read-only signed-in-user connector check. Sanitized metadata only."
        trailing={<span style={pillStyle}>{state?.kind.toUpperCase() ?? 'NOT_RUN'}</span>}
      />
      <button type="button" style={buttonStyle} disabled={loading} onClick={runDiagnostic}>
        {loading ? 'Checking calendar...' : 'Check my calendar read binding'}
      </button>
      {state && (
        <section aria-label="Calendar diagnostic results" style={sectionStyle}>
          <p style={mutedStyle}>{state.message}</p>
          <p style={mutedStyle}>Accepted state: {state.kind}; returned events: {state.events.length}</p>
          <ul style={listStyle}>
            {state.events.slice(0, 5).map((event) => (
              <li key={event.id} style={itemStyle}>
                <strong>{event.subject || '(no subject)'}</strong>
                <span>{event.start} to {event.end}</span>
                <span>Show as: {event.showAs ?? 'unknown'}; all day: {event.isAllDay ? 'yes' : 'no'}</span>
                <span>Organizer returned: {event.organizer ? 'yes' : 'no'}; attendees returned: {event.attendees?.length ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CardFooter>
        <span>No event body, raw attendees, calendar IDs, or connection IDs are displayed.</span>
        <span>This diagnostic never creates, updates, deletes, or responds to calendar events.</span>
      </CardFooter>
    </Card>
  );
}

const pillStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.pill, padding: '2px 8px', fontSize: typography.size.xs, color: palette.textMuted };
const buttonStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, background: palette.surfaceAlt, color: palette.text, cursor: 'pointer' };
const sectionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: spacing.xs };
const itemStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.sm, display: 'flex', flexDirection: 'column', gap: 3, fontSize: typography.size.sm };
const mutedStyle: React.CSSProperties = { margin: 0, color: palette.textMuted, fontSize: typography.size.sm };

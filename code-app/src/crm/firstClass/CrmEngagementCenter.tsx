import { useMemo, useState } from 'react';
import { getBankerCalendarReadAdapter, type BankerCalendarReadState } from '../../calendar/outlookCalendarReadAdapter';
import { CRM_M365_CAPABILITIES } from './crmM365Capabilities';

export function CrmEngagementCenter({ bankerEmail }: { bankerEmail: string }) {
  const [state, setState] = useState<BankerCalendarReadState>();
  const [loading, setLoading] = useState(false);
  const request = useMemo(() => {
    const now = Date.now();
    return {
      bankerEmail,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      candidateWindows: [{ start: new Date(now).toISOString(), end: new Date(now + 7 * 86_400_000).toISOString(), timezone: 'UTC' }],
      top: 20,
    };
  }, [bankerEmail]);
  async function load() {
    setLoading(true);
    try { setState(await getBankerCalendarReadAdapter().load(request)); }
    finally { setLoading(false); }
  }
  return <section className="crmws__panel">
    <header className="crmws__panelHead"><span>MICROSOFT 365 · READ BOUNDARY</span><h2>Calendar and engagement capability</h2></header>
    <p>Outlook Calendar is read on demand for the signed-in banker. This workspace does not claim inbox synchronization.</p>
    <button className="crmws__m365Button" type="button" onClick={load} disabled={loading}>{loading ? 'Reading calendar…' : 'Load my next 7 days'}</button>
    {state && <div className="crmws__m365State" role="status"><strong>{state.kind.replaceAll('_',' ').toUpperCase()}</strong><span>{state.message ?? `${state.events.length} events returned.`}</span>
      <ul>{state.events.map((event) => <li key={event.id}><strong>{event.subject || '(no subject)'}</strong><span>{event.start} – {event.end}</span></li>)}</ul></div>}
    <dl className="crmws__capabilities">{Object.entries(CRM_M365_CAPABILITIES).map(([key,value]) => <div key={key}><dt>{key.replace(/([A-Z])/g,' $1')}</dt><dd>{value.replaceAll('-',' ')}</dd></div>)}</dl>
  </section>;
}

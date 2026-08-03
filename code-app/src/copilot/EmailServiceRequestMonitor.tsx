import { useEffect, useState, type CSSProperties } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import { reportCopilotAttention } from './copilotLauncherEvents';
import {
  loadEmailServiceRequestMonitorRows,
  type EmailServiceRequestMonitorLoader,
  type EmailServiceRequestMonitorRow,
} from './emailServiceRequestMonitorData';

export function EmailServiceRequestMonitor({ assigneeSystemUserId, load = loadEmailServiceRequestMonitorRows }: { assigneeSystemUserId: string; load?: EmailServiceRequestMonitorLoader }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ready'; rows: readonly EmailServiceRequestMonitorRow[] } | { kind: 'failed' }>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    load(assigneeSystemUserId).then(rows => { if (active) setState({ kind: 'ready', rows }); }).catch(() => { if (active) setState({ kind: 'failed' }); });
    return () => { active = false; };
  }, [assigneeSystemUserId, load]);

  const attention = state.kind === 'ready' ? state.rows.filter(row => row.status === 'TRIAGE_REQUIRED' || row.status === 'BLOCKED').length : 0;
  useEffect(() => { reportCopilotAttention(attention); }, [attention]);

  if (state.kind === 'loading') return <section aria-label="Copilot email service requests" style={panelStyle}><p role="status">Loading monitored email requests...</p></section>;
  if (state.kind === 'failed') return <section aria-label="Copilot email service requests" style={panelStyle}><p role="alert">Email service-request monitoring is unavailable. No task status was inferred.</p></section>;
  const taskCount = state.rows.filter(row => row.status === 'TASK_CREATED').length;
  return <section aria-label="Copilot email service requests" style={panelStyle}>
    <header style={headerStyle}><div><h3 style={headingStyle}>Copilot email service requests</h3><p style={copyStyle}>Outlook requests linked to your governed work queue.</p></div>{attention > 0 && <span style={badgeStyle}>{attention} need review</span>}</header>
    <div style={summaryStyle}><strong>{taskCount} monitored tasks</strong><span>{attention} triage or blocked</span></div>
    {state.rows.filter(row => row.status === 'TRIAGE_REQUIRED' || row.status === 'BLOCKED').slice(0, 5).map(row => <article key={row.id} style={rowStyle}>
      <strong>{row.subject || 'Untitled service request'}</strong>
      <span>{row.senderAddress} / {row.category} / {Math.round(row.confidence * 100)}% confidence</span>
      <small>{row.statusReason}</small>
    </article>)}
    {state.rows.length === 0 && <p style={copyStyle}>No monitored email service requests.</p>}
  </section>;
}

const panelStyle: CSSProperties = { marginTop: spacing.md, padding: spacing.md, border: `1px solid ${palette.border}`, borderRadius: radius.sm, background: palette.surface };
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: spacing.md, alignItems: 'start' };
const headingStyle: CSSProperties = { margin: 0, fontSize: typography.size.md, color: palette.text };
const copyStyle: CSSProperties = { margin: `${spacing.xs} 0 0`, color: palette.textMuted, fontSize: typography.size.sm };
const badgeStyle: CSSProperties = { padding: `${spacing.xs} ${spacing.sm}`, borderRadius: radius.pill, background: palette.atRiskBg, color: palette.atRiskFg, fontSize: typography.size.xs, fontWeight: typography.weight.semibold };
const summaryStyle: CSSProperties = { display: 'flex', gap: spacing.lg, marginTop: spacing.md, color: palette.text, fontSize: typography.size.sm };
const rowStyle: CSSProperties = { display: 'grid', gap: 2, padding: spacing.sm, marginTop: spacing.sm, borderLeft: `3px solid ${palette.atRisk}`, background: palette.surfaceAlt, color: palette.text, fontSize: typography.size.sm };

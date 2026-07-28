import { useMemo, useState } from 'react';
import { Card, CardFooter, CardHeader } from '../shared/Card';
import { palette, radius, spacing, typography } from '../shared/theme';
import { getM365ActivationConfig } from '../microsoft365/m365ActivationConfig';
import { getMeetingCreationAdapter } from './meetingCreationAdapter';
import {
  buildMeetingIdempotencyKey,
  buildOutlookCalendarEventPayload,
  createDefaultMeetingProposal,
  type MeetingCreationOutcome,
} from './meetingProposalWorkflow';

const APPROVED_INTERNAL_TEST_RECIPIENTS = ['m365-certification@oldglorybank.com'];

export function AdminOutlookEventCreationDiagnosticPanel() {
  const config = getM365ActivationConfig();
  const [calendarId, setCalendarId] = useState('Calendar');
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<MeetingCreationOutcome | undefined>();
  const now = new Date();
  const proposal = useMemo(() => createDefaultMeetingProposal({
    dealId: 'm365-diagnostic',
    dealName: 'M365 Calendar Diagnostic',
    start: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    end: new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    requiredAttendees: APPROVED_INTERNAL_TEST_RECIPIENTS,
    teamsMeetingRequested: config.teamsMeetingCreationEnabled,
    correlationId: `m365-calendar-diagnostic-${now.toISOString().slice(0, 10)}`,
  }), [config.teamsMeetingCreationEnabled]);
  const payload = buildOutlookCalendarEventPayload(proposal);
  const idempotencyKey = buildMeetingIdempotencyKey(proposal);

  async function submitDiagnostic() {
    const adapter = getMeetingCreationAdapter();
    if (!('createGoverned' in adapter)) {
      setOutcome({
        kind: 'blocked',
        message: 'The active meeting adapter does not expose the governed diagnostic create boundary.',
        correlationId: proposal.correlationId,
      });
      return;
    }
    setOutcome(await adapter.createGoverned({
      calendarId,
      proposal,
      idempotencyKey,
      approvedInternalRecipients: APPROVED_INTERNAL_TEST_RECIPIENTS,
      operatorConfirmed: confirmed,
    }));
  }

  return (
    <Card accentColor={palette.atRisk}>
      <CardHeader
        title="Admin Outlook event creation diagnostic"
        subtitle="Disabled by default. Internal test recipients only."
        trailing={<span style={pillStyle}>{config.outlookCalendarWriteEnabled ? 'WRITE_GATE_ON' : 'WRITE_GATE_OFF'}</span>}
      />
      <label style={labelStyle}>
        Calendar alias
        <input value={calendarId} onChange={(event) => setCalendarId(event.target.value)} style={inputStyle} />
      </label>
      <pre style={previewStyle}>{JSON.stringify(payload, null, 2)}</pre>
      <label style={checkStyle}>
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
        I confirm this is an approved internal diagnostic event.
      </label>
      <button type="button" style={buttonStyle} onClick={submitDiagnostic}>
        Submit governed diagnostic create request
      </button>
      {outcome && <p role="status" style={mutedStyle}>{outcome.kind}: {outcome.message}</p>}
      <CardFooter>
        <span>Required downstream confirmation: event appears on organizer calendar and invitation arrives.</span>
        <span>Returned event ID is evidence, not delivery confirmation.</span>
      </CardFooter>
    </Card>
  );
}

const pillStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.pill, padding: '2px 8px', fontSize: typography.size.xs, color: palette.textMuted };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.xs, fontSize: typography.size.sm };
const inputStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: spacing.xs, background: palette.surface, color: palette.text };
const previewStyle: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', background: palette.surfaceSubtle, padding: spacing.sm, borderRadius: radius.sm, fontSize: typography.size.xs };
const checkStyle: React.CSSProperties = { display: 'flex', gap: spacing.xs, alignItems: 'center', fontSize: typography.size.sm };
const buttonStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, background: palette.primaryBg, color: palette.primaryFg, cursor: 'pointer' };
const mutedStyle: React.CSSProperties = { margin: 0, color: palette.textMuted, fontSize: typography.size.sm };

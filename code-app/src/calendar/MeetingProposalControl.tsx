import { useMemo, useRef, useState } from 'react';
import { palette, radius, spacing, typography } from '../shared/theme';
import { createDefaultMeetingProposal, type MeetingCreationOutcome } from './meetingProposalWorkflow';
import { getMeetingCreationAdapter } from './meetingCreationAdapter';
import { getMeetingWriteFeatureGates } from './meetingProposalFeatureFlags';

interface MeetingProposalControlProps {
  dealId: string;
  dealName: string;
  candidateStart: string;
  candidateEnd: string;
  timezone: string;
  requiredAttendees?: string[];
}

export function MeetingProposalControl({
  dealId,
  dealName,
  candidateStart,
  candidateEnd,
  timezone,
  requiredAttendees,
}: MeetingProposalControlProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [outcome, setOutcome] = useState<MeetingCreationOutcome | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const submittedCorrelationIds = useRef(new Set<string>());
  const gates = getMeetingWriteFeatureGates();
  const proposal = useMemo(
    () =>
      createDefaultMeetingProposal({
        dealId,
        dealName,
        start: candidateStart,
        end: candidateEnd,
        timezone,
        requiredAttendees,
        teamsMeetingRequested: gates.teamsMeetingCreationEnabled,
        correlationId: `meeting-${dealId}-${candidateStart}`,
      }),
    [candidateEnd, candidateStart, dealId, dealName, gates.teamsMeetingCreationEnabled, requiredAttendees, timezone],
  );

  async function confirmProposal() {
    if (submittedCorrelationIds.current.has(proposal.correlationId)) {
      setOutcome({
        kind: 'blocked',
        message: 'Duplicate meeting creation submission blocked for this correlation ID.',
        correlationId: proposal.correlationId,
      });
      return;
    }
    submittedCorrelationIds.current.add(proposal.correlationId);
    setSubmitting(true);
    try {
      setOutcome(await getMeetingCreationAdapter().create(proposal));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <button type="button" style={proposalButtonStyle} aria-label="Prepare meeting proposal" onClick={() => setPreviewOpen(true)}>
        Prepare meeting proposal
      </button>
      {previewOpen && (
        <section role="dialog" aria-label="Meeting proposal preview" style={modalStyle}>
          <h4 style={headingStyle}>Meeting proposal preview</h4>
          <dl style={dlStyle}>
            <dt>Subject</dt><dd>{proposal.subject}</dd>
            <dt>Purpose</dt><dd>{proposal.purpose}</dd>
            <dt>Start</dt><dd>{proposal.start}</dd>
            <dt>End</dt><dd>{proposal.end}</dd>
            <dt>Timezone</dt><dd>{proposal.timezone}</dd>
            <dt>Required attendees</dt><dd>{proposal.requiredAttendees.join('; ') || 'None returned'}</dd>
            <dt>Teams meeting requested</dt><dd>{proposal.teamsMeetingRequested ? 'Yes' : 'No'}</dd>
            <dt>Correlation ID</dt><dd>{proposal.correlationId}</dd>
          </dl>
          <pre style={previewStyle}>{proposal.bodyPreview}</pre>
          <button type="button" style={confirmButtonStyle} disabled={submitting} onClick={confirmProposal}>
            Confirm creation request
          </button>
          {outcome && (
            <p role="status" style={outcomeStyle}>
              {outcome.kind.toUpperCase()}: {outcome.message}
              {outcome.teamsJoinUrl ? ` Join URL returned.` : ''}
            </p>
          )}
          <p style={finePrintStyle}>No retry after an accepted or unknown outcome without reconciliation.</p>
        </section>
      )}
    </div>
  );
}

const wrapStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: spacing.sm };
const proposalButtonStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, background: palette.surfaceAlt, color: palette.text, cursor: 'pointer' };
const modalStyle: React.CSSProperties = { border: `1px solid ${palette.borderStrong}`, borderRadius: radius.md, padding: spacing.md, background: palette.surfaceSubtle, display: 'flex', flexDirection: 'column', gap: spacing.sm };
const headingStyle: React.CSSProperties = { margin: 0, fontSize: typography.size.md };
const dlStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: `${spacing.xs} ${spacing.sm}`, margin: 0, fontSize: typography.size.sm };
const previewStyle: React.CSSProperties = { whiteSpace: 'pre-wrap', margin: 0, fontSize: typography.size.xs, background: palette.surface, padding: spacing.sm, borderRadius: radius.sm };
const confirmButtonStyle: React.CSSProperties = { border: `1px solid ${palette.border}`, borderRadius: radius.sm, padding: `${spacing.xs} ${spacing.sm}`, background: palette.primaryBg, color: palette.primaryFg, cursor: 'pointer' };
const outcomeStyle: React.CSSProperties = { margin: 0, color: palette.text, fontSize: typography.size.sm };
const finePrintStyle: React.CSSProperties = { margin: 0, color: palette.textMuted, fontSize: typography.size.xs };

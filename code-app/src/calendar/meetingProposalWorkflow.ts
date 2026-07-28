export type MeetingCreationOutcomeKind =
  | 'disabled'
  | 'blocked'
  | 'accepted'
  | 'confirmed'
  | 'unknown'
  | 'failed'
  | 'audit_failed';

export interface MeetingProposal {
  dealId: string;
  subject: string;
  purpose: string;
  start: string;
  end: string;
  timezone: string;
  requiredAttendees: string[];
  optionalAttendees: string[];
  location?: string;
  bodyPreview: string;
  teamsMeetingRequested: boolean;
  source: string;
  policyVersion: string;
  correlationId: string;
}

export interface OutlookCalendarEventPayload {
  subject: string;
  start: string;
  end: string;
  timeZone: string;
  requiredAttendees: string;
  optionalAttendees: string;
  location?: string;
  body: string;
  isHtml: boolean;
  importance: 'normal';
  responseRequested: boolean;
  categories: string[];
}

export interface GovernedCalendarCreateRequest {
  calendarId: string;
  proposal: MeetingProposal;
  idempotencyKey: string;
  approvedInternalRecipients: string[];
  operatorConfirmed: boolean;
}

export interface MeetingCreationOutcome {
  kind: MeetingCreationOutcomeKind;
  message: string;
  eventId?: string;
  teamsJoinUrl?: string;
  auditEventId?: string;
  correlationId: string;
}

export interface MeetingProposalValidation {
  ok: boolean;
  errors: string[];
}

export function validateMeetingProposal(
  proposal: MeetingProposal,
  policy: { requireRequiredAttendee?: boolean } = { requireRequiredAttendee: true },
): MeetingProposalValidation {
  const errors: string[] = [];
  const start = new Date(proposal.start);
  const end = new Date(proposal.end);
  if (!proposal.dealId) errors.push('dealId is required.');
  if (!proposal.subject.trim()) errors.push('subject is required.');
  if (!proposal.purpose.trim()) errors.push('purpose is required.');
  if (Number.isNaN(start.getTime())) errors.push('start must be a valid date/time.');
  if (Number.isNaN(end.getTime())) errors.push('end must be a valid date/time.');
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start >= end) {
    errors.push('start must be before end.');
  }
  if (!proposal.timezone.trim()) errors.push('timezone is required.');
  if (policy.requireRequiredAttendee && proposal.requiredAttendees.length === 0) {
    errors.push('at least one required attendee is required.');
  }
  if (!proposal.policyVersion.trim()) errors.push('policyVersion is required.');
  if (!proposal.correlationId.trim()) errors.push('correlationId is required.');
  return { ok: errors.length === 0, errors };
}

export function createDefaultMeetingProposal(input: {
  dealId: string;
  dealName: string;
  start: string;
  end: string;
  timezone: string;
  requiredAttendees?: string[];
  teamsMeetingRequested?: boolean;
  correlationId: string;
}): MeetingProposal {
  return {
    dealId: input.dealId,
    subject: `Deal review: ${input.dealName}`,
    purpose: 'Review deal status, blockers, and next actions.',
    start: input.start,
    end: input.end,
    timezone: input.timezone,
    requiredAttendees: input.requiredAttendees ?? [],
    optionalAttendees: [],
    location: input.teamsMeetingRequested ? 'Online meeting requested' : undefined,
    bodyPreview: `Agenda:\n- Confirm deal status for ${input.dealName}\n- Review blockers\n- Confirm next action owner`,
    teamsMeetingRequested: input.teamsMeetingRequested ?? false,
    source: 'banker-calendar-availability-panel',
    policyVersion: 'm365-calendar-teams-2026-07-28',
    correlationId: input.correlationId,
  };
}

export function buildMeetingIdempotencyKey(proposal: MeetingProposal): string {
  return [
    proposal.dealId,
    proposal.start,
    proposal.end,
    proposal.requiredAttendees.join(',').toLowerCase(),
    proposal.optionalAttendees.join(',').toLowerCase(),
  ].join('|');
}

export function allRecipientsAreApprovedInternal(
  proposal: MeetingProposal,
  approvedInternalRecipients: string[],
): boolean {
  const approved = new Set(approvedInternalRecipients.map((recipient) => recipient.trim().toLowerCase()).filter(Boolean));
  return [...proposal.requiredAttendees, ...proposal.optionalAttendees]
    .every((recipient) => approved.has(recipient.trim().toLowerCase()) && recipient.toLowerCase().endsWith('@oldglorybank.com'));
}

export function buildOutlookCalendarEventPayload(proposal: MeetingProposal): OutlookCalendarEventPayload {
  return {
    subject: proposal.subject,
    start: new Date(proposal.start).toISOString(),
    end: new Date(proposal.end).toISOString(),
    timeZone: proposal.timezone,
    requiredAttendees: proposal.requiredAttendees.join(';'),
    optionalAttendees: proposal.optionalAttendees.join(';'),
    location: proposal.location,
    body: [
      proposal.bodyPreview,
      '',
      `LOS deal: ${proposal.dealId}`,
      `Correlation: ${proposal.correlationId}`,
      `Policy: ${proposal.policyVersion}`,
      proposal.teamsMeetingRequested ? 'Teams meeting requested: yes' : 'Teams meeting requested: no',
    ].join('\n'),
    isHtml: false,
    importance: 'normal',
    responseRequested: true,
    categories: ['Commercial LOS'],
  };
}

export function classifyMeetingCreationResponse(input: {
  accepted: boolean;
  confirmed: boolean;
  eventId?: string;
  teamsJoinUrl?: string;
  auditEventId?: string;
  teamsMeetingRequested?: boolean;
  correlationId: string;
}): MeetingCreationOutcome {
  if (input.confirmed && input.eventId) {
    return {
      kind: 'confirmed',
      message: input.teamsMeetingRequested && !input.teamsJoinUrl
        ? 'Calendar event confirmed; Teams join URL was not returned.'
        : 'Calendar event confirmed.',
      eventId: input.eventId,
      teamsJoinUrl: input.teamsJoinUrl,
      auditEventId: input.auditEventId,
      correlationId: input.correlationId,
    };
  }
  if (input.accepted) {
    return {
      kind: 'accepted',
      message: 'Connector accepted the calendar request. Confirmation requires returned event evidence.',
      eventId: input.eventId,
      teamsJoinUrl: input.teamsJoinUrl,
      auditEventId: input.auditEventId,
      correlationId: input.correlationId,
    };
  }
  return {
    kind: 'unknown',
    message: 'Calendar request outcome is unknown and requires reconciliation before retry.',
    correlationId: input.correlationId,
  };
}

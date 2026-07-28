import { getMeetingWriteFeatureGates, type MeetingWriteFeatureGates } from './meetingProposalFeatureFlags';
import {
  allRecipientsAreApprovedInternal,
  buildMeetingIdempotencyKey,
  buildOutlookCalendarEventPayload,
  validateMeetingProposal,
  type MeetingCreationOutcome,
  type GovernedCalendarCreateRequest,
  type MeetingProposal,
} from './meetingProposalWorkflow';

export interface MeetingCreationAdapter {
  create(proposal: MeetingProposal): Promise<MeetingCreationOutcome>;
}

export interface GovernedMeetingCreationAdapter extends MeetingCreationAdapter {
  createGoverned(request: GovernedCalendarCreateRequest): Promise<MeetingCreationOutcome>;
}

export function createDisabledMeetingCreationAdapter(
  gates: MeetingWriteFeatureGates = getMeetingWriteFeatureGates(),
): GovernedMeetingCreationAdapter {
  return {
    async create(proposal) {
      const validation = validateMeetingProposal(proposal);
      if (!validation.ok) {
        return {
          kind: 'blocked',
          message: validation.errors.join(' '),
          correlationId: proposal.correlationId,
        };
      }
      if (!gates.outlookCalendarWriteEnabled) {
        return {
          kind: 'disabled',
          message: 'Outlook calendar write is disabled by VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false.',
          correlationId: proposal.correlationId,
        };
      }
      if (proposal.teamsMeetingRequested && !gates.teamsMeetingCreationEnabled) {
        return {
          kind: 'disabled',
          message: 'Teams meeting creation is disabled by VITE_TEAMS_MEETING_CREATION_ENABLED=false.',
          correlationId: proposal.correlationId,
        };
      }
      return {
        kind: 'blocked',
        message:
          'No approved live meeting creation adapter is configured. Future implementation must use generated CalendarPostItem only through a governed adapter and audit before returning.',
        correlationId: proposal.correlationId,
      };
    },
    async createGoverned(request) {
      return this.create(request.proposal);
    },
  };
}

interface OutlookCalendarWriteOperations {
  V4CalendarPostItem(table: string, item: object): Promise<{ success?: boolean; data?: object & { id?: string; webLink?: string }; error?: { message?: string; code?: string } }>;
}

export function createGovernedOutlookMeetingCreationAdapter(input: {
  operationsProvider: () => Promise<OutlookCalendarWriteOperations>;
  gates?: MeetingWriteFeatureGates;
  audit?: (request: GovernedCalendarCreateRequest, outcome: MeetingCreationOutcome) => Promise<string | undefined>;
}): GovernedMeetingCreationAdapter {
  const gates = input.gates ?? getMeetingWriteFeatureGates();
  const submitted = new Set<string>();
  return {
    async create(proposal) {
      return {
        kind: 'blocked',
        message: 'Governed calendar creation requires calendar ID, approved recipients, and explicit operator confirmation.',
        correlationId: proposal.correlationId,
      };
    },
    async createGoverned(request) {
      const validation = validateMeetingProposal(request.proposal);
      if (!validation.ok) {
        return { kind: 'blocked', message: validation.errors.join(' '), correlationId: request.proposal.correlationId };
      }
      if (!gates.outlookCalendarWriteEnabled) {
        return {
          kind: 'disabled',
          message: 'Outlook calendar write is disabled by VITE_OUTLOOK_CALENDAR_WRITE_ENABLED=false.',
          correlationId: request.proposal.correlationId,
        };
      }
      if (request.proposal.teamsMeetingRequested && !gates.teamsMeetingCreationEnabled) {
        return {
          kind: 'disabled',
          message: 'Teams meeting creation is disabled by VITE_TEAMS_MEETING_CREATION_ENABLED=false.',
          correlationId: request.proposal.correlationId,
        };
      }
      if (!request.operatorConfirmed) {
        return { kind: 'blocked', message: 'Explicit operator confirmation is required.', correlationId: request.proposal.correlationId };
      }
      if (!request.calendarId.trim()) {
        return { kind: 'blocked', message: 'Calendar ID selection is required.', correlationId: request.proposal.correlationId };
      }
      if (!allRecipientsAreApprovedInternal(request.proposal, request.approvedInternalRecipients)) {
        return { kind: 'blocked', message: 'All attendees must be approved internal test recipients.', correlationId: request.proposal.correlationId };
      }
      const expectedKey = buildMeetingIdempotencyKey(request.proposal);
      if (request.idempotencyKey !== expectedKey || submitted.has(expectedKey)) {
        return { kind: 'blocked', message: 'Duplicate or mismatched calendar create idempotency key blocked.', correlationId: request.proposal.correlationId };
      }
      submitted.add(expectedKey);
      const payload = buildOutlookCalendarEventPayload(request.proposal);
      try {
        const operations = await input.operationsProvider();
        const result = await operations.V4CalendarPostItem(request.calendarId, {
          subject: payload.subject,
          start: payload.start,
          end: payload.end,
          timeZone: payload.timeZone,
          requiredAttendees: payload.requiredAttendees,
          optionalAttendees: payload.optionalAttendees,
          location: payload.location,
          body: payload.body,
          isHtml: payload.isHtml,
          importance: payload.importance,
          responseRequested: payload.responseRequested,
          categories: payload.categories,
        });
        const outcome: MeetingCreationOutcome = result.success === false
          ? { kind: 'failed', message: result.error?.message ?? 'Outlook calendar create failed.', correlationId: request.proposal.correlationId }
          : {
              kind: result.data?.id ? 'accepted' : 'unknown',
              message: result.data?.id
                ? 'Outlook connector accepted the event create request. Operator must confirm calendar appearance and invitation receipt.'
                : 'Outlook connector returned no event ID; reconcile before retry.',
              eventId: result.data?.id,
              teamsJoinUrl: typeof (result.data as Record<string, unknown> | undefined)?.onlineMeetingUrl === 'string'
                ? String((result.data as Record<string, unknown>).onlineMeetingUrl)
                : undefined,
              correlationId: request.proposal.correlationId,
            };
        const auditEventId = input.audit ? await input.audit(request, outcome) : undefined;
        return { ...outcome, auditEventId };
      } catch (error) {
        return {
          kind: 'unknown',
          message: error instanceof Error ? `Ambiguous calendar create outcome: ${error.message}` : 'Ambiguous calendar create outcome.',
          correlationId: request.proposal.correlationId,
        };
      }
    },
  };
}

export function createGeneratedOffice365OutlookMeetingCreationAdapter(
  gates: MeetingWriteFeatureGates = getMeetingWriteFeatureGates(),
): GovernedMeetingCreationAdapter {
  return createGovernedOutlookMeetingCreationAdapter({
    gates,
    operationsProvider: async () => {
      const { Office365OutlookService } = await import('../generated/services/Office365OutlookService');
      return Office365OutlookService;
    },
  });
}

let meetingCreationAdapter: GovernedMeetingCreationAdapter = createDisabledMeetingCreationAdapter();

export function getMeetingCreationAdapter(): GovernedMeetingCreationAdapter {
  return meetingCreationAdapter;
}

export function setMeetingCreationAdapterForTest(adapter: MeetingCreationAdapter | GovernedMeetingCreationAdapter) {
  meetingCreationAdapter = 'createGoverned' in adapter
    ? adapter
    : {
        ...adapter,
        async createGoverned(request) {
          return adapter.create(request.proposal);
        },
      };
}

export function resetMeetingCreationAdapterForTest() {
  meetingCreationAdapter = createDisabledMeetingCreationAdapter();
}

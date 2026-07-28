import { getMeetingWriteFeatureGates, type MeetingWriteFeatureGates } from './meetingProposalFeatureFlags';
import {
  validateMeetingProposal,
  type MeetingCreationOutcome,
  type MeetingProposal,
} from './meetingProposalWorkflow';

export interface MeetingCreationAdapter {
  create(proposal: MeetingProposal): Promise<MeetingCreationOutcome>;
}

export function createDisabledMeetingCreationAdapter(
  gates: MeetingWriteFeatureGates = getMeetingWriteFeatureGates(),
): MeetingCreationAdapter {
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
  };
}

let meetingCreationAdapter: MeetingCreationAdapter = createDisabledMeetingCreationAdapter();

export function getMeetingCreationAdapter(): MeetingCreationAdapter {
  return meetingCreationAdapter;
}

export function setMeetingCreationAdapterForTest(adapter: MeetingCreationAdapter) {
  meetingCreationAdapter = adapter;
}

export function resetMeetingCreationAdapterForTest() {
  meetingCreationAdapter = createDisabledMeetingCreationAdapter();
}

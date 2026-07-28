import type { MeetingCreationOutcome, MeetingProposal } from './meetingProposalWorkflow';
import { getM365ActivationConfig } from '../microsoft365/m365ActivationConfig';

export type TeamsMeetingBoundaryDecision =
  | 'generated_connector_join_url_available'
  | 'server_side_boundary_required';

export interface TeamsMeetingBoundaryAssessment {
  decision: TeamsMeetingBoundaryDecision;
  reason: string;
  supportedOperation: string | undefined;
  joinUrlField: string | undefined;
}

export interface TeamsMeetingBoundaryRequest {
  proposal: MeetingProposal;
  eventId?: string;
  idempotencyKey: string;
  operatorConfirmed: boolean;
}

export interface TeamsMeetingBoundaryAdapter {
  create(request: TeamsMeetingBoundaryRequest): Promise<MeetingCreationOutcome>;
}

export function assessGeneratedTeamsMeetingCapability(generatedModelText: string): TeamsMeetingBoundaryAssessment {
  const hasPost = /V4CalendarPostItem|CalendarPostItem/.test(generatedModelText);
  const joinField = generatedModelText.match(/\b(onlineMeetingUrl|joinUrl|joinWebUrl|teamsJoinUrl)\b/i)?.[1];
  if (hasPost && joinField) {
    return {
      decision: 'generated_connector_join_url_available',
      reason: `Generated Outlook calendar model exposes ${joinField}.`,
      supportedOperation: 'V4CalendarPostItem',
      joinUrlField: joinField,
    };
  }
  return {
    decision: 'server_side_boundary_required',
    reason: 'Generated Outlook calendar operations do not expose a reliable Teams join URL field.',
    supportedOperation: hasPost ? 'V4CalendarPostItem' : undefined,
    joinUrlField: undefined,
  };
}

export function validateTeamsJoinUrl(value: string | undefined): boolean {
  return typeof value === 'string'
    && /^https:\/\/teams\.microsoft\.com\/l\/meetup-join\//i.test(value);
}

export function createDisabledTeamsMeetingBoundaryAdapter(): TeamsMeetingBoundaryAdapter {
  return {
    async create(request) {
      const config = getM365ActivationConfig();
      if (!config.teamsMeetingCreationEnabled) {
        return {
          kind: 'disabled',
          message: 'Teams meeting creation is disabled by VITE_TEAMS_MEETING_CREATION_ENABLED=false.',
          correlationId: request.proposal.correlationId,
        };
      }
      return {
        kind: 'blocked',
        message: `Teams meeting creation requires provisioned server-side boundary alias ${config.teamsMeetingTransportAlias}.`,
        correlationId: request.proposal.correlationId,
      };
    },
  };
}

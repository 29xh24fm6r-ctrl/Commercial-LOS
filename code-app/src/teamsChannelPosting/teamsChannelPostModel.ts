export type TeamsChannelPostOutcomeKind =
  | 'NOT_CONFIGURED'
  | 'WRITE_DISABLED'
  | 'LIVE_ACCEPTED'
  | 'LIVE_CONFIRMED'
  | 'BLOCKED'
  | 'UNKNOWN';

export interface TeamsChannelTargetAlias {
  alias: string;
  displayName: string;
  active: boolean;
  environment: string;
  policyVersion: string;
}

export interface TeamsChannelPostProposal {
  dealId: string;
  dealName: string;
  stage?: string;
  assignedBanker?: string;
  blockers: string[];
  nextAction?: string;
  losDeepLink?: string;
  targetAlias: string;
  safePreview: string;
  contentHash: string;
  correlationId: string;
  idempotencyKey: string;
  policyVersion: string;
}

export interface TeamsChannelPostOutcome {
  kind: TeamsChannelPostOutcomeKind;
  message: string;
  returnedMessageId?: string;
  auditEventId?: string;
  correlationId: string;
}

export interface TeamsChannelPostAuditEvent {
  actor?: string;
  dealId: string;
  targetAlias: string;
  contentHash: string;
  safePreview: string;
  transportOutcome: TeamsChannelPostOutcomeKind;
  returnedMessageId?: string;
  correlationId: string;
  timestamp: string;
}

export interface TeamsChannelPostTransportRequest extends TeamsChannelPostProposal {
  operatorConfirmed: boolean;
  actor?: string;
}

import { isTeamsChannelPostEnabled } from './teamsChannelPostFeatureFlags';
import type { TeamsChannelPostOutcome, TeamsChannelPostProposal, TeamsChannelPostTransportRequest } from './teamsChannelPostModel';

export interface TeamsChannelPostAdapter {
  post(proposal: TeamsChannelPostProposal): Promise<TeamsChannelPostOutcome>;
}

export interface TeamsChannelPostTransport {
  send(request: TeamsChannelPostTransportRequest): Promise<TeamsChannelPostOutcome>;
}

export const APPROVED_TEAMS_CHANNEL_TARGETS = [
  {
    alias: 'credit-ops-test-channel',
    displayName: 'Credit Ops Test Channel',
    active: false,
    environment: 'test',
    policyVersion: 'teams-channel-post-2026-07-28',
  },
] as const;

export function getApprovedTeamsChannelTargets() {
  return APPROVED_TEAMS_CHANNEL_TARGETS;
}

export function createDisabledTeamsChannelPostAdapter(): TeamsChannelPostAdapter {
  return {
    async post(proposal) {
      if (!isTeamsChannelPostEnabled()) {
        return {
          kind: 'WRITE_DISABLED',
          message: 'Teams channel posting is disabled by VITE_TEAMS_CHANNEL_POST_ENABLED=false.',
          correlationId: proposal.correlationId,
        };
      }
      return {
        kind: 'NOT_CONFIGURED',
        message: 'No approved server-side Teams channel posting boundary is configured.',
        correlationId: proposal.correlationId,
      };
    },
  };
}

export function createGovernedTeamsChannelPostAdapter(input: {
  transport: TeamsChannelPostTransport;
  actor?: string;
}): TeamsChannelPostAdapter {
  const submitted = new Set<string>();
  return {
    async post(proposal) {
      if (!isTeamsChannelPostEnabled()) {
        return {
          kind: 'WRITE_DISABLED',
          message: 'Teams channel posting is disabled by VITE_TEAMS_CHANNEL_POST_ENABLED=false.',
          correlationId: proposal.correlationId,
        };
      }
      const target = APPROVED_TEAMS_CHANNEL_TARGETS.find((candidate) => candidate.alias === proposal.targetAlias);
      if (!target || !target.active) {
        return {
          kind: 'BLOCKED',
          message: 'Target alias is not active in the approved Teams channel registry.',
          correlationId: proposal.correlationId,
        };
      }
      if (submitted.has(proposal.idempotencyKey)) {
        return {
          kind: 'BLOCKED',
          message: 'Duplicate Teams channel post idempotency key blocked.',
          correlationId: proposal.correlationId,
        };
      }
      submitted.add(proposal.idempotencyKey);
      return input.transport.send({
        ...proposal,
        actor: input.actor,
        operatorConfirmed: true,
      });
    },
  };
}

let adapter: TeamsChannelPostAdapter = createDisabledTeamsChannelPostAdapter();

export function getTeamsChannelPostAdapter(): TeamsChannelPostAdapter {
  return adapter;
}

export function setTeamsChannelPostAdapterForTest(next: TeamsChannelPostAdapter) {
  adapter = next;
}

export function resetTeamsChannelPostAdapterForTest() {
  adapter = createDisabledTeamsChannelPostAdapter();
}

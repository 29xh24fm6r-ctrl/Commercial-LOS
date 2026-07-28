import { isTeamsChannelPostEnabled } from './teamsChannelPostFeatureFlags';
import type { TeamsChannelPostOutcome, TeamsChannelPostProposal } from './teamsChannelPostModel';

export interface TeamsChannelPostAdapter {
  post(proposal: TeamsChannelPostProposal): Promise<TeamsChannelPostOutcome>;
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

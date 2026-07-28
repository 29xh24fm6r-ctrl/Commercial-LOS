import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('M365-5 Teams channel posting governance', () => {
  it('ships contract and security model', () => {
    const contract = JSON.parse(read('microsoft365/teams/channel-post-contract.json'));
    expect(contract.runtimeState).toBe('NOT_CONFIGURED');
    expect(contract.featureGate).toBe('VITE_TEAMS_CHANNEL_POST_ENABLED=false');
    expect(contract.approvedBoundary.browserDirectGraphAllowed).toBe(false);
    expect(contract.approvedTargets[0].alias).toBe('credit-ops-test-channel');
    expect(read('docs/governance/TEAMS_CHANNEL_POSTING_SECURITY_MODEL.md')).toMatch(/server-side boundary/i);
  });

  it('BankerDealWorkspace mounts the disabled Teams channel post panel', () => {
    const src = read('src/deals/BankerDealWorkspace.tsx');
    expect(src).toMatch(/TeamsChannelPostPanel/);
    expect(src).toMatch(/data-deal-card="teams-channel-post"/);
  });

  it('Teams channel posting source has no direct browser/server transport', () => {
    for (const rel of [
      'src/teamsChannelPosting/teamsChannelPostFeatureFlags.ts',
      'src/teamsChannelPosting/teamsChannelContentPolicy.ts',
      'src/teamsChannelPosting/teamsChannelPostAdapter.ts',
      'src/teamsChannelPosting/TeamsChannelPostPanel.tsx',
    ]) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(/fetch\s*\(/);
      expect(src, rel).not.toMatch(/XMLHttpRequest/);
      expect(src, rel).not.toMatch(/graph\.microsoft|microsoft-graph/i);
      expect(src, rel).not.toMatch(/webhook/i);
      expect(src, rel).not.toMatch(/rawTeamId|rawChannelId/);
    }
  });

  it('Copilot may not post or confirm Teams channel posts', () => {
    const copilot = [
      'src/copilot/copilotConnector.ts',
      'src/copilot/copilotProposalEngine.ts',
      'src/copilot/CopilotAssistPanel.tsx',
    ].map(read).join('\n');
    expect(stripComments(copilot)).not.toMatch(/TeamsChannelPostPanel|Confirm server-side post request|VITE_TEAMS_CHANNEL_POST_ENABLED/);
  });
});

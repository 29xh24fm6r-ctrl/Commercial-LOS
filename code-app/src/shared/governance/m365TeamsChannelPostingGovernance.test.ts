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

  it('ships deployable Dataverse custom API transport contract and inactive target registry', () => {
    const customApi = JSON.parse(read('microsoft365/teams/dataverse-custom-api-teams-channel-post.json'));
    const registry = JSON.parse(read('microsoft365/teams/channel-post-target-registry.json'));
    expect(customApi.name).toBe('cr664_TeamsChannelPost');
    expect(customApi.allowedCaller).toMatch(/server-side/i);
    expect(Object.keys(customApi.request)).toEqual(expect.arrayContaining([
      'dealId',
      'targetAlias',
      'safePreview',
      'contentHash',
      'correlationId',
      'idempotencyKey',
      'operatorConfirmed',
    ]));
    expect(registry.targets[0].alias).toBe('credit-ops-test-channel');
    expect(registry.targets[0].active).toBe(false);
  });

  it('ships read-only verifier for the channel posting transport package', () => {
    const verifier = read('scripts/activation/verify-teams-channel-posting-transport.ps1');
    expect(verifier).toMatch(/STATUS=PASS/);
    expect(verifier).toMatch(/STATUS=BLOCKED/);
    expect(verifier).toMatch(/verify-teams-channel-posting-boundary\.ps1/);
    const executableLines = verifier
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('#'))
      .filter((line) => /^\s*(Invoke-RestMethod|Invoke-WebRequest)\b/i.test(line));
    expect(executableLines).toEqual([]);
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

  it('source builds idempotent requests without activating a target by default', () => {
    const policy = read('src/teamsChannelPosting/teamsChannelContentPolicy.ts');
    const adapter = read('src/teamsChannelPosting/teamsChannelPostAdapter.ts');
    const panel = read('src/teamsChannelPosting/TeamsChannelPostPanel.tsx');
    expect(policy).toMatch(/buildTeamsChannelPostIdempotencyKey/);
    expect(policy).toMatch(/idempotencyKey/);
    expect(adapter).toMatch(/operatorConfirmed: true/);
    expect(adapter).toMatch(/active: false/);
    expect(panel).toMatch(/Idempotency key/);
  });

  it('documents that activation is operator-controlled and no post is sent by this repo lane', () => {
    const doc = read('docs/governance/M365_A6_TEAMS_CHANNEL_POSTING_TRANSPORT_2026-07-28.md');
    expect(doc).toMatch(/operator/i);
    expect(doc).toMatch(/Dataverse custom API/i);
    expect(doc).toMatch(/no Teams channel post is sent/i);
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

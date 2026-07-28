import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const COPILOT_STUDIO_CONTRACT = 'microsoft365/copilot-studio/agent-contract.json';
const COPILOT_RUNBOOK = 'docs/MICROSOFT_COPILOT_FULL_INTEGRATION_RUNBOOK.md';
const COPILOT_VERIFIER = 'scripts/activation/verify-copilot-integration.ps1';

describe('Microsoft Copilot full integration package', () => {
  it('ships a Copilot Studio agent contract, runbook, and verifier', () => {
    expect(existsSync(resolve(REPO_ROOT, COPILOT_STUDIO_CONTRACT))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, COPILOT_RUNBOOK))).toBe(true);
    expect(existsSync(resolve(REPO_ROOT, COPILOT_VERIFIER))).toBe(true);
  });

  it('maps every primary LOS surface to the governed Copilot mount', () => {
    const contract = JSON.parse(read(COPILOT_STUDIO_CONTRACT)) as {
      supportedSurfaces: Array<{
        workspace: string;
        surface: string;
        source: string;
        copilotMount: string;
      }>;
    };
    const byWorkspace = new Map(
      contract.supportedSurfaces.map((surface) => [surface.workspace, surface]),
    );

    expect([...byWorkspace.keys()].sort()).toEqual([
      'banker',
      'executive',
      'manager',
      'portfolio',
      'team',
    ]);

    expect(byWorkspace.get('banker')).toMatchObject({
      surface: 'deal',
      source: 'src/deals/BankerDealWorkspace.tsx',
      copilotMount: 'src/copilot/DealCopilotAssist.tsx',
    });
    for (const workspace of ['manager', 'portfolio', 'team', 'executive']) {
      expect(byWorkspace.get(workspace)).toMatchObject({
        surface: 'workspace',
        copilotMount: 'src/copilot/CopilotAssistPanel.tsx',
      });
    }
  });

  it('pins the Dataverse Custom API, audit table, and proposal-only policy', () => {
    const contract = JSON.parse(read(COPILOT_STUDIO_CONTRACT)) as {
      customApi: { name: string; auditTable: string };
      policy: {
        allowBrowserDirectModelCalls: boolean;
        allowClientSecrets: boolean;
        allowAutonomousWrites: boolean;
        requireHumanConfirmation: boolean;
        allowedProposalActionTypes: string[];
      };
      modes: { default: string; allowedLiveModes: string[] };
    };

    expect(contract.customApi.name).toBe('cr664_RunLosCopilotAssist');
    expect(contract.customApi.auditTable).toBe('cr664_copilotauditevent');
    expect(contract.modes.default).toBe('not_configured');
    expect(contract.modes.allowedLiveModes).toEqual([
      'live_read_only',
      'proposal_only',
    ]);
    expect(contract.policy.allowBrowserDirectModelCalls).toBe(false);
    expect(contract.policy.allowClientSecrets).toBe(false);
    expect(contract.policy.allowAutonomousWrites).toBe(false);
    expect(contract.policy.requireHumanConfirmation).toBe(true);
    expect(contract.policy.allowedProposalActionTypes).toContain('explain_only');
    expect(contract.policy.allowedProposalActionTypes).toContain('draft_borrower_message');
  });

  it('the runbook points operators to Microsoft Copilot Studio and code-app integration docs', () => {
    const runbook = read(COPILOT_RUNBOOK);
    expect(runbook).toMatch(/Microsoft Copilot Studio/i);
    expect(runbook).toMatch(/connect-to-copilot-studio/);
    expect(runbook).toMatch(/add-tools-custom-agent/);
    expect(runbook).toMatch(/advanced-connectors/);
    expect(runbook).toMatch(/knowledge-copilot-studio/);
    expect(runbook).toMatch(/VITE_COPILOT_MODE=live_read_only/);
    expect(runbook).toMatch(/VITE_COPILOT_ENDPOINT_ALIAS=dataverse-custom-api/);
  });

  it('the verifier is read-only and checks every surface plus unsafe client drift', () => {
    const verifier = read(COPILOT_VERIFIER);
    const verifierBody = stripComments(verifier);
    expect(verifier).toMatch(/Read-only:/);
    for (const marker of [
      'Banker deal workspace',
      'Manager command center',
      'Portfolio command center',
      'Team ops queue',
      'Executive command center',
      'No src/copilot browser-direct',
      'STATUS: PASS',
    ]) {
      expect(verifier).toContain(marker);
    }
    expect(verifierBody).not.toMatch(/\bpac code push\b/i);
    expect(verifierBody).not.toMatch(/\bInvoke-RestMethod\b/i);
    expect(verifierBody).not.toMatch(/\bInvoke-WebRequest\b/i);
  });

  it('src/copilot still has no browser-direct model, Graph, Outlook, or Teams transport', () => {
    const copilotFiles = [
      'src/copilot/CopilotAssistPanel.tsx',
      'src/copilot/DealCopilotAssist.tsx',
      'src/copilot/copilotConnector.ts',
      'src/copilot/copilotConnectorConfig.ts',
      'src/copilot/copilotCustomApiAdapter.ts',
      'src/copilot/copilotDataverseCustomApiTransport.ts',
      'src/copilot/copilotAuditLogger.ts',
      'src/copilot/copilotServerHandler.ts',
    ];

    for (const rel of copilotFiles) {
      const source = stripComments(read(rel));
      expect(source, rel).not.toMatch(/fetch\s*\(/);
      expect(source, rel).not.toMatch(/XMLHttpRequest/);
      expect(source, rel).not.toMatch(/graph\.microsoft|microsoft-graph/i);
      expect(source, rel).not.toMatch(/\bmsal\b/i);
      expect(source, rel).not.toMatch(/Office365|SendEmailV2/);
      expect(source, rel).not.toMatch(/sk-[A-Za-z0-9]|AZURE_OPENAI_API_KEY|OPENAI_API_KEY/);
    }
  });
});

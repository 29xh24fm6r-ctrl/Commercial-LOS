import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveCopilotConnectorStatus,
  createCopilotConnector,
  createMockConnector,
  createNotConfiguredConnector,
} from '../../copilot/copilotConnector';
import {
  proposeDealActions,
  proposeWorkspaceActions,
  ALLOWED_PROPOSAL_ACTION_TYPES,
} from '../../copilot/copilotProposalEngine';
import type {
  CopilotDealAssistContext,
  CopilotWorkspaceAssistContext,
} from '../../copilot/copilotAssistContext';

/**
 * SPEC-COPILOT-LIVE-CONNECTOR-AND-SAFE-ACTION-ADAPTERS-1 — governance pins.
 *
 * §1 no client-side secrets in Copilot code
 * §2 no fetch / live connector call (default not_configured makes none)
 * §3 no write route / send / Dataverse patch reachable from Copilot
 * §4 every proposed action requires confirmation; only allowed types
 * §5 disabled / not_configured render safely (no throw, no proposals)
 * §6 missing env → not_configured; mock isLive only when configured
 * §7 deal context reads BIE committee summary but never mutates it
 */

const REPO_SRC = resolve(__dirname, '..', '..');
function readSrc(rel: string): string {
  return readFileSync(resolve(REPO_SRC, rel), 'utf8');
}

const COPILOT_FILES = [
  'copilot/copilotAssistantAdapter.ts',
  'copilot/copilotConnector.ts',
  'copilot/copilotProposalEngine.ts',
  'copilot/copilotAssistContext.ts',
  'copilot/dealCopilotContext.ts',
  'copilot/workspaceCopilotContext.ts',
  'copilot/CopilotAssistPanel.tsx',
  'copilot/DealCopilotAssist.tsx',
  'copilot/CopilotPromptBar.tsx',
  'copilot/CopilotResponseCard.tsx',
  'copilot/CopilotNotConfiguredState.tsx',
];

const DEAL_CTX: CopilotDealAssistContext = {
  deal: {
    dealName: 'D',
    clientName: 'C',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1,
    taskCount: 1,
    openTaskCount: 1,
    documentCount: 1,
    outstandingDocumentCount: 1,
    blockerCount: 0,
    blockerSummaries: [],
  },
  riskFlags: [],
  readinessBlockers: [],
  bie: {
    preliminaryEligible: true,
    committeeEligible: false,
    evidenceTaskCount: 1,
    evidenceTasks: [
      { category: 'sos_registry', label: 'SOS / business registry', status: 'missing', committeeGrade: false },
    ],
    committeeBlockerCategories: ['Business registry'],
  },
};

const WORKSPACE_CTX: CopilotWorkspaceAssistContext = {
  workspace: {
    workspaceRole: 'team',
    userName: undefined,
    teamName: 'East',
    dealCount: 3,
    urgentItemCount: 1,
    kpiSummaries: [],
  },
  topBlockers: ['Doc bottleneck'],
};

// ---------------------------------------------------------------------------
// §1 — no client-side secrets
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §1 — no client-side secrets', () => {
  for (const f of COPILOT_FILES) {
    it(`${f} references no secret material`, () => {
      const src = readSrc(f);
      expect(src).not.toMatch(/AZURE_OPENAI_API_KEY/);
      expect(src).not.toMatch(/\bapi[_-]?key\b/i);
      expect(src).not.toMatch(/\bclient[_-]?secret\b/i);
      expect(src).not.toMatch(/\bprocess\.env\b/);
      // Only the non-secret VITE_COPILOT_* flags may be read client-side.
      expect(src).not.toMatch(/import\.meta\.env\.VITE_AZURE/);
    });
  }
});

// ---------------------------------------------------------------------------
// §2 / §3 — no network call, no write/send/patch reachable from Copilot
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §2/§3 — no network, no write/send/patch', () => {
  for (const f of COPILOT_FILES) {
    it(`${f} makes no network call and no Dataverse/connector write`, () => {
      const src = readSrc(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1');
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/XMLHttpRequest/);
      expect(src).not.toMatch(/\baxios\b/);
      expect(src).not.toMatch(/SendEmailV2/);
      expect(src).not.toMatch(/Office365/);
      expect(src).not.toMatch(/microsoft-graph|graph\.microsoft/i);
      expect(src).not.toMatch(/\.create\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.patch\(/);
      expect(src).not.toMatch(/\.delete\(/);
    });
  }

  it('CopilotAssistPanel imports no generated service / email / write surface', () => {
    const src = readSrc('copilot/CopilotAssistPanel.tsx');
    expect(src).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(src).not.toMatch(/Modal['"]/);
    expect(src).not.toMatch(/sendDocumentRequestEmail|sendBorrowerUpdateEmail/);
  });
});

// ---------------------------------------------------------------------------
// §4 — proposals: allowed types only, all require confirmation
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §4 — proposals are safe', () => {
  const allowed = new Set<string>(ALLOWED_PROPOSAL_ACTION_TYPES);

  for (const mode of ['live_read_only', 'proposal_only'] as const) {
    it(`[${mode}] deal + workspace proposals: allowed types, all confirmation-required`, () => {
      const all = [
        ...proposeDealActions(DEAL_CTX, mode),
        ...proposeWorkspaceActions(WORKSPACE_CTX, mode),
      ];
      expect(all.length).toBeGreaterThan(0);
      for (const p of all) {
        expect(allowed.has(p.action_type)).toBe(true);
        expect(p.requires_confirmation).toBe(true);
      }
    });
  }

  it('connector responses never expose an unconfirmed proposal', () => {
    const r = createMockConnector('proposal_only').assistDeal(DEAL_CTX);
    expect(r.proposed_actions.every((p) => p.requires_confirmation === true)).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// §5 — disabled / not_configured render safely
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §5 — degraded modes are safe', () => {
  it('not_configured connector returns a response with no proposals and never throws', () => {
    const c = createNotConfiguredConnector();
    let r;
    expect(() => {
      r = c.assistDeal(DEAL_CTX);
    }).not.toThrow();
    expect(r!.proposed_actions).toHaveLength(0);
    expect(r!.isLive).toBe(false);
  });

  it('disabled connector returns a response with no proposals and never throws', () => {
    const c = createCopilotConnector(
      resolveCopilotConnectorStatus({ mode: 'disabled' }),
    );
    let r;
    expect(() => {
      r = c.assistWorkspace(WORKSPACE_CTX);
    }).not.toThrow();
    expect(r!.proposed_actions).toHaveLength(0);
    expect(r!.isLive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §6 — env defaults + mock isLive gating
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §6 — env defaults', () => {
  it('missing env → not_configured', () => {
    expect(resolveCopilotConnectorStatus({}).mode).toBe('not_configured');
  });

  it('mock isLive=true only when a live mode is configured', () => {
    expect(createMockConnector('live_read_only').assistDeal(DEAL_CTX).isLive).toBe(
      true,
    );
    expect(createNotConfiguredConnector().assistDeal(DEAL_CTX).isLive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §7 — BIE committee summary is read-only
// ---------------------------------------------------------------------------

describe('SPEC-COPILOT §7 — BIE context is read, never mutated', () => {
  it('summary includes the committee task summary derived from BIE', () => {
    const r = createMockConnector('proposal_only').assistDeal(DEAL_CTX);
    expect(r.summary).toMatch(/committee evidence task/i);
    expect(r.summary).toMatch(/Committee eligibility remains blocked/i);
  });

  it('does not mutate the passed BIE context', () => {
    const before = JSON.stringify(DEAL_CTX.bie);
    createMockConnector('proposal_only').assistDeal(DEAL_CTX);
    expect(JSON.stringify(DEAL_CTX.bie)).toBe(before);
  });
});

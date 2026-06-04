import { describe, it, expect } from 'vitest';
import {
  resolveCopilotConnectorStatus,
  createCopilotConnector,
  createNotConfiguredConnector,
  createMockConnector,
  type CopilotLiveTransport,
} from './copilotConnector';
import type {
  CopilotDealAssistContext,
  CopilotWorkspaceAssistContext,
} from './copilotAssistContext';

/**
 * SPEC-COPILOT-LIVE-CONNECTOR — connector status resolution + behavior.
 */

const DEAL_CTX: CopilotDealAssistContext = {
  deal: {
    dealName: 'Test Deal',
    clientName: 'Test Client',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1_000_000,
    taskCount: 4,
    openTaskCount: 2,
    documentCount: 6,
    outstandingDocumentCount: 1,
    blockerCount: 1,
    blockerSummaries: ['Missing appraisal'],
  },
  riskFlags: ['Missing appraisal'],
  readinessBlockers: ['Missing appraisal'],
  nextBestAction: 'Follow up on outstanding documents',
};

const WORKSPACE_CTX: CopilotWorkspaceAssistContext = {
  workspace: {
    workspaceRole: 'manager',
    userName: undefined,
    teamName: 'East',
    dealCount: 12,
    urgentItemCount: 3,
    kpiSummaries: ['Active deals: 12'],
  },
  topBlockers: ['Deal A blocked', 'Deal B at risk'],
};

describe('SPEC-COPILOT — resolveCopilotConnectorStatus', () => {
  it('missing env → not_configured', () => {
    const s = resolveCopilotConnectorStatus({});
    expect(s.mode).toBe('not_configured');
    expect(s.connected).toBe(false);
    expect(s.reason).toMatch(/not set/i);
  });

  it('explicit not_configured → not_configured', () => {
    expect(resolveCopilotConnectorStatus({ mode: 'not_configured' }).mode).toBe(
      'not_configured',
    );
  });

  it('disabled → disabled, not connected', () => {
    const s = resolveCopilotConnectorStatus({ mode: 'disabled' });
    expect(s.mode).toBe('disabled');
    expect(s.connected).toBe(false);
  });

  it('unrecognized mode → not_configured with reason', () => {
    const s = resolveCopilotConnectorStatus({ mode: 'turbo' });
    expect(s.mode).toBe('not_configured');
    expect(s.reason).toMatch(/unrecognized/i);
  });

  it('live_read_only + mock → connected live_read_only', () => {
    const s = resolveCopilotConnectorStatus({
      mode: 'live_read_only',
      provider: 'mock',
    });
    expect(s.mode).toBe('live_read_only');
    expect(s.connected).toBe(true);
    expect(s.provider).toBe('mock');
  });

  it('proposal_only + mock → connected proposal_only', () => {
    const s = resolveCopilotConnectorStatus({
      mode: 'proposal_only',
      provider: 'mock',
    });
    expect(s.mode).toBe('proposal_only');
    expect(s.connected).toBe(true);
  });

  it('azure_openai WITHOUT a transport → disabled (server-only live calls required)', () => {
    const s = resolveCopilotConnectorStatus({
      mode: 'live_read_only',
      provider: 'azure_openai',
    });
    expect(s.mode).toBe('disabled');
    expect(s.connected).toBe(false);
    expect(s.reason).toMatch(/transport is not wired/i);
  });

  it('azure_openai WITH an injected transport → connected', () => {
    const transport: CopilotLiveTransport = {
      providerLabel: 'Azure OpenAI',
      model: 'gpt-4o-mini',
    };
    const s = resolveCopilotConnectorStatus(
      { mode: 'proposal_only', provider: 'azure_openai' },
      { transport },
    );
    expect(s.connected).toBe(true);
    expect(s.model).toBe('gpt-4o-mini');
  });

  it('copilot_studio without transport → disabled', () => {
    const s = resolveCopilotConnectorStatus({
      mode: 'live_read_only',
      provider: 'copilot_studio',
    });
    expect(s.mode).toBe('disabled');
  });

  it('live mode + default provider → not_configured with reason', () => {
    const s = resolveCopilotConnectorStatus({ mode: 'live_read_only' });
    expect(s.mode).toBe('not_configured');
    expect(s.reason).toMatch(/no copilot provider/i);
  });

  it('never throws on garbage input', () => {
    expect(() =>
      resolveCopilotConnectorStatus({ mode: 123 as unknown as string }),
    ).not.toThrow();
  });
});

describe('SPEC-COPILOT — connector behavior', () => {
  it('not_configured connector: isLive=false, no proposals, honest summary', () => {
    const c = createNotConfiguredConnector();
    const r = c.assistDeal(DEAL_CTX);
    expect(r.isLive).toBe(false);
    expect(r.proposed_actions).toHaveLength(0);
    expect(r.limitations.join(' ')).toMatch(/not configured/i);
  });

  it('mock live_read_only: isLive=true, grounded summary, proposals render, no drafts', () => {
    const c = createMockConnector('live_read_only');
    const r = c.assistDeal(DEAL_CTX);
    expect(r.isLive).toBe(true);
    expect(r.mode).toBe('live_read_only');
    expect(r.summary).toMatch(/Test Deal/);
    expect(r.proposed_actions.length).toBeGreaterThan(0);
    // live_read_only excludes draft_* proposals.
    expect(
      r.proposed_actions.some((a) => a.action_type.startsWith('draft_')),
    ).toBe(false);
  });

  it('mock proposal_only: includes draft_* proposals; all require confirmation', () => {
    const c = createMockConnector('proposal_only');
    const r = c.assistDeal(DEAL_CTX);
    expect(r.isLive).toBe(true);
    expect(
      r.proposed_actions.some((a) => a.action_type === 'draft_note'),
    ).toBe(true);
    expect(r.proposed_actions.every((a) => a.requires_confirmation === true)).toBe(
      true,
    );
  });

  it('disabled connector: isLive=false, no proposals, states disabled', () => {
    const c = createCopilotConnector(
      resolveCopilotConnectorStatus({ mode: 'disabled' }),
    );
    const r = c.assistDeal(DEAL_CTX);
    expect(r.isLive).toBe(false);
    expect(r.proposed_actions).toHaveLength(0);
    expect(r.summary).toMatch(/disabled/i);
  });

  it('workspace assist returns grounded summary + proposals in mock proposal_only', () => {
    const c = createMockConnector('proposal_only');
    const r = c.assistWorkspace(WORKSPACE_CTX);
    expect(r.isLive).toBe(true);
    expect(r.summary).toMatch(/manager/);
    expect(r.proposed_actions.length).toBeGreaterThan(0);
    expect(r.proposed_actions.every((a) => a.requires_confirmation === true)).toBe(
      true,
    );
  });

  it('isLive is true ONLY when the mock is configured (default singleton stays not_configured)', () => {
    // The env-resolved default has no VITE_COPILOT_MODE in tests.
    const def = createNotConfiguredConnector();
    expect(def.status().mode).toBe('not_configured');
    expect(def.assistDeal(DEAL_CTX).isLive).toBe(false);
  });
});

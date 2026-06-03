import { describe, it, expect } from 'vitest';
import {
  createNotConfiguredAdapter,
  type CopilotDealContext,
  type CopilotWorkspaceContext,
} from './copilotAssistantAdapter';

const DEAL_CTX: CopilotDealContext = {
  dealName: 'Acme Working Capital',
  clientName: 'Acme Inc.',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4500000,
  taskCount: 8,
  openTaskCount: 3,
  documentCount: 12,
  outstandingDocumentCount: 4,
  blockerCount: 2,
  blockerSummaries: ['Missing appraisal', 'Insurance expired'],
};

const WORKSPACE_CTX: CopilotWorkspaceContext = {
  workspaceRole: 'banker',
  userName: 'M. Paller',
  teamName: 'Commercial Lending East',
  dealCount: 15,
  urgentItemCount: 4,
  kpiSummaries: ['Pipeline: $45M', 'At-risk: 3 deals'],
};

describe('Phase 129A — copilotAssistantAdapter not_configured', () => {
  const adapter = createNotConfiguredAdapter();

  it('adapter mode is not_configured', () => {
    expect(adapter.mode).toBe('not_configured');
  });

  // -- summarizeDeal --

  it('summarizeDeal returns not_configured mode', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.mode).toBe('not_configured');
    expect(r.isLive).toBe(false);
  });

  it('summarizeDeal mentions connector not configured', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.text).toContain('Copilot connector is not configured');
  });

  it('summarizeDeal includes deal name, client, stage, status, amount', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.text).toContain('Acme Working Capital');
    expect(r.text).toContain('Acme Inc.');
    expect(r.text).toContain('Underwriting');
    expect(r.text).toContain('Active');
    expect(r.text).toContain('4,500,000');
  });

  it('summarizeDeal includes task and document counts', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.text).toContain('3 open of 8 total');
    expect(r.text).toContain('4 outstanding of 12 total');
  });

  it('summarizeDeal includes blocker summaries', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.text).toContain('Missing appraisal');
    expect(r.text).toContain('Insurance expired');
  });

  it('summarizeDeal sources include deal', () => {
    const r = adapter.summarizeDeal(DEAL_CTX);
    expect(r.sources).toContain('deal');
  });

  // -- summarizeWorkspace --

  it('summarizeWorkspace returns not_configured mode', () => {
    const r = adapter.summarizeWorkspace(WORKSPACE_CTX);
    expect(r.mode).toBe('not_configured');
    expect(r.isLive).toBe(false);
  });

  it('summarizeWorkspace includes workspace role and user info', () => {
    const r = adapter.summarizeWorkspace(WORKSPACE_CTX);
    expect(r.text).toContain('banker');
    expect(r.text).toContain('M. Paller');
    expect(r.text).toContain('Commercial Lending East');
  });

  it('summarizeWorkspace includes deal count and KPI summaries', () => {
    const r = adapter.summarizeWorkspace(WORKSPACE_CTX);
    expect(r.text).toContain('15');
    expect(r.text).toContain('Pipeline: $45M');
    expect(r.text).toContain('At-risk: 3 deals');
  });

  // -- suggestNextActions --

  it('suggestNextActions lists open tasks, outstanding docs, blockers', () => {
    const r = adapter.suggestNextActions(DEAL_CTX);
    expect(r.text).toContain('3 open task');
    expect(r.text).toContain('4 outstanding document');
    expect(r.text).toContain('2 blocker');
  });

  it('suggestNextActions with zero issues returns no urgent actions', () => {
    const clean: CopilotDealContext = {
      ...DEAL_CTX,
      openTaskCount: 0,
      outstandingDocumentCount: 0,
      blockerCount: 0,
      blockerSummaries: [],
    };
    const r = adapter.suggestNextActions(clean);
    expect(r.text).toContain('No urgent actions');
  });

  // -- explainMissingFields --

  it('explainMissingFields with all fields populated', () => {
    const r = adapter.explainMissingFields(DEAL_CTX);
    expect(r.text).toContain('All key fields are populated');
  });

  it('explainMissingFields flags missing clientName', () => {
    const ctx: CopilotDealContext = { ...DEAL_CTX, clientName: undefined };
    const r = adapter.explainMissingFields(ctx);
    expect(r.text).toContain('Client name');
  });

  it('explainMissingFields flags missing amount', () => {
    const ctx: CopilotDealContext = { ...DEAL_CTX, amount: undefined };
    const r = adapter.explainMissingFields(ctx);
    expect(r.text).toContain('Loan amount');
  });

  // -- explainBlockers --

  it('explainBlockers with blockers lists them', () => {
    const r = adapter.explainBlockers(DEAL_CTX);
    expect(r.text).toContain('2 blocker');
    expect(r.text).toContain('Missing appraisal');
    expect(r.text).toContain('Insurance expired');
  });

  it('explainBlockers with zero blockers says none', () => {
    const ctx: CopilotDealContext = { ...DEAL_CTX, blockerCount: 0, blockerSummaries: [] };
    const r = adapter.explainBlockers(ctx);
    expect(r.text).toContain('No blockers');
  });

  // -- No fake AI --

  it('no response text claims to be AI-generated', () => {
    const responses = [
      adapter.summarizeDeal(DEAL_CTX),
      adapter.summarizeWorkspace(WORKSPACE_CTX),
      adapter.suggestNextActions(DEAL_CTX),
      adapter.explainMissingFields(DEAL_CTX),
      adapter.explainBlockers(DEAL_CTX),
    ];
    for (const r of responses) {
      expect(r.text).not.toMatch(/\bAI[- ]generated\b/i);
      expect(r.text).not.toMatch(/\bpowered by AI\b/i);
      expect(r.text).not.toMatch(/\bmy recommendation\b/i);
      expect(r.text).not.toMatch(/\bI think\b/);
      expect(r.text).not.toMatch(/\bI recommend\b/i);
      expect(r.text).not.toMatch(/\bI suggest\b/i);
      expect(r.isLive).toBe(false);
    }
  });

  // -- No writes --

  it('adapter exposes no write methods', () => {
    const keys = Object.keys(adapter);
    const writeKeywords = ['create', 'update', 'delete', 'save', 'send', 'approve', 'reject', 'complete', 'request'];
    for (const key of keys) {
      for (const w of writeKeywords) {
        expect(key.toLowerCase()).not.toContain(w);
      }
    }
  });
});

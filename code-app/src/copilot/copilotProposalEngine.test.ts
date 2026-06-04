import { describe, it, expect } from 'vitest';
import {
  proposeDealActions,
  proposeWorkspaceActions,
  ALLOWED_PROPOSAL_ACTION_TYPES,
} from './copilotProposalEngine';
import type {
  CopilotDealAssistContext,
  CopilotWorkspaceAssistContext,
} from './copilotAssistContext';

/**
 * SPEC-COPILOT-LIVE-CONNECTOR — safe proposal engine.
 *
 * Copilot may PROPOSE; it may never execute. Pins:
 *   - every proposal action_type is in the allowed set;
 *   - every proposal requires confirmation;
 *   - no proposal label/type expresses a write/send/approve/clear verb;
 *   - draft_* proposals appear only in proposal_only mode.
 */

const ALLOWED = new Set<string>(ALLOWED_PROPOSAL_ACTION_TYPES);

const DEAL_CTX: CopilotDealAssistContext = {
  deal: {
    dealName: 'D',
    clientName: 'C',
    stage: 'Underwriting',
    status: 'Active',
    amount: 1,
    taskCount: 2,
    openTaskCount: 1,
    documentCount: 3,
    outstandingDocumentCount: 1,
    blockerCount: 1,
    blockerSummaries: ['Missing appraisal'],
  },
  riskFlags: ['Missing appraisal'],
  readinessBlockers: ['Missing appraisal'],
  nextBestAction: 'Follow up on documents',
  bie: {
    preliminaryEligible: true,
    committeeEligible: false,
    evidenceTaskCount: 2,
    evidenceTasks: [
      { category: 'sos_registry', label: 'SOS / business registry', status: 'missing', committeeGrade: false },
      { category: 'website', label: 'Website', status: 'accepted', committeeGrade: false },
    ],
    committeeBlockerCategories: ['Business registry'],
    researchGrade: 'preliminary',
    sourceSnapshotStatus: 'partial',
  },
};

const WORKSPACE_CTX: CopilotWorkspaceAssistContext = {
  workspace: {
    workspaceRole: 'team',
    userName: undefined,
    teamName: 'East',
    dealCount: 5,
    urgentItemCount: 2,
    kpiSummaries: ['Active deals: 5'],
  },
  topBlockers: ['Doc bottleneck', 'Overdue tasks'],
};

const FORBIDDEN_VERB = /\b(advance stage|approve credit|clear committee|accept evidence|reject evidence|waive|send email|send teams|delete|patch)\b/i;

describe('SPEC-COPILOT — proposal engine safety', () => {
  for (const mode of ['live_read_only', 'proposal_only'] as const) {
    it(`[${mode}] all deal proposals use allowed action types`, () => {
      const proposals = proposeDealActions(DEAL_CTX, mode);
      expect(proposals.length).toBeGreaterThan(0);
      for (const p of proposals) expect(ALLOWED.has(p.action_type)).toBe(true);
    });

    it(`[${mode}] all deal proposals require confirmation`, () => {
      const proposals = proposeDealActions(DEAL_CTX, mode);
      for (const p of proposals) expect(p.requires_confirmation).toBe(true);
    });

    it(`[${mode}] no deal proposal expresses a write/approve/clear verb`, () => {
      const proposals = proposeDealActions(DEAL_CTX, mode);
      for (const p of proposals) {
        expect(p.label).not.toMatch(FORBIDDEN_VERB);
        expect(p.rationale).not.toMatch(FORBIDDEN_VERB);
      }
    });

    it(`[${mode}] workspace proposals are allowed + confirmed`, () => {
      const proposals = proposeWorkspaceActions(WORKSPACE_CTX, mode);
      for (const p of proposals) {
        expect(ALLOWED.has(p.action_type)).toBe(true);
        expect(p.requires_confirmation).toBe(true);
      }
    });
  }

  it('live_read_only excludes draft_* proposals', () => {
    const proposals = proposeDealActions(DEAL_CTX, 'live_read_only');
    expect(proposals.some((p) => p.action_type.startsWith('draft_'))).toBe(false);
  });

  it('proposal_only includes draft_* proposals', () => {
    const proposals = proposeDealActions(DEAL_CTX, 'proposal_only');
    expect(proposals.some((p) => p.action_type.startsWith('draft_'))).toBe(true);
  });

  it('missing evidence yields a suggest_evidence proposal (never an accept-evidence action)', () => {
    const proposals = proposeDealActions(DEAL_CTX, 'proposal_only');
    const sos = proposals.find((p) => p.action_id === 'suggest-evidence-sos_registry');
    expect(sos).toBeDefined();
    expect(sos!.action_type).toBe('suggest_evidence');
  });

  it('open_screen proposals carry only a navigation anchor payload (no write payload)', () => {
    const proposals = proposeDealActions(DEAL_CTX, 'proposal_only');
    const open = proposals.filter((p) => p.action_type === 'open_screen');
    expect(open.length).toBeGreaterThan(0);
    for (const p of open) {
      expect(typeof p.payload.anchor).toBe('string');
    }
  });
});

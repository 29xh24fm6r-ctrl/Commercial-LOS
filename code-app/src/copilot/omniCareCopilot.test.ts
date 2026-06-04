import { describe, it, expect } from 'vitest';
import { createMockConnector } from './copilotConnector';
import type {
  CopilotBieContext,
  CopilotDealAssistContext,
} from './copilotAssistContext';

/**
 * SPEC-COPILOT-LIVE-CONNECTOR — OmniCare acceptance.
 *
 * The BIE / committee-evidence domain has no Dataverse loader in this
 * repo yet, so OmniCare is exercised with an in-memory fixture passed to
 * the governed connector (read-only). It proves the live (mock) connector
 * summarizes the committee state correctly and proposes only SAFE next
 * actions — never clearing committee, accepting evidence, or auto-running
 * research.
 */

// 10 committee evidence tasks encoding the OmniCare state.
const OMNICARE_BIE: CopilotBieContext = {
  preliminaryEligible: true,
  committeeEligible: false,
  evidenceTaskCount: 10,
  committeeBlockerCategories: [
    'Business registry',
    'Adverse media',
    'Industry source',
    'Market source',
    'Scale plausibility',
  ],
  researchGrade: 'preliminary',
  sourceSnapshotStatus: 'partial',
  evidenceTasks: [
    { category: 'website', label: 'Website', status: 'accepted', committeeGrade: true },
    { category: 'management_attestation', label: 'Management attestation', status: 'accepted', committeeGrade: false },
    { category: 'sos_registry', label: 'SOS / business registry', status: 'missing', committeeGrade: false },
    { category: 'public_adverse', label: 'Public adverse screen', status: 'missing', committeeGrade: false },
    { category: 'industry_source', label: 'Industry source', status: 'missing', committeeGrade: false },
    { category: 'market_source', label: 'Market source', status: 'missing', committeeGrade: false },
    { category: 'scale_plausibility', label: 'Scale plausibility', status: 'accepted', committeeGrade: true, autoClearable: false },
    { category: 'financials', label: 'Financial statements', status: 'accepted', committeeGrade: true },
    { category: 'ownership', label: 'Ownership structure', status: 'accepted', committeeGrade: true },
    { category: 'references', label: 'Trade references', status: 'accepted', committeeGrade: true },
  ],
};

const OMNICARE_CTX: CopilotDealAssistContext = {
  deal: {
    dealName: 'OmniCare Health Partners',
    clientName: 'OmniCare Health Partners LLC',
    stage: 'Underwriting',
    status: 'Active',
    amount: 8_500_000,
    taskCount: 14,
    openTaskCount: 6,
    documentCount: 20,
    outstandingDocumentCount: 4,
    blockerCount: 5,
    blockerSummaries: ['Committee evidence incomplete'],
  },
  riskFlags: ['Committee evidence incomplete'],
  readinessBlockers: ['Committee evidence incomplete'],
  nextBestAction: 'Resolve committee evidence blockers',
  bie: OMNICARE_BIE,
};

describe('SPEC-COPILOT — OmniCare summary', () => {
  const summary = createMockConnector('proposal_only').assistDeal(OMNICARE_CTX)
    .summary;

  it('states preliminary is clear', () => {
    expect(summary).toMatch(/Preliminary eligibility is clear/i);
  });

  it('states committee remains blocked', () => {
    expect(summary).toMatch(/Committee eligibility remains blocked/i);
  });

  it('reports 10 committee evidence tasks', () => {
    expect(summary).toMatch(/10 committee evidence task/i);
  });

  it('notes website accepted at committee grade', () => {
    expect(summary).toMatch(/Website accepted at committee grade/i);
  });

  it('notes management attestation accepted but not committee-grade', () => {
    expect(summary).toMatch(/Management attestation accepted but not committee-grade/i);
  });

  it('lists the missing SOS / adverse / industry / market tasks', () => {
    expect(summary).toMatch(/SOS \/ business registry/i);
    expect(summary).toMatch(/Public adverse screen/i);
    expect(summary).toMatch(/Industry source/i);
    expect(summary).toMatch(/Market source/i);
  });

  it('notes scale plausibility accepted but not auto-clearable', () => {
    expect(summary).toMatch(/Scale plausibility accepted but not auto-clearable/i);
  });

  it('explains the top remaining blocker categories', () => {
    expect(summary).toMatch(/Top remaining blocker categories/i);
    expect(summary).toMatch(/Scale plausibility/i);
  });
});

describe('SPEC-COPILOT — OmniCare proposes only safe next actions', () => {
  const response = createMockConnector('proposal_only').assistDeal(OMNICARE_CTX);
  const proposals = response.proposed_actions;

  it('proposes collecting the missing registry / adverse / industry / market evidence', () => {
    const ids = proposals.map((p) => p.action_id);
    expect(ids).toContain('suggest-evidence-sos_registry');
    expect(ids).toContain('suggest-evidence-public_adverse');
    expect(ids).toContain('suggest-evidence-industry_source');
    expect(ids).toContain('suggest-evidence-market_source');
  });

  it('proposes opening the committee evidence panel (navigation only)', () => {
    const open = proposals.find((p) => p.action_id === 'open-committee-evidence');
    expect(open).toBeDefined();
    expect(open!.action_type).toBe('open_screen');
  });

  it('proposes resolving scale plausibility via an analyst note (not auto-clear)', () => {
    const resolve = proposals.find((p) => p.action_id === 'resolve-scale_plausibility');
    expect(resolve).toBeDefined();
    expect(resolve!.action_type).toBe('draft_note');
  });

  it('suggests (not runs) a research re-run because grade is preliminary', () => {
    const rerun = proposals.find((p) => p.action_type === 'suggest_research_rerun');
    expect(rerun).toBeDefined();
    expect(rerun!.label).toMatch(/Suggest re-run research/i);
  });

  it('every proposal requires confirmation', () => {
    expect(proposals.every((p) => p.requires_confirmation === true)).toBe(true);
  });

  it('does NOT clear committee, accept evidence, advance stage, or approve credit', () => {
    const forbidden = /\b(clear committee|accept evidence|mark committee-grade|advance stage|approve credit|waive)\b/i;
    for (const p of proposals) {
      expect(p.label).not.toMatch(forbidden);
      expect(p.action_type).not.toMatch(/approve|advance|accept|clear|waive/i);
    }
  });

  it('does NOT auto-run research (only suggests it)', () => {
    // No proposal type executes research; suggest_research_rerun is a suggestion.
    expect(proposals.some((p) => p.action_type === 'suggest_research_rerun')).toBe(true);
    expect(proposals.some((p) => /run research now|auto.?run/i.test(p.label))).toBe(false);
  });

  it('does not mutate the BIE input context (read-only)', () => {
    const before = JSON.stringify(OMNICARE_BIE);
    createMockConnector('proposal_only').assistDeal(OMNICARE_CTX);
    expect(JSON.stringify(OMNICARE_BIE)).toBe(before);
  });
});

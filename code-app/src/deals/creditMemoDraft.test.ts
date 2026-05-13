import { describe, it, expect } from 'vitest';
import type { DealDetail } from './dealQueries';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import {
  ALL_SECTION_KEYS,
  MISSING_PLACEHOLDER,
  SECTION_OPTIONS,
  buildCreditMemoDraft,
  type CreditMemoSectionKey,
  type CreditMemoDraftContext,
} from './creditMemoDraft';

const FIXED_NOW = new Date('2026-05-13T12:00:00Z');

const fullyPopulatedDeal: DealDetail = {
  id: 'deal-77',
  name: 'Acme Tooling 2026 Working Capital',
  clientName: 'Acme Tooling',
  stage: 'Underwriting',
  status: 'Active',
  amount: 4_500_000,
  bankerName: 'M. Paller',
  targetCloseDate: '2026-06-30T00:00:00Z',
  productType: 'Revolving Line of Credit',
  loanStructure: 'Senior Secured',
  customerType: 'C&I',
  industry: 'Manufacturing',
  guarantorStructure: 'Two personal guarantors, joint and several',
  pricingType: 'Floating',
  spreadIndex: 'SOFR',
  spreadMargin: 275,
  collateralSummary: 'A/R, inventory, and one piece of titled equipment.',
  createdOn: '2026-01-15T00:00:00Z',
  stageEntryDate: '2026-03-01T00:00:00Z',
  isClosed: false,
};

const sparseDeal: DealDetail = {
  id: 'deal-99',
  name: 'Unnamed Workout',
  clientName: undefined,
  stage: 'Origination',
  status: undefined,
  amount: undefined,
  bankerName: undefined,
  targetCloseDate: undefined,
  productType: undefined,
  loanStructure: undefined,
  customerType: undefined,
  industry: undefined,
  guarantorStructure: undefined,
  pricingType: undefined,
  spreadIndex: undefined,
  spreadMargin: undefined,
  collateralSummary: undefined,
  createdOn: undefined,
  stageEntryDate: undefined,
  isClosed: false,
};

function doc(overrides: Partial<DealDocument>): DealDocument {
  return {
    id: 'doc-x',
    name: 'Some doc',
    dueDate: undefined,
    requestDate: undefined,
    receivedDate: undefined,
    reviewer: undefined,
    uploaded: false,
    modifiedOn: undefined,
    status: 'outstanding',
    ...overrides,
  };
}

function task(overrides: Partial<DealTask>): DealTask {
  return {
    id: 't-x',
    title: 'Some task',
    completed: false,
    dueDate: undefined,
    assigneeName: undefined,
    modifiedOn: undefined,
    ...overrides,
  };
}

function makeDocsResult(outstanding: DealDocument[]): DealDocumentsResult {
  return { outstanding, received: [], reviewed: [] };
}

function makeTasksResult(open: DealTask[]): DealTasksResult {
  return { open, completed: [] };
}

function fullCtx(
  overrides: Partial<CreditMemoDraftContext> = {},
): CreditMemoDraftContext {
  return {
    deal: fullyPopulatedDeal,
    tasks: makeTasksResult([]),
    documents: makeDocsResult([]),
    existingMemos: undefined,
    now: FIXED_NOW,
    ...overrides,
  };
}

describe('SECTION_OPTIONS / ALL_SECTION_KEYS', () => {
  it('exposes the ten sections required by the Phase 24 brief in order', () => {
    expect(SECTION_OPTIONS.map((o) => o.label)).toEqual([
      'Executive Summary',
      'Borrower / Relationship Overview',
      'Loan Request',
      'Collateral',
      'Guarantor Support',
      'Pricing / Structure',
      'Due Diligence / Documents',
      'Open Tasks / Conditions',
      'Risks / Blockers',
      'Recommended Next Steps',
    ]);
    expect(ALL_SECTION_KEYS.length).toBe(10);
  });
});

describe('buildCreditMemoDraft — populated deal', () => {
  it('header includes the not-saved label and is explicit that no AI was used', () => {
    const { body } = buildCreditMemoDraft(ALL_SECTION_KEYS, fullCtx());
    expect(body).toMatch(/Draft preview — not saved, not final, banker review required\./);
    expect(body).toMatch(/No AI was used to produce this draft\./);
  });

  it('executive summary includes deal name, client, stage, amount, target close', () => {
    const { body } = buildCreditMemoDraft(['executive-summary'], fullCtx());
    expect(body).toContain('Acme Tooling 2026 Working Capital');
    expect(body).toContain('Acme Tooling');
    expect(body).toContain('Underwriting');
    // Currency-formatted amount.
    expect(body).toMatch(/\$4,500,000/);
    expect(body).toMatch(/Jun 30, 2026/);
  });

  it('reports zero missing fields when everything is populated', () => {
    const { missingFields } = buildCreditMemoDraft(ALL_SECTION_KEYS, fullCtx());
    expect(missingFields).toEqual([]);
  });

  it('does NOT contain commitment/recommendation verbs anywhere in the body', () => {
    const { body } = buildCreditMemoDraft(ALL_SECTION_KEYS, fullCtx());
    expect(/\bapproved\b/i.test(body)).toBe(false);
    // "Recommended Next Steps" section heading uses the word once;
    // strip it before validating that no body text recommends a decision.
    const withoutHeading = body.replace(/Recommended Next Steps/g, '');
    expect(/\brecommended\b/i.test(withoutHeading)).toBe(false);
    expect(/\bcleared\s+to\s+close\b/i.test(body)).toBe(false);
  });
});

describe('buildCreditMemoDraft — section include/exclude', () => {
  it('section is omitted from the body when not selected', () => {
    const { body } = buildCreditMemoDraft(['executive-summary'], fullCtx());
    expect(body).toContain('## Executive Summary');
    expect(body).not.toContain('## Collateral');
    expect(body).not.toContain('## Risks / Blockers');
  });

  it('an empty selection produces a body with only the header + footer', () => {
    const { body } = buildCreditMemoDraft([] as CreditMemoSectionKey[], fullCtx());
    expect(body).toContain('# Credit Memo — DRAFT PREVIEW');
    expect(body).toContain('End of draft preview.');
    for (const opt of SECTION_OPTIONS) {
      expect(body).not.toContain(`## ${opt.label}`);
    }
  });

  it('selecting only the Collateral section renders just that section', () => {
    const { body } = buildCreditMemoDraft(['collateral'], fullCtx());
    expect(body).toContain('## Collateral');
    expect(body).not.toContain('## Loan Request');
    expect(body).not.toContain('## Open Tasks / Conditions');
  });
});

describe('buildCreditMemoDraft — sparse deal, missing-field discipline', () => {
  it('renders Missing / Not provided. for fields the deal does not have', () => {
    const { body } = buildCreditMemoDraft(
      ['executive-summary', 'loan-request', 'pricing-structure', 'collateral', 'guarantor-support'],
      fullCtx({ deal: sparseDeal }),
    );
    expect(body).toContain(MISSING_PLACEHOLDER);
    // It must NOT invent a default amount, banker, etc.
    expect(body).not.toMatch(/\$0/);
    expect(body).not.toMatch(/unknown banker/i);
  });

  it('returns every missing field via missingFields, tagged with the section label', () => {
    const { missingFields } = buildCreditMemoDraft(
      ['executive-summary', 'loan-request'],
      fullCtx({ deal: sparseDeal }),
    );
    // The same field can appear in multiple sections (e.g. requested
    // amount in both Executive Summary and Loan Request) — that's
    // useful for the banker, who can fix it once and see all references.
    expect(
      missingFields.some((m) => m === 'Executive Summary — Requested amount'),
    ).toBe(true);
    expect(missingFields.some((m) => m === 'Loan Request — Requested amount')).toBe(true);
    expect(missingFields.some((m) => m === 'Loan Request — Product type')).toBe(true);
    expect(missingFields.some((m) => m === 'Executive Summary — Client')).toBe(true);
  });

  it('Collateral section flags missing summary and never invents a description', () => {
    const { body, missingFields } = buildCreditMemoDraft(
      ['collateral'],
      fullCtx({ deal: sparseDeal }),
    );
    expect(body).toContain(`Collateral summary: ${MISSING_PLACEHOLDER}`);
    expect(missingFields).toContain('Collateral — Collateral summary');
  });

  it('Guarantor section flags missing structure and never invents one', () => {
    const { body, missingFields } = buildCreditMemoDraft(
      ['guarantor-support'],
      fullCtx({ deal: sparseDeal }),
    );
    expect(body).toContain(`Guarantor structure: ${MISSING_PLACEHOLDER}`);
    expect(missingFields).toContain('Guarantor Support — Guarantor structure');
  });
});

describe('buildCreditMemoDraft — tasks/docs/blockers reflected conservatively', () => {
  it('Due Diligence section lists every outstanding document name', () => {
    const docs = makeDocsResult([
      doc({ id: 'd1', name: 'Personal Financial Statement' }),
      doc({ id: 'd2', name: '2024 Business Tax Return' }),
    ]);
    const { body } = buildCreditMemoDraft(
      ['due-diligence-documents'],
      fullCtx({ documents: docs }),
    );
    expect(body).toContain('Outstanding: 2');
    expect(body).toContain('Personal Financial Statement');
    expect(body).toContain('2024 Business Tax Return');
  });

  it('Open Tasks section flags overdue tasks explicitly', () => {
    const tasks = makeTasksResult([
      task({
        id: 't1',
        title: 'Confirm collateral schedule',
        dueDate: '2026-04-01T00:00:00Z', // overdue vs FIXED_NOW
      }),
      task({
        id: 't2',
        title: 'Review guarantor list',
        dueDate: '2026-07-01T00:00:00Z', // not yet due
      }),
    ]);
    const { body } = buildCreditMemoDraft(
      ['open-tasks-conditions'],
      fullCtx({ tasks }),
    );
    expect(body).toContain('Open tasks: 2 (1 overdue)');
    expect(body).toContain('[OVERDUE]');
    // Only the one task should carry the OVERDUE flag.
    expect(body.match(/\[OVERDUE\]/g)!.length).toBe(1);
  });

  it('Risks/Blockers reflects deriveBlockers output and never escalates to a recommendation', () => {
    // sparseDeal triggers a "Missing information" at-risk signal.
    const { body } = buildCreditMemoDraft(
      ['risks-blockers'],
      fullCtx({ deal: sparseDeal }),
    );
    expect(body).toMatch(/Overall status: at-risk/);
    expect(body).toContain('[AT RISK]');
    expect(/\brecommended\b/i.test(body)).toBe(false);
    expect(/\bapproved\b/i.test(body)).toBe(false);
  });

  it('Risks section is non-alarmist when no signals fire', () => {
    // Use a deal whose stageEntryDate is recent so deriveBlockers
    // does NOT flag stale-stage. The default fullyPopulatedDeal has
    // an old stageEntryDate which intentionally exercises that signal.
    const freshDeal: DealDetail = {
      ...fullyPopulatedDeal,
      stageEntryDate: '2026-05-01T00:00:00Z', // 12 days before FIXED_NOW
    };
    const { body } = buildCreditMemoDraft(['risks-blockers'], fullCtx({ deal: freshDeal }));
    expect(body).toContain('No blocking or at-risk signals detected');
    expect(body).toContain('Banker review still required.');
  });

  it('Recommended Next Steps reads as process items only — no credit-decision verbs', () => {
    const docs = makeDocsResult([
      doc({ id: 'd1', name: 'PFS', dueDate: '2026-04-01T00:00:00Z' }),
    ]);
    const tasks = makeTasksResult([
      task({ id: 't1', title: 'Confirm collateral', dueDate: '2026-04-01T00:00:00Z' }),
    ]);
    const { body } = buildCreditMemoDraft(
      ['recommended-next-steps'],
      fullCtx({ deal: sparseDeal, documents: docs, tasks }),
    );
    expect(body).toContain('Items to complete before this draft becomes a final memo:');
    expect(body).toContain('Follow up on 1 overdue outstanding document');
    expect(body).toContain('Resolve 1 overdue open task');
    expect(body).toContain('Banker review of this draft');
    // No recommendation/approval/cleared verbs.
    expect(/\brecommend\b/i.test(body)).toBe(false);
    expect(/\bapprove\b/i.test(body)).toBe(false);
    expect(/\bcleared\b/i.test(body)).toBe(false);
  });

  it('records when tasks data is not loaded, instead of inventing a clean slate', () => {
    const { body, missingFields } = buildCreditMemoDraft(
      ['open-tasks-conditions'],
      fullCtx({ tasks: undefined }),
    );
    expect(body).toContain(MISSING_PLACEHOLDER);
    expect(missingFields).toContain('Open Tasks / Conditions — Task list not loaded');
  });

  it('records when documents data is not loaded, instead of inventing one', () => {
    const { body, missingFields } = buildCreditMemoDraft(
      ['due-diligence-documents'],
      fullCtx({ documents: undefined }),
    );
    expect(body).toContain(MISSING_PLACEHOLDER);
    expect(missingFields).toContain(
      'Due Diligence / Documents — Document checklist not loaded',
    );
  });
});

describe('buildCreditMemoDraft — existing memos are read-only', () => {
  it('header notes prior-memo count when existingMemos is provided', () => {
    const { body } = buildCreditMemoDraft(
      ['executive-summary'],
      fullCtx({
        existingMemos: {
          memos: [
            {
              id: 'm1',
              name: 'Memo v1',
              status: 'Draft',
              statusKey: 'draft',
              memoType: 'Annual Review',
              version: 1,
              generatedAt: '2026-04-01T00:00:00Z',
              modifiedOn: undefined,
              borrowerSafe: false,
              textPreview: undefined,
            },
          ],
          sections: [],
        },
      }),
    );
    expect(body).toContain('Prior memos on file: 1 (not modified by this draft).');
  });

  it('does not surface prior-memo count when there are no existing memos', () => {
    const { body } = buildCreditMemoDraft(['executive-summary'], fullCtx());
    expect(body).not.toContain('Prior memos on file');
  });
});

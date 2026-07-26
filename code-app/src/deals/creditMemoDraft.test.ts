import { describe, it, expect } from 'vitest';
import type { DealDetail } from './dealQueries';
import type { DealTask, DealTasksResult } from './dealTaskQueries';
import type { DealDocument, DealDocumentsResult } from './dealDocumentQueries';
import {
  ALL_SECTION_KEYS,
  MISSING_PLACEHOLDER,
  SECTION_OPTIONS,
  buildCreditMemoDraft,
  renderSingleSection,
  type CreditMemoSectionKey,
  type CreditMemoDraftContext,
} from './creditMemoDraft';
import { serializeCrmIndustryProjectionRecord, type CrmIndustryProjectionRecord } from './crmIndustryProjectionRecord';
import { serializeGlobalCashFlowFormState, type GlobalCashFlowFormState } from './globalCashFlow';
import {
  serializeRiskRatingFormState,
  serializeUnderwritingRecommendationFormState,
  type RiskRatingFormState,
  type UnderwritingRecommendationFormState,
} from '../workflow/underwritingDeepFacts';

const FIXED_NOW = new Date('2026-05-13T12:00:00Z');

const fullyPopulatedGcfState: GlobalCashFlowFormState = {
  netIncome: '500000',
  interestExpense: '50000',
  incomeTaxes: '75000',
  depreciation: '40000',
  amortization: '10000',
  nonRecurringAddbacks: '0',
  nonRecurringIncome: '0',
  unfinancedCapEx: '20000',
  proposedNewDebtService: '150000',
  otherBusinessDebtService: '0',
  guarantors: [
    {
      guarantorName: 'Jane Doe',
      grossPersonalIncome: '200000',
      nonCashAddbacks: '0',
      personalLivingExpenses: '80000',
      otherPersonalDebtService: '0',
    },
  ],
};

const fullyPopulatedRiskRatingState: RiskRatingFormState = {
  ratingValue: '4',
  ratingScale: '1-8',
  rationale: 'Strong cash flow coverage and seasoned management team.',
  status: 'assigned',
  dealId: 'deal-77',
  assignedBy: 'M. Paller',
  assignedAtIso: '2026-05-10T00:00:00Z',
};

const fullyPopulatedRecommendationState: UnderwritingRecommendationFormState = {
  decision: 'approve_with_conditions',
  rationale: 'Supportable subject to updated collateral valuation.',
  status: 'recorded',
  dealId: 'deal-77',
  underwriterActor: 'M. Paller',
  recordedAtIso: '2026-05-10T00:00:00Z',
};

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
  loanPurpose: 'Acquisition of commercial property',
  loanTermMonths: 60,
  ownershipStructure: 'LLC',
  financialSpreadInputsJson: serializeGlobalCashFlowFormState(fullyPopulatedGcfState),
  riskRatingInputsJson: serializeRiskRatingFormState(fullyPopulatedRiskRatingState),
  underwritingRecommendationInputsJson: serializeUnderwritingRecommendationFormState(fullyPopulatedRecommendationState),
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
  it('exposes the Phase 24 brief sections plus the five N-07 decision-grade sections, in order', () => {
    expect(SECTION_OPTIONS.map((o) => o.label)).toEqual([
      'Executive Summary',
      'Borrower / Relationship Overview',
      'Loan Request',
      'Collateral',
      'Guarantor Support',
      'Pricing / Structure',
      'Global Cash Flow & DSCR Analysis',
      'Repayment Analysis',
      'Risk Rating',
      'Underwriting Recommendation',
      'Requested Credit Action',
      'Due Diligence / Documents',
      'Open Tasks / Conditions',
      'Risks / Blockers',
      'Recommended Next Steps',
    ]);
    expect(ALL_SECTION_KEYS.length).toBe(15);
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

  // N-25 remediation (Production Remediation Factory Arc Phase 8) — loan purpose, term, and
  // ownership structure were already persistable via Deal Profile editing (Factory Arc Phase 3)
  // but never appeared in the memo at all.
  it('N-25: Loan Request shows loan purpose and term when populated, flags them missing when absent (never invented)', () => {
    const populated = buildCreditMemoDraft(['loan-request'], fullCtx());
    expect(populated.body).toContain('Loan purpose: Acquisition of commercial property');
    expect(populated.body).toContain('Loan term: 60 months');
    expect(populated.missingFields).toEqual([]);

    const sparse = buildCreditMemoDraft(['loan-request'], fullCtx({ deal: sparseDeal }));
    expect(sparse.body).toContain(`Loan purpose: ${MISSING_PLACEHOLDER}`);
    expect(sparse.body).toContain(`Loan term: ${MISSING_PLACEHOLDER}`);
    expect(sparse.missingFields).toContain('Loan Request — Loan purpose');
    expect(sparse.missingFields).toContain('Loan Request — Loan term');
  });

  it('N-25: Borrower Overview shows ownership structure when populated, flags it missing when absent (never a fabricated taxonomy)', () => {
    const populated = buildCreditMemoDraft(['borrower-overview'], fullCtx());
    expect(populated.body).toContain('Ownership structure: LLC');
    expect(populated.missingFields).toEqual([]);

    const sparse = buildCreditMemoDraft(['borrower-overview'], fullCtx({ deal: sparseDeal }));
    expect(sparse.body).toContain(`Ownership structure: ${MISSING_PLACEHOLDER}`);
    expect(sparse.missingFields).toContain('Borrower / Relationship Overview — Ownership structure');
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
    // Fresh stageEntryDate so deriveBlockers does NOT flag stale-stage. A non-canonical stage so
    // the stage-exit requirement engine does not apply (recognizeCanonicalStage returns undefined),
    // isolating the operational-signal path this test targets.
    const freshDeal: DealDetail = {
      ...fullyPopulatedDeal,
      stage: 'Pre-qualification', // not a canonical stage → no stage-exit hard blockers
      stageEntryDate: '2026-05-01T00:00:00Z', // 12 days before FIXED_NOW
    };
    const { body } = buildCreditMemoDraft(['risks-blockers'], fullCtx({ deal: freshDeal }));
    expect(body).toContain('No blocking or at-risk signals detected');
    expect(body).toContain('Banker review still required.');
  });

  it('P1-9: Risks section surfaces the SAME stage-exit hard blockers as the Attention Console (not just operational signals)', () => {
    // A canonical-stage deal missing its mandatory exit documents/fields has hard blockers in the
    // workspace. The memo previously used only deriveBlockers and read "no blocking signals"; it now
    // unions in the stage-exit requirement model, so the two reconcile at generation time.
    const intakeDeal: DealDetail = {
      ...fullyPopulatedDeal,
      stage: 'Intake',
      stageEntryDate: '2026-05-01T00:00:00Z',
    };
    // No documents provided → the Intake "Loan application" required document is unmet.
    const { body } = buildCreditMemoDraft(['risks-blockers'], fullCtx({ deal: intakeDeal, documents: makeDocsResult([]) }));
    expect(body).not.toContain('No blocking or at-risk signals detected');
    expect(body).toContain('Stage exit:');
    expect(body).toMatch(/Overall status: blocked/i);
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

describe('N-22/N-23 remediation — borrower overview surfaces the exact durable NAICS classification', () => {
  const restaurantProjection: CrmIndustryProjectionRecord = {
    organizationId: 'org-restaurant',
    naicsCode: '722511',
    naicsTitle: 'Full-Service Restaurants',
    sectorCode: '72',
    sectorTitle: 'Accommodation and Food Services',
    dealIndustryApplied: '',
    source: 'none',
    lastVerifiedAtIso: '2026-07-25T00:00:00Z',
  };

  it('shows the exact NAICS classification even when the coarse Industry field cannot represent it (the audit\'s restaurant example)', () => {
    const deal: DealDetail = {
      ...fullyPopulatedDeal,
      industry: 'Other',
      crmIndustryProjectionJson: serializeCrmIndustryProjectionRecord(restaurantProjection),
    };
    const body = buildCreditMemoDraft(['borrower-overview'], fullCtx({ deal })).body;
    expect(body).toContain('NAICS classification: 722511 — Full-Service Restaurants (sector 72 — Accommodation and Food Services)');
  });

  it('omits the NAICS classification line when no CRM/NAICS projection has been recorded', () => {
    const body = buildCreditMemoDraft(['borrower-overview'], fullCtx()).body;
    expect(body).not.toContain('NAICS classification');
  });

  it('omits the NAICS classification line when the persisted projection JSON is corrupt (fail-closed, never fabricated)', () => {
    const deal: DealDetail = { ...fullyPopulatedDeal, crmIndustryProjectionJson: '{not valid json' };
    const body = buildCreditMemoDraft(['borrower-overview'], fullCtx({ deal })).body;
    expect(body).not.toContain('NAICS classification');
  });

  it('shows a bare code (no title/sector) when only the code itself is known', () => {
    const partial: CrmIndustryProjectionRecord = { ...restaurantProjection, naicsTitle: '', sectorCode: '', sectorTitle: '' };
    const deal: DealDetail = { ...fullyPopulatedDeal, crmIndustryProjectionJson: serializeCrmIndustryProjectionRecord(partial) };
    const body = buildCreditMemoDraft(['borrower-overview'], fullCtx({ deal })).body;
    expect(body).toContain('NAICS classification: 722511');
    expect(body).not.toContain('sector');
  });
});

describe('N-07 remediation — decision-grade sections (Global Cash Flow, Repayment Analysis, Risk Rating, Underwriting Recommendation, Requested Credit Action)', () => {
  it('Global Cash Flow & DSCR Analysis renders real computed figures when inputs are captured', () => {
    const { body, missingFields } = buildCreditMemoDraft(['financial-analysis'], fullCtx());
    expect(body).toContain('## Global Cash Flow & DSCR Analysis');
    expect(body).toContain('Business Cash Flow:');
    expect(body).toContain('Personal Cash Flow — Jane Doe:');
    expect(body).toMatch(/Global Cash Flow \(business \+ all guarantors\): \$[\d,]+/);
    expect(body).toMatch(/DSCR: \d+\.\d{2} \(\w+\)/);
    expect(missingFields.some((m) => m.includes('Global Cash Flow & DSCR Analysis'))).toBe(false);
  });

  it('Global Cash Flow & DSCR Analysis honestly reports insufficient data instead of fabricating a DSCR', () => {
    const { body, missingFields } = buildCreditMemoDraft(['financial-analysis'], fullCtx({ deal: sparseDeal }));
    expect(body).toContain(MISSING_PLACEHOLDER);
    expect(body).toContain('Missing inputs:');
    expect(body).not.toMatch(/DSCR: \d/);
    expect(missingFields).toContain('Global Cash Flow & DSCR Analysis — Global Cash Flow inputs');
  });

  it('Repayment Analysis reads the SAME computed DSCR as the Global Cash Flow section, plain-language framed', () => {
    const { body } = buildCreditMemoDraft(['repayment-analysis'], fullCtx());
    expect(body).toContain('## Repayment Analysis');
    expect(body).toMatch(/DSCR: \d+\.\d{2}/);
    expect(body).toContain('Assessment:');
  });

  it('Repayment Analysis degrades honestly, referencing the Global Cash Flow section, when data is missing', () => {
    const { body, missingFields } = buildCreditMemoDraft(['repayment-analysis'], fullCtx({ deal: sparseDeal }));
    expect(body).toContain('Repayment capacity cannot be assessed');
    expect(body).toContain(MISSING_PLACEHOLDER);
    expect(missingFields).toContain('Repayment Analysis — Global Cash Flow inputs');
  });

  it('Risk Rating renders the persisted rating value, scale, status, and rationale', () => {
    const { body, missingFields } = buildCreditMemoDraft(['risk-rating'], fullCtx());
    expect(body).toContain('## Risk Rating');
    expect(body).toContain('Risk rating: 4 (scale: 1-8)');
    expect(body).toContain('Status: assigned');
    expect(body).toContain('Strong cash flow coverage and seasoned management team.');
    expect(missingFields.some((m) => m.includes('Risk Rating'))).toBe(false);
  });

  it('Risk Rating honestly reports missing when no rating has been assigned', () => {
    const { body, missingFields } = buildCreditMemoDraft(['risk-rating'], fullCtx({ deal: sparseDeal }));
    expect(body).toContain(MISSING_PLACEHOLDER);
    expect(missingFields).toContain('Risk Rating — Risk rating');
  });

  it('Underwriting Recommendation renders the recorded decision, status, and rationale, with a "not itself a decision" disclaimer', () => {
    const { body, missingFields } = buildCreditMemoDraft(['underwriting-recommendation'], fullCtx());
    expect(body).toContain('## Underwriting Recommendation');
    expect(body).toContain('Recommendation on file: Approve with Conditions');
    expect(body).toContain('Status: recorded');
    expect(body).toContain('Supportable subject to updated collateral valuation.');
    expect(body).toContain('this memo does not itself make a credit decision');
    expect(missingFields.some((m) => m.includes('Underwriting Recommendation'))).toBe(false);
  });

  it('Underwriting Recommendation honestly reports nothing recorded, rather than inventing a decision', () => {
    const { body, missingFields } = buildCreditMemoDraft(['underwriting-recommendation'], fullCtx({ deal: sparseDeal }));
    expect(body).toContain('No underwriting recommendation has been recorded');
    expect(missingFields).toContain('Underwriting Recommendation — Underwriting recommendation');
  });

  it('Requested Credit Action summarizes the real credit ask and references the recorded recommendation, never the literal words "approval"/"approved"', () => {
    const { body } = buildCreditMemoDraft(['approval-request'], fullCtx());
    expect(body).toContain('## Requested Credit Action');
    expect(body).toMatch(/Requested amount: \$[\d,]+/);
    expect(body).toContain('Revolving Line of Credit');
    expect(body).toContain('Underwriting recommendation on file: Approve with Conditions');
    expect(body).not.toMatch(/\bapproval\b/i);
    expect(body).not.toMatch(/\bapproved\b/i);
  });

  it('Requested Credit Action degrades honestly when the recommendation has not been recorded', () => {
    const { body } = buildCreditMemoDraft(
      ['approval-request'],
      fullCtx({
        deal: { ...fullyPopulatedDeal, underwritingRecommendationInputsJson: undefined },
      }),
    );
    expect(body).toContain('Underwriting recommendation: not yet recorded.');
  });

  it('every new section is included in a full-memo build alongside the original ten', () => {
    const { body } = buildCreditMemoDraft(ALL_SECTION_KEYS, fullCtx());
    for (const label of [
      'Global Cash Flow & DSCR Analysis',
      'Repayment Analysis',
      'Risk Rating',
      'Underwriting Recommendation',
      'Requested Credit Action',
    ]) {
      expect(body).toContain(`## ${label}`);
    }
  });
});

describe('N-09 remediation — renderSingleSection produces boilerplate-free section content', () => {
  it('contains no header (Deal/Client/Stage/Status/Banker) or footer boilerplate — only the section\'s own content', () => {
    const text = renderSingleSection('executive-summary', fullCtx());
    expect(text).not.toContain('DRAFT PREVIEW');
    expect(text).not.toContain('Generated locally on');
    expect(text).not.toContain('End of draft preview');
    expect(text).toContain('## Executive Summary');
  });

  it('two different sections rendered via renderSingleSection never repeat the same header/footer boilerplate', () => {
    const exec = renderSingleSection('executive-summary', fullCtx());
    const collat = renderSingleSection('collateral', fullCtx());
    // Neither section carries the shared header/footer lines a `buildCreditMemoDraft` body would
    // (the literal header phrasing "Deal: X" / "Banker: X" — distinct from Executive Summary's
    // own "Deal name: X" content line, which legitimately repeats the deal name as ITS content).
    for (const text of [exec, collat]) {
      expect(text).not.toContain('# Credit Memo — DRAFT PREVIEW');
      expect(text).not.toMatch(/^Deal: /m);
      expect(text).not.toMatch(/^Banker: /m);
    }
    expect(exec).not.toBe(collat);
  });

  it('matches exactly the single-section slice buildCreditMemoDraft would wrap with header/footer', () => {
    const single = renderSingleSection('risk-rating', fullCtx());
    const { body } = buildCreditMemoDraft(['risk-rating'], fullCtx());
    // The full body is header + '\n\n' + section + '\n\n' + footer; the section text is identical.
    expect(body).toContain(single);
    expect(body.length).toBeGreaterThan(single.length);
  });
});

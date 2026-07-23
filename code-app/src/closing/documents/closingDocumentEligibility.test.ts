import { describe, it, expect } from 'vitest';
import { evaluateAllTemplates, evaluateTemplateEligibility, findMissingFacts } from './closingDocumentEligibility';
import { CLOSING_DOCUMENT_TEMPLATES, findClosingDocumentTemplate } from './closingDocumentTemplateRegistry';
import type { ClosingDocumentFactModel, ClosingDocumentTemplate } from './closingDocumentTypes';

const FULL_FACTS: ClosingDocumentFactModel = {
  dealId: 'deal-1',
  dealName: 'Acme Expansion',
  borrowerLegalName: 'Acme Holdings LLC',
  product: 'Term Loan',
  loanAmount: 500_000,
  closingDate: '2026-08-01',
  jurisdiction: 'NY',
  collateralDescription: 'All business assets',
  conditionsPrecedentResolved: true,
  fundingInstructions: 'Wire to operating account',
};

describe('closingDocumentTemplateRegistry', () => {
  it('names exactly the 5 approved pilot templates, all approved, none a legal instrument', () => {
    expect(CLOSING_DOCUMENT_TEMPLATES).toHaveLength(5);
    expect(CLOSING_DOCUMENT_TEMPLATES.map((t) => t.key)).toEqual([
      'closing_checklist',
      'borrower_closing_instruction_letter',
      'internal_funding_checklist',
      'conditions_precedent_certification',
      'closing_package_cover_sheet',
    ]);
    for (const t of CLOSING_DOCUMENT_TEMPLATES) expect(t.approved).toBe(true);
  });

  it('findClosingDocumentTemplate finds a real key and returns undefined for an unknown one', () => {
    expect(findClosingDocumentTemplate('closing_checklist')?.title).toBe('Closing Checklist');
    expect(findClosingDocumentTemplate('promissory_note' as never)).toBeUndefined();
  });
});

describe('findMissingFacts', () => {
  it('reports every required fact that is absent, empty, or whitespace-only', () => {
    const template = findClosingDocumentTemplate('closing_checklist')!;
    expect(findMissingFacts(template, {})).toEqual(template.requiredFacts);
    expect(findMissingFacts(template, { dealId: 'd1', dealName: '  ', borrowerLegalName: 'Acme', product: 'x', loanAmount: 1 })).toEqual([
      'dealName',
    ]);
  });

  it('treats false and 0 as PRESENT (not missing) — only undefined/null/blank-string count as absent', () => {
    const template = findClosingDocumentTemplate('conditions_precedent_certification')!;
    const facts: ClosingDocumentFactModel = {
      dealId: 'd1',
      dealName: 'Deal',
      borrowerLegalName: 'Acme',
      conditionsPrecedentResolved: false,
    };
    expect(findMissingFacts(template, facts)).toEqual([]);
  });

  it('is empty for a fully-satisfied template', () => {
    for (const t of CLOSING_DOCUMENT_TEMPLATES) expect(findMissingFacts(t, FULL_FACTS)).toEqual([]);
  });
});

describe('evaluateTemplateEligibility', () => {
  it('is eligible when approved, product/jurisdiction unrestricted, and all facts present', () => {
    const template = findClosingDocumentTemplate('closing_checklist')!;
    expect(evaluateTemplateEligibility(template, FULL_FACTS)).toEqual({ kind: 'eligible', template });
  });

  it('is missing_facts when required facts are absent', () => {
    const template = findClosingDocumentTemplate('internal_funding_checklist')!;
    const result = evaluateTemplateEligibility(template, { dealId: 'd1', dealName: 'Deal' });
    expect(result.kind).toBe('missing_facts');
    if (result.kind === 'missing_facts') expect(result.missingFacts).toEqual(['loanAmount', 'fundingInstructions']);
  });

  it('is not_approved when the template itself is not approved (defense-in-depth; no real template is unapproved today)', () => {
    const unapproved: ClosingDocumentTemplate = {
      key: 'closing_checklist',
      title: 'Draft-only template',
      version: '0.1.0',
      approved: false,
      requiredFacts: [],
    };
    expect(evaluateTemplateEligibility(unapproved, FULL_FACTS)).toEqual({ kind: 'not_approved', template: unapproved });
  });

  it('is wrong_product when the template restricts products and the deal does not match', () => {
    const restricted: ClosingDocumentTemplate = {
      key: 'closing_checklist',
      title: 'SBA-only checklist',
      version: '1.0.0',
      approved: true,
      requiredFacts: [],
      applicableProducts: ['SBA 7(a)'],
    };
    const result = evaluateTemplateEligibility(restricted, { ...FULL_FACTS, product: 'Term Loan' });
    expect(result).toEqual({ kind: 'wrong_product', template: restricted, product: 'Term Loan' });
  });

  it('is wrong_jurisdiction when the template restricts jurisdictions and the deal does not match (or jurisdiction is untracked)', () => {
    const restricted: ClosingDocumentTemplate = {
      key: 'closing_checklist',
      title: 'CA-only checklist',
      version: '1.0.0',
      approved: true,
      requiredFacts: [],
      applicableJurisdictions: ['CA'],
    };
    expect(evaluateTemplateEligibility(restricted, { ...FULL_FACTS, jurisdiction: 'NY' }).kind).toBe('wrong_jurisdiction');
    expect(evaluateTemplateEligibility(restricted, { ...FULL_FACTS, jurisdiction: undefined }).kind).toBe('wrong_jurisdiction');
  });

  it('product/jurisdiction restriction is checked BEFORE fact completeness (wrong product wins over missing facts)', () => {
    const restricted: ClosingDocumentTemplate = {
      key: 'closing_checklist',
      title: 'SBA-only checklist',
      version: '1.0.0',
      approved: true,
      requiredFacts: ['loanAmount'],
      applicableProducts: ['SBA 7(a)'],
    };
    const result = evaluateTemplateEligibility(restricted, { product: 'Term Loan' }); // also missing loanAmount
    expect(result.kind).toBe('wrong_product');
  });
});

describe('evaluateAllTemplates', () => {
  it('evaluates every registry template against the same facts, in registry order', () => {
    const results = evaluateAllTemplates(FULL_FACTS);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.kind === 'eligible')).toBe(true);
  });

  it('honestly reports missing_facts for every template when facts are empty (never silently allows)', () => {
    const results = evaluateAllTemplates({});
    expect(results.every((r) => r.kind === 'missing_facts')).toBe(true);
  });
});

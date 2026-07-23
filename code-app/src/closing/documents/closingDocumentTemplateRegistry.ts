import type { ClosingDocumentTemplate } from './closingDocumentTypes';

/**
 * final-seven-workstreams Workstream 6 — the approved pilot template set. See the module doc
 * comment in closingDocumentTypes.ts for the scope boundary (administrative/internal documents
 * only; no legal instruments).
 */
export const CLOSING_DOCUMENT_TEMPLATES: readonly ClosingDocumentTemplate[] = [
  {
    key: 'closing_checklist',
    title: 'Closing Checklist',
    version: '1.0.0',
    approved: true,
    requiredFacts: ['dealId', 'dealName', 'borrowerLegalName', 'product', 'loanAmount'],
  },
  {
    key: 'borrower_closing_instruction_letter',
    title: 'Borrower Closing Instruction Letter',
    version: '1.0.0',
    approved: true,
    requiredFacts: ['dealId', 'dealName', 'borrowerLegalName', 'loanAmount', 'closingDate'],
  },
  {
    key: 'internal_funding_checklist',
    title: 'Internal Funding Checklist',
    version: '1.0.0',
    approved: true,
    requiredFacts: ['dealId', 'dealName', 'loanAmount', 'fundingInstructions'],
  },
  {
    key: 'conditions_precedent_certification',
    title: 'Conditions Precedent Certification',
    version: '1.0.0',
    approved: true,
    requiredFacts: ['dealId', 'dealName', 'borrowerLegalName', 'conditionsPrecedentResolved'],
  },
  {
    key: 'closing_package_cover_sheet',
    title: 'Closing Package Cover Sheet',
    version: '1.0.0',
    approved: true,
    requiredFacts: ['dealId', 'dealName', 'borrowerLegalName', 'product', 'loanAmount', 'closingDate'],
  },
];

export function findClosingDocumentTemplate(key: ClosingDocumentTemplateKeyLike): ClosingDocumentTemplate | undefined {
  return CLOSING_DOCUMENT_TEMPLATES.find((t) => t.key === key);
}

type ClosingDocumentTemplateKeyLike = ClosingDocumentTemplate['key'];

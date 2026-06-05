/**
 * Phase 140B-H — Form model for the governed manual entry editor.
 * Defines form state shape and section definitions.
 */

export type BoardingFormSection =
  | 'loanIdentity'
  | 'borrowerProfile'
  | 'loanTerms'
  | 'closingInformation'
  | 'creditApproval'
  | 'collateral'
  | 'guarantors'
  | 'covenants'
  | 'ticklers'
  | 'insurance'
  | 'documents'
  | 'servicing'
  | 'riskRating'
  | 'exceptions'
  | 'reviews'
  | 'examinerNotes';

export interface BoardingFormSectionDefinition {
  key: BoardingFormSection;
  label: string;
  description: string;
}

export const BOARDING_FORM_SECTIONS: readonly BoardingFormSectionDefinition[] = Object.freeze([
  { key: 'loanIdentity', label: 'Loan Identity', description: 'Core loan and borrower identification.' },
  { key: 'borrowerProfile', label: 'Borrower Profile', description: 'Borrower / obligor details.' },
  { key: 'loanTerms', label: 'Loan Terms', description: 'Loan economics and structure.' },
  { key: 'closingInformation', label: 'Closing Information', description: 'Closing and funding details.' },
  { key: 'creditApproval', label: 'Credit Approval', description: 'Approval authority and decision record.' },
  { key: 'collateral', label: 'Collateral', description: 'Collateral items and perfection.' },
  { key: 'guarantors', label: 'Guarantors', description: 'Guarantor details and financial information.' },
  { key: 'covenants', label: 'Covenants', description: 'Covenant definitions and compliance status.' },
  { key: 'ticklers', label: 'Ticklers', description: 'Tickler tracking and owner assignment.' },
  { key: 'insurance', label: 'Insurance', description: 'Insurance tracking and evidence.' },
  { key: 'documents', label: 'Documents', description: 'Document inventory and status.' },
  { key: 'servicing', label: 'Servicing', description: 'Servicing and portfolio monitoring snapshot.' },
  { key: 'riskRating', label: 'Risk Rating', description: 'Risk rating history and rationale.' },
  { key: 'exceptions', label: 'Exceptions', description: 'Exception tracking and remediation.' },
  { key: 'reviews', label: 'Reviews', description: 'Review history and scheduled reviews.' },
  { key: 'examinerNotes', label: 'Examiner Notes', description: 'Examiner request and response notes.' },
]);

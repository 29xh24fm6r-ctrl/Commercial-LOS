/**
 * Phase 140B-H — Evidence binder.
 * Groups documents into examiner-ready sections. Pure function.
 */
import type { PortfolioLoanBoardingPackage, PortfolioLoanDocumentRecord } from './portfolioLoanBoardingTypes';

export type EvidenceBinderSection =
  | 'loan_approval'
  | 'loan_terms'
  | 'borrower_obligor'
  | 'collateral'
  | 'guarantors'
  | 'covenants'
  | 'financial_reporting'
  | 'servicing'
  | 'risk_rating'
  | 'exceptions'
  | 'insurance'
  | 'annual_reviews'
  | 'correspondence'
  | 'examiner_requested';

export interface EvidenceBinderSectionResult {
  sectionKey: EvidenceBinderSection;
  label: string;
  documents: readonly PortfolioLoanDocumentRecord[];
  documentCount: number;
  missingCount: number;
  staleCount: number;
}

const SECTION_LABELS: Record<EvidenceBinderSection, string> = {
  loan_approval: 'Loan Approval',
  loan_terms: 'Loan Terms',
  borrower_obligor: 'Borrower / Obligor',
  collateral: 'Collateral',
  guarantors: 'Guarantors',
  covenants: 'Covenants',
  financial_reporting: 'Financial Reporting',
  servicing: 'Servicing',
  risk_rating: 'Risk Rating',
  exceptions: 'Exceptions',
  insurance: 'Insurance',
  annual_reviews: 'Annual Reviews',
  correspondence: 'Correspondence',
  examiner_requested: 'Examiner Requested Artifacts',
};

const SECTION_DOC_TYPES: Record<EvidenceBinderSection, readonly string[]> = {
  loan_approval: ['approval_memo', 'credit_memo', 'board_approval', 'commitment_letter'],
  loan_terms: ['note', 'loan_agreement', 'business_loan_agreement', 'modification_documents', 'renewal_documents'],
  borrower_obligor: ['entity_formation', 'borrowing_resolution', 'secretary_certificate'],
  collateral: ['security_agreement', 'mortgage_deed_of_trust', 'assignment_of_rents', 'ucc', 'title_policy', 'appraisal', 'environmental_report', 'flood_determination'],
  guarantors: ['guaranty'],
  covenants: ['covenant_compliance_certificate', 'borrowing_base_certificate'],
  financial_reporting: ['financial_statements', 'interim_financials', 'tax_returns', 'ar_aging', 'ap_aging', 'inventory_report', 'rent_roll', 'lease_agreement'],
  servicing: ['servicing_notes', 'site_visit', 'payoff_documents'],
  risk_rating: ['risk_rating_review'],
  exceptions: [],
  insurance: ['insurance_evidence'],
  annual_reviews: ['annual_review'],
  correspondence: ['correspondence'],
  examiner_requested: ['examiner_requested_artifact'],
};

function matchesSection(doc: PortfolioLoanDocumentRecord, docTypes: readonly string[]): boolean {
  return doc.documentType !== undefined && docTypes.includes(doc.documentType);
}

export function deriveEvidenceBinder(pkg: PortfolioLoanBoardingPackage): readonly EvidenceBinderSectionResult[] {
  const allDocs = pkg.documents.documents;
  const sections = Object.keys(SECTION_DOC_TYPES) as EvidenceBinderSection[];

  return sections.map((sectionKey) => {
    const docTypes = SECTION_DOC_TYPES[sectionKey];
    const sectionDocs = allDocs.filter((d) => matchesSection(d, docTypes));
    return {
      sectionKey,
      label: SECTION_LABELS[sectionKey],
      documents: sectionDocs,
      documentCount: sectionDocs.length,
      missingCount: sectionDocs.filter((d) => d.missing === true || d.missingFlag === true).length,
      staleCount: sectionDocs.filter((d) => d.stale === true || d.staleFlag === true).length,
    };
  });
}

/**
 * Phase 140B-H — FDIC examiner package / evidence binder.
 * Pure function. No IO, no PDF generation. Export-ready JSON/VM only.
 */
import type { PortfolioLoanBoardingPackage } from './portfolioLoanBoardingTypes';
import { derivePortfolioLoanBoardingCompleteness } from './derivePortfolioLoanBoardingCompleteness';
import { deriveEvidenceBinder, type EvidenceBinderSectionResult } from './portfolioLoanEvidenceBinder';

export interface ExaminerPackageSection {
  sectionKey: string;
  label: string;
  status: 'complete' | 'incomplete' | 'not_applicable';
  requiredDocumentCount: number;
  receivedDocumentCount: number;
  missingDocumentCount: number;
  staleDocumentCount: number;
  evidenceLinks: readonly string[];
  notes: string | undefined;
  blockers: readonly string[];
}

export interface FdicExaminerPackage {
  loanName: string | undefined;
  borrowerName: string | undefined;
  loanNumber: string | undefined;
  riskRating: string | undefined;
  fdicReady: boolean;
  boardReady: boolean;
  portfolioMonitoringReady: boolean;
  sections: readonly ExaminerPackageSection[];
  missingDisclosure: readonly string[];
  staleDisclosure: readonly string[];
  exceptionDisclosure: readonly string[];
  blockers: readonly string[];
}

export interface ExaminerRequestChecklistItem {
  requestId: string;
  description: string;
  status: string;
  relatedSectionKey: string;
}

function buildSection(
  sectionKey: string,
  label: string,
  binderSection: EvidenceBinderSectionResult | undefined,
  blockers: readonly string[],
): ExaminerPackageSection {
  const docs = binderSection?.documentCount ?? 0;
  const missing = binderSection?.missingCount ?? 0;
  const stale = binderSection?.staleCount ?? 0;
  const received = docs - missing;
  const sectionBlockers = blockers.filter((b) =>
    b.toLowerCase().includes(sectionKey.replace('_', ' ')) ||
    b.toLowerCase().includes(label.toLowerCase()),
  );
  return {
    sectionKey,
    label,
    status: docs === 0 ? 'not_applicable' : missing > 0 ? 'incomplete' : 'complete',
    requiredDocumentCount: docs,
    receivedDocumentCount: received > 0 ? received : 0,
    missingDocumentCount: missing,
    staleDocumentCount: stale,
    evidenceLinks: [],
    notes: undefined,
    blockers: sectionBlockers,
  };
}

export function deriveFdicExaminerPackage(
  pkg: PortfolioLoanBoardingPackage,
  now?: Date,
): FdicExaminerPackage {
  const completeness = derivePortfolioLoanBoardingCompleteness({ package: pkg, now });
  const binder = deriveEvidenceBinder(pkg);
  const binderMap = new Map<string, EvidenceBinderSectionResult>(binder.map((s) => [s.sectionKey, s]));

  const sectionDefs: { key: string; label: string }[] = [
    { key: 'executive_summary', label: 'Executive Summary' },
    { key: 'loan_approval', label: 'Loan Approval' },
    { key: 'loan_terms', label: 'Loan Terms' },
    { key: 'borrower_obligor', label: 'Borrower / Obligor' },
    { key: 'collateral', label: 'Collateral Support' },
    { key: 'guarantors', label: 'Guarantor Support' },
    { key: 'financial_reporting', label: 'Financial Reporting' },
    { key: 'covenants', label: 'Covenants' },
    { key: 'insurance', label: 'Insurance' },
    { key: 'servicing', label: 'Servicing Status' },
    { key: 'risk_rating', label: 'Risk Rating' },
    { key: 'exceptions', label: 'Exceptions and Remediation' },
    { key: 'annual_reviews', label: 'Annual Review History' },
    { key: 'correspondence', label: 'Correspondence' },
    { key: 'examiner_requested', label: 'Examiner Requested Artifacts' },
    { key: 'missing_stale_disclosure', label: 'Missing / Stale / Exception Disclosure' },
  ];

  const sections = sectionDefs.map(({ key, label }) =>
    buildSection(key, label, binderMap.get(key), completeness.blockers),
  );

  const allDocs = pkg.documents.documents;
  const missingDisclosure = completeness.missingRequiredDocuments.map(String);
  const staleDisclosure = completeness.staleDocuments.map(String);
  const exceptionDisclosure = allDocs
    .filter((d) => d.exception === true || d.exceptionFlag === true)
    .map((d) => d.documentName ?? d.documentType ?? 'Unknown document');

  return {
    loanName: pkg.identity.dealName,
    borrowerName: pkg.identity.borrowerLegalName,
    loanNumber: pkg.identity.loanNumber,
    riskRating: pkg.servicing.currentRiskRating,
    fdicReady: completeness.fdicReady,
    boardReady: completeness.boardReady,
    portfolioMonitoringReady: completeness.portfolioMonitoringReady,
    sections,
    missingDisclosure,
    staleDisclosure,
    exceptionDisclosure,
    blockers: [...completeness.blockers],
  };
}

export function deriveFdicExaminerRequestChecklist(
  pkg: PortfolioLoanBoardingPackage,
): readonly ExaminerRequestChecklistItem[] {
  return pkg.examinerNotes.map((note) => ({
    requestId: note.noteId,
    description: note.note ?? '',
    status: note.responseStatus ?? 'pending',
    relatedSectionKey: 'examiner_requested',
  }));
}

export function deriveBoardLoanReviewPackage(
  pkg: PortfolioLoanBoardingPackage,
  now?: Date,
): FdicExaminerPackage {
  return deriveFdicExaminerPackage(pkg, now);
}

export function derivePortfolioManagerReviewPackage(
  pkg: PortfolioLoanBoardingPackage,
  now?: Date,
): FdicExaminerPackage {
  return deriveFdicExaminerPackage(pkg, now);
}

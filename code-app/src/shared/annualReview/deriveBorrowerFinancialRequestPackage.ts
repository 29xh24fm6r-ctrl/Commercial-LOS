/**
 * Phase 141A — Borrower financial request package (preview only).
 *
 * PURE. Builds a reviewable DRAFT request for a borrower's annual financials.
 * It sends NOTHING — no email, no SMS, no automatic borrower contact — and it
 * never fabricates a borrower contact. If contact info is missing, it surfaces
 * a blocker.
 */

import type {
  AnnualReviewLoanSnapshot,
  AnnualReviewCycle,
  AnnualReviewDocumentType,
} from './annualReviewTypes';
import { deriveAnnualReviewCollectionPlan } from './deriveAnnualReviewCollectionPlan';

export interface RequestPackageDocumentLine {
  documentType: AnnualReviewDocumentType;
  label: string;
  dueDate?: string;
  status: string;
}

export interface BorrowerFinancialRequestPackage {
  isPreviewOnly: true;
  borrowerName?: string;
  loanNumber?: string;
  relationshipName?: string;
  contactOwner?: string;
  borrowerContactName?: string;
  borrowerContactEmail?: string;
  /** True only when a real borrower contact is present (never fabricated). */
  contactConfigured: boolean;
  requiredDocuments: readonly RequestPackageDocumentLine[];
  missingDocuments: readonly RequestPackageDocumentLine[];
  priorYearRequested: readonly AnnualReviewDocumentType[];
  uploadInstructionsPlaceholder: string;
  notes: string;
  blockers: readonly string[];
}

export interface RequestPackageInput {
  loan: AnnualReviewLoanSnapshot;
  cycle: AnnualReviewCycle;
  asOfDate?: string | Date;
}

export function deriveBorrowerFinancialRequestPackage(
  input: RequestPackageInput,
): BorrowerFinancialRequestPackage {
  const { loan } = input;
  const plan = deriveAnnualReviewCollectionPlan({
    loans: [loan],
    cycle: input.cycle,
    asOfDate: input.asOfDate,
  });
  const requirements = plan.requirementsByLoan[0]?.requirements ?? [];

  const requiredDocuments: RequestPackageDocumentLine[] = requirements.map((r) => ({
    documentType: r.documentType,
    label: r.label,
    dueDate: r.dueDate,
    status: r.status,
  }));
  const missingDocuments = requiredDocuments.filter((d) => d.status === 'missing');

  // Prior-year requested = whatever the borrower has previously submitted.
  const priorYearRequested = (loan.submittedDocuments ?? []).map((d) => d.documentType);

  const blockers: string[] = [];
  const contactConfigured =
    loan.borrowerContactEmail !== undefined && loan.borrowerContactEmail.trim().length > 0;
  if (!contactConfigured) {
    blockers.push('Missing borrower contact — cannot prepare an outbound request.');
  }

  return {
    isPreviewOnly: true,
    borrowerName: loan.borrowerName,
    loanNumber: loan.loanNumber,
    relationshipName: loan.relationshipName,
    contactOwner: loan.servicingOwner ?? loan.portfolioManager,
    borrowerContactName: loan.borrowerContactName,
    borrowerContactEmail: loan.borrowerContactEmail,
    contactConfigured,
    requiredDocuments,
    missingDocuments,
    priorYearRequested,
    uploadInstructionsPlaceholder:
      'Upload link not configured. A secure upload path will be added in a later phase.',
    notes:
      'Draft preview only. No email or SMS is sent and the borrower is not contacted automatically.',
    blockers,
  };
}

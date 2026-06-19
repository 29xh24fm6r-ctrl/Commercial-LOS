import type { LoanWorkflowState } from './loanWorkflowTypes';

export interface BorrowerPackageDraft {
  status: 'ready_to_review' | 'no_missing_items';
  requestedItems: readonly string[];
  subject: string;
  body: string;
}

export function buildBorrowerPackageDraft(input: {
  borrowerName: string | undefined;
  workflow: LoanWorkflowState;
}): BorrowerPackageDraft {
  const requestedItems = input.workflow.readiness.missingDocuments.map((doc) => doc.label);
  if (requestedItems.length === 0) {
    return {
      status: 'no_missing_items',
      requestedItems,
      subject: 'Commercial loan package follow-up',
      body: 'No missing borrower document items are currently projected from the workflow state.',
    };
  }
  const borrower = input.borrowerName ?? 'Borrower';
  return {
    status: 'ready_to_review',
    requestedItems,
    subject: `${borrower} commercial loan package follow-up`,
    body: [
      `${borrower},`,
      '',
      'Please review the following outstanding package items:',
      ...requestedItems.map((item) => `- ${item}`),
      '',
      'A banker will review this list before any external communication is sent.',
    ].join('\n'),
  };
}

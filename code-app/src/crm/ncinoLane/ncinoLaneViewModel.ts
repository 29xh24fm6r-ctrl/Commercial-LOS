/**
 * Phase 147C — nCino lane view model.
 * Read-only. Preview-only. No live writes. No fake nCino loan IDs.
 */

export interface NcinoLaneReadinessRow {
  key: string;
  label: string;
  status: 'ready' | 'not_ready' | 'not_evaluated';
  detail: string;
}

export interface NcinoLaneViewModel {
  title: string;
  subtitle: string;
  safetyCopy: string;
  readOnly: true;
  previewOnly: true;
  liveWritePerformed: false;
  ncinoWritePerformed: false;

  readinessRows: readonly NcinoLaneReadinessRow[];
  borrowerConflictCount: number;
  loanWorkflowPreviewCount: number;
  nextSafeStep: string;
}

export interface NcinoLaneInput {
  relationshipReady: boolean;
  loanWorkflowReady: boolean;
  documentChecklistReady: boolean;
  milestoneReferenceReady: boolean;
  borrowerConflicts: number;
  loanWorkflowPreviewItems: number;
}

export function deriveNcinoLaneViewModel(input: NcinoLaneInput): NcinoLaneViewModel {
  const readinessRows: NcinoLaneReadinessRow[] = [
    { key: 'relationship', label: 'Relationship Readiness', status: input.relationshipReady ? 'ready' : 'not_ready', detail: input.relationshipReady ? 'nCino relationship mapping available' : 'nCino relationship mapping not available' },
    { key: 'loan_workflow', label: 'Loan Workflow Readiness', status: input.loanWorkflowReady ? 'ready' : 'not_ready', detail: input.loanWorkflowReady ? 'Loan workflow references available' : 'Loan workflow references not available' },
    { key: 'document_checklist', label: 'Document Checklist Readiness', status: input.documentChecklistReady ? 'ready' : 'not_ready', detail: input.documentChecklistReady ? 'Document checklist mapping available' : 'Document checklist mapping not available' },
    { key: 'milestone', label: 'Milestone Reference Readiness', status: input.milestoneReferenceReady ? 'ready' : 'not_ready', detail: input.milestoneReferenceReady ? 'Milestone references available' : 'Milestone references not available' },
  ];

  return {
    title: 'nCino',
    subtitle: 'Lending workflow and relationship intelligence — preview only',
    safetyCopy: 'nCino preview. Live writes disabled. No loan boarding, booking, or approval actions.',
    readOnly: true,
    previewOnly: true,
    liveWritePerformed: false,
    ncinoWritePerformed: false,
    readinessRows,
    borrowerConflictCount: input.borrowerConflicts,
    loanWorkflowPreviewCount: input.loanWorkflowPreviewItems,
    nextSafeStep: input.borrowerConflicts > 0
      ? 'Resolve borrower relationship conflicts before proceeding'
      : 'Review loan workflow readiness and document checklist gaps',
  };
}

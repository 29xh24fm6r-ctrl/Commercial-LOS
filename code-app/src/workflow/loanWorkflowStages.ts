import type {
  LoanWorkflowStageDefinition,
  LoanWorkflowStageId,
} from './loanWorkflowTypes';
import { recognizeCanonicalStage } from './stageOrderingContract';

/**
 * Loan workflow stage spine — reconciled to the ONE canonical vocabulary (the
 * ratified seven, INTAKE … BOARDED). Each stage's id is its `CanonicalStageCode`,
 * matching `cr664_dealstagereferences.cr664_code`. The legacy 11-stage
 * Opportunity/Qualification requirements are preserved and redistributed across
 * the canonical seven (nothing invented; the front-end intake/qualification/
 * application evidence collapses into INTAKE, document-collection folds into
 * UNDERWRITING, the three credit sub-stages fold into CREDIT_APPROVAL, and the
 * commitment artifact moves ahead of documentation as its own canonical stage).
 */

const commonFields = [
  { id: 'clientName', label: 'Client name', type: 'field' },
  { id: 'amount', label: 'Loan amount', type: 'field' },
] as const;

const identityFields = [
  ...commonFields,
  { id: 'productType', label: 'Product type', type: 'field' },
  { id: 'loanStructure', label: 'Loan structure', type: 'field' },
  { id: 'targetCloseDate', label: 'Target close date', type: 'field' },
] as const;

export const LOAN_WORKFLOW_STAGES: readonly LoanWorkflowStageDefinition[] =
  Object.freeze([
    {
      id: 'INTAKE',
      label: 'Intake',
      entryCriteria: ['Authorized banker opens an active commercial deal.'],
      exitCriteria: ['Borrower, amount, product, structure, and industry are identified and the application package is initiated.'],
      requiredFields: [
        ...identityFields,
        { id: 'industry', label: 'Industry', type: 'field' },
        { id: 'customerType', label: 'Customer type', type: 'field' },
      ],
      requiredDocuments: [
        { id: 'loan application', label: 'Loan application', type: 'document' },
      ],
      requiredTasks: [
        { id: 'initial borrower conversation', label: 'Initial borrower conversation', type: 'task' },
        { id: 'qualification review', label: 'Qualification review', type: 'task' },
        { id: 'application completeness review', label: 'Application completeness review', type: 'task' },
      ],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['UNDERWRITING'],
      blockerRules: ['Missing borrower identity, qualification facts, or application evidence blocks underwriting.'],
    },
    {
      id: 'UNDERWRITING',
      label: 'Underwriting',
      entryCriteria: ['The application package is initiated and borrower evidence can be collected.'],
      exitCriteria: ['Required financials and collateral are received and underwriting analysis supports a credit recommendation.'],
      requiredFields: [
        ...identityFields,
        { id: 'collateralSummary', label: 'Collateral summary', type: 'field' },
      ],
      requiredDocuments: [
        { id: 'business financial statements', label: 'Business financial statements', type: 'document' },
        { id: 'tax returns', label: 'Tax returns', type: 'document' },
        { id: 'ownership information', label: 'Ownership information', type: 'document' },
        { id: 'collateral support', label: 'Collateral support', type: 'document' },
      ],
      requiredTasks: [
        { id: 'document intake review', label: 'Document intake review', type: 'task' },
        { id: 'underwriting analysis', label: 'Underwriting analysis', type: 'task' },
      ],
      creditRequirements: [{ id: 'spreading analysis', label: 'Spreading / repayment analysis', type: 'credit' }],
      closingRequirements: [],
      allowedNextStages: ['CREDIT_APPROVAL'],
      blockerRules: ['Outstanding required documents or open underwriting tasks block credit approval.'],
    },
    {
      id: 'CREDIT_APPROVAL',
      label: 'Credit Approval',
      entryCriteria: ['Underwriting is complete enough to assemble the credit package.'],
      exitCriteria: ['Credit memo is reviewed and an approval decision with conditions is recorded.'],
      requiredFields: identityFields,
      requiredDocuments: [{ id: 'approval evidence', label: 'Approval evidence', type: 'document' }],
      requiredTasks: [
        { id: 'credit memo package review', label: 'Credit memo package review', type: 'task' },
        { id: 'credit review follow-up', label: 'Credit review follow-up', type: 'task' },
        { id: 'approval conditions review', label: 'Approval conditions review', type: 'task' },
      ],
      creditRequirements: [
        { id: 'credit memo', label: 'Credit memo', type: 'credit' },
        { id: 'executive summary section', label: 'Executive summary section', type: 'credit' },
        { id: 'repayment analysis section', label: 'Repayment analysis section', type: 'credit' },
        { id: 'reviewed memo', label: 'Reviewed credit memo', type: 'credit' },
        { id: 'committee package', label: 'Committee package readiness', type: 'credit' },
        { id: 'approved credit memo', label: 'Approved credit memo evidence', type: 'credit' },
      ],
      closingRequirements: [],
      allowedNextStages: ['COMMITMENT'],
      blockerRules: ['Missing memo, unreviewed sections, or absent approval evidence block commitment.'],
    },
    {
      id: 'COMMITMENT',
      label: 'Commitment',
      entryCriteria: ['Credit approval is granted with conditions.'],
      exitCriteria: ['A commitment letter is issued and accepted before loan documentation begins.'],
      requiredFields: identityFields,
      requiredDocuments: [{ id: 'commitment letter', label: 'Commitment letter', type: 'document' }],
      requiredTasks: [{ id: 'commitment acceptance review', label: 'Commitment acceptance review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['DOCUMENTATION'],
      blockerRules: ['A commitment letter must be issued and accepted before loan documentation.'],
    },
    {
      id: 'DOCUMENTATION',
      label: 'Documentation',
      entryCriteria: ['Commitment is accepted and loan documentation can be prepared.'],
      exitCriteria: ['Loan documents are prepared and conditions precedent are resolved.'],
      requiredFields: [
        ...identityFields,
        { id: 'guarantorStructure', label: 'Guarantor structure', type: 'field' },
      ],
      requiredDocuments: [
        { id: 'loan agreement', label: 'Loan agreement', type: 'document' },
        { id: 'insurance evidence', label: 'Insurance evidence', type: 'document' },
      ],
      requiredTasks: [{ id: 'documentation checklist review', label: 'Documentation checklist review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [{ id: 'conditions precedent', label: 'Conditions precedent resolved', type: 'closing' }],
      allowedNextStages: ['CLOSING_FUNDING'],
      blockerRules: ['Unresolved loan documents or conditions precedent block closing & funding.'],
    },
    {
      id: 'CLOSING_FUNDING',
      label: 'Closing & Funding',
      entryCriteria: ['Loan documentation is complete and conditions precedent are resolved.'],
      exitCriteria: ['The loan is closed, funded, and the booking package passes quality control.'],
      requiredFields: identityFields,
      requiredDocuments: [{ id: 'booking package', label: 'Booking package', type: 'document' }],
      requiredTasks: [{ id: 'booking quality control', label: 'Booking quality control', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [{ id: 'post close exceptions', label: 'Post-close exceptions identified', type: 'closing' }],
      allowedNextStages: ['BOARDED'],
      blockerRules: ['Closing and funding cannot complete while booking blockers remain.'],
    },
    {
      id: 'BOARDED',
      label: 'Boarded / Servicing',
      entryCriteria: ['Loan is booked and funded; servicing and monitoring obligations are known.'],
      exitCriteria: ['Monitoring cadence and exceptions are under servicing control.'],
      requiredFields: identityFields,
      requiredDocuments: [],
      requiredTasks: [{ id: 'post close monitoring setup', label: 'Post-close monitoring setup', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: [],
      blockerRules: ['Missing monitoring setup keeps the loan from fully boarded.'],
    },
  ] as const);

const STAGES_BY_ID = new Map(LOAN_WORKFLOW_STAGES.map((stage) => [stage.id, stage]));

export function getLoanWorkflowStage(
  stageId: LoanWorkflowStageId,
): LoanWorkflowStageDefinition {
  const stage = STAGES_BY_ID.get(stageId);
  if (!stage) throw new Error(`Unknown loan workflow stage: ${stageId}`);
  return stage;
}

export function getNextLoanWorkflowStages(
  stage: LoanWorkflowStageDefinition,
): readonly LoanWorkflowStageDefinition[] {
  return stage.allowedNextStages.map((id) => getLoanWorkflowStage(id));
}

/**
 * Resolve a stored `deal.stage` (a canonical `cr664_StageReference` code OR
 * ratified name) to its canonical workflow stage via the single-source
 * `recognizeCanonicalStage`. Anything unrecognized (a legacy/custom/blank stage)
 * fails to INTAKE as an honest `defaulted` — never a fabricated stage.
 */
export function resolveLoanWorkflowStage(
  stageLabel: string | undefined,
): { stage: LoanWorkflowStageDefinition; source: 'matched' | 'defaulted' } {
  const recognized = recognizeCanonicalStage(stageLabel);
  if (recognized) {
    return { stage: getLoanWorkflowStage(recognized.code as LoanWorkflowStageId), source: 'matched' };
  }
  return { stage: getLoanWorkflowStage('INTAKE'), source: 'defaulted' };
}

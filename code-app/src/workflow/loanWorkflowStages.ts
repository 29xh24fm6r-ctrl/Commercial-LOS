import type {
  LoanWorkflowStageDefinition,
  LoanWorkflowStageId,
} from './loanWorkflowTypes';

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
      id: 'opportunity_intake',
      label: 'Opportunity / intake',
      entryCriteria: ['Authorized banker opens an active commercial deal.'],
      exitCriteria: ['Borrower, amount, product, and owner are identified.'],
      requiredFields: commonFields,
      requiredDocuments: [],
      requiredTasks: [{ id: 'initial borrower conversation', label: 'Initial borrower conversation', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['qualification'],
      blockerRules: ['Missing borrower identity or initial intake task blocks qualification.'],
    },
    {
      id: 'qualification',
      label: 'Qualification',
      entryCriteria: ['Intake facts are available for banker screening.'],
      exitCriteria: ['Product, structure, industry, and target close timing are known.'],
      requiredFields: [
        ...identityFields,
        { id: 'industry', label: 'Industry', type: 'field' },
        { id: 'customerType', label: 'Customer type', type: 'field' },
      ],
      requiredDocuments: [],
      requiredTasks: [{ id: 'qualification review', label: 'Qualification review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['application'],
      blockerRules: ['Missing qualification facts block application readiness.'],
    },
    {
      id: 'application',
      label: 'Application',
      entryCriteria: ['The deal is qualified for a formal application package.'],
      exitCriteria: ['Core borrower and facility information is complete.'],
      requiredFields: identityFields,
      requiredDocuments: [
        { id: 'loan application', label: 'Loan application', type: 'document' },
        { id: 'business financial statements', label: 'Business financial statements', type: 'document' },
      ],
      requiredTasks: [{ id: 'application completeness review', label: 'Application completeness review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['document_collection'],
      blockerRules: ['Outstanding application evidence blocks document collection completion.'],
    },
    {
      id: 'document_collection',
      label: 'Document collection',
      entryCriteria: ['Application package has been initiated.'],
      exitCriteria: ['Required documents are received or explicitly unavailable.'],
      requiredFields: identityFields,
      requiredDocuments: [
        { id: 'business financial statements', label: 'Business financial statements', type: 'document' },
        { id: 'tax returns', label: 'Tax returns', type: 'document' },
        { id: 'ownership information', label: 'Ownership information', type: 'document' },
      ],
      requiredTasks: [{ id: 'document intake review', label: 'Document intake review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: ['underwriting'],
      blockerRules: ['Outstanding required documents block underwriting readiness.'],
    },
    {
      id: 'underwriting',
      label: 'Underwriting',
      entryCriteria: ['Required application and borrower evidence is available.'],
      exitCriteria: ['Analysis is complete enough to draft a credit memo.'],
      requiredFields: [
        ...identityFields,
        { id: 'collateralSummary', label: 'Collateral summary', type: 'field' },
      ],
      requiredDocuments: [
        { id: 'business financial statements', label: 'Business financial statements', type: 'document' },
        { id: 'tax returns', label: 'Tax returns', type: 'document' },
        { id: 'collateral support', label: 'Collateral support', type: 'document' },
      ],
      requiredTasks: [{ id: 'underwriting analysis', label: 'Underwriting analysis', type: 'task' }],
      creditRequirements: [{ id: 'spreading analysis', label: 'Spreading / repayment analysis', type: 'credit' }],
      closingRequirements: [],
      allowedNextStages: ['credit_memo'],
      blockerRules: ['Open underwriting tasks or missing credit evidence block memo readiness.'],
    },
    {
      id: 'credit_memo',
      label: 'Credit memo',
      entryCriteria: ['Underwriting evidence is sufficient for memo drafting.'],
      exitCriteria: ['Credit memo and required memo sections are present.'],
      requiredFields: identityFields,
      requiredDocuments: [],
      requiredTasks: [{ id: 'credit memo draft review', label: 'Credit memo draft review', type: 'task' }],
      creditRequirements: [
        { id: 'credit memo', label: 'Credit memo', type: 'credit' },
        { id: 'executive summary section', label: 'Executive summary section', type: 'credit' },
        { id: 'repayment analysis section', label: 'Repayment analysis section', type: 'credit' },
      ],
      closingRequirements: [],
      allowedNextStages: ['credit_review'],
      blockerRules: ['Missing memo or required sections block credit review.'],
    },
    {
      id: 'credit_review',
      label: 'Credit review',
      entryCriteria: ['Credit memo package is ready for review.'],
      exitCriteria: ['Credit review conditions and open questions are resolved.'],
      requiredFields: identityFields,
      requiredDocuments: [],
      requiredTasks: [{ id: 'credit review follow-up', label: 'Credit review follow-up', type: 'task' }],
      creditRequirements: [
        { id: 'reviewed memo', label: 'Reviewed credit memo', type: 'credit' },
        { id: 'committee package', label: 'Committee package readiness', type: 'credit' },
      ],
      closingRequirements: [],
      allowedNextStages: ['approval'],
      blockerRules: ['Unreviewed memo sections or open credit tasks block approval.'],
    },
    {
      id: 'approval',
      label: 'Approval',
      entryCriteria: ['Credit package is ready for approval decisioning.'],
      exitCriteria: ['Approval evidence and approval conditions are available.'],
      requiredFields: identityFields,
      requiredDocuments: [{ id: 'approval evidence', label: 'Approval evidence', type: 'document' }],
      requiredTasks: [{ id: 'approval conditions review', label: 'Approval conditions review', type: 'task' }],
      creditRequirements: [{ id: 'approved credit memo', label: 'Approved credit memo evidence', type: 'credit' }],
      closingRequirements: [],
      allowedNextStages: ['closing'],
      blockerRules: ['Approval cannot be inferred without evidence.'],
    },
    {
      id: 'closing',
      label: 'Closing',
      entryCriteria: ['Approval evidence exists and closing work can begin.'],
      exitCriteria: ['Closing documents and conditions precedent are resolved.'],
      requiredFields: [
        ...identityFields,
        { id: 'guarantorStructure', label: 'Guarantor structure', type: 'field' },
      ],
      requiredDocuments: [
        { id: 'commitment letter', label: 'Commitment letter', type: 'document' },
        { id: 'loan agreement', label: 'Loan agreement', type: 'document' },
        { id: 'insurance evidence', label: 'Insurance evidence', type: 'document' },
      ],
      requiredTasks: [{ id: 'closing checklist review', label: 'Closing checklist review', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [{ id: 'conditions precedent', label: 'Conditions precedent resolved', type: 'closing' }],
      allowedNextStages: ['booking'],
      blockerRules: ['Unresolved closing documents or tasks block booking readiness.'],
    },
    {
      id: 'booking',
      label: 'Booking',
      entryCriteria: ['Closing package is complete.'],
      exitCriteria: ['Booking package is reviewed and post-close monitoring is identified.'],
      requiredFields: identityFields,
      requiredDocuments: [{ id: 'booking package', label: 'Booking package', type: 'document' }],
      requiredTasks: [{ id: 'booking quality control', label: 'Booking quality control', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [{ id: 'post close exceptions', label: 'Post-close exceptions identified', type: 'closing' }],
      allowedNextStages: ['post_close_monitoring'],
      blockerRules: ['Booking cannot be ready while closing blockers remain.'],
    },
    {
      id: 'post_close_monitoring',
      label: 'Post-close monitoring',
      entryCriteria: ['Loan is booked and monitoring obligations are known.'],
      exitCriteria: ['Monitoring cadence and exceptions are under servicing control.'],
      requiredFields: identityFields,
      requiredDocuments: [],
      requiredTasks: [{ id: 'post close monitoring setup', label: 'Post-close monitoring setup', type: 'task' }],
      creditRequirements: [],
      closingRequirements: [],
      allowedNextStages: [],
      blockerRules: ['Missing monitoring setup keeps the workflow from release-candidate complete.'],
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

export function resolveLoanWorkflowStage(
  stageLabel: string | undefined,
): { stage: LoanWorkflowStageDefinition; source: 'matched' | 'defaulted' } {
  const normalized = normalize(stageLabel);
  const matched = LOAN_WORKFLOW_STAGES.find(
    (stage) =>
      normalize(stage.label) === normalized ||
      normalize(stage.id) === normalized ||
      normalized.includes(normalize(stage.label).replace('opportunity intake', 'opportunity')) ||
      normalize(stage.label).includes(normalized),
  );
  if (matched) return { stage: matched, source: 'matched' };
  if (/underwrit/.test(normalized)) return { stage: getLoanWorkflowStage('underwriting'), source: 'matched' };
  if (/committee|credit review/.test(normalized)) return { stage: getLoanWorkflowStage('credit_review'), source: 'matched' };
  if (/memo/.test(normalized)) return { stage: getLoanWorkflowStage('credit_memo'), source: 'matched' };
  if (/approv/.test(normalized)) return { stage: getLoanWorkflowStage('approval'), source: 'matched' };
  if (/closing|documentation/.test(normalized)) return { stage: getLoanWorkflowStage('closing'), source: 'matched' };
  if (/fund|book/.test(normalized)) return { stage: getLoanWorkflowStage('booking'), source: 'matched' };
  return { stage: getLoanWorkflowStage('opportunity_intake'), source: 'defaulted' };
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
}

import { CREDIT_APPROVAL_DECISION_STATUSES } from '../../workflow/creditApprovalDecisionTypes';
import { COMMITMENT_STATUSES } from '../../workflow/commitmentRecordTypes';
import { CONDITION_VERIFICATION_STATUSES } from '../../workflow/conditionVerificationTypes';
import { EXECUTED_DOCUMENT_CERTIFICATION_STATUSES } from '../../workflow/executedDocumentAttestationTypes';
import { BOOKING_QC_STATUSES } from '../../workflow/bookingQcCheckTypes';
import { ADVERSE_ACTION_RECORD_STATUSES } from '../../workflow/adverseActionRecordTypes';

/**
 * Final LOS Completion arc — Workstream M. Registers what `GOVERNED_WRITES` (`platformInventory.ts`)
 * deliberately does NOT model: each durable-record capability's own domain STATUS VOCABULARY (e.g. a
 * Commitment can be `ISSUED`/`ACCEPTED`/`DECLINED`/`EXPIRED`/`WITHDRAWN`). That is the same kind of
 * fact the 9 pre-existing admin capability/readiness panels each carry for their own domains — see
 * `AdminCapabilityTruthMatrix.tsx`'s own header, which documents 9 independently-declared status
 * vocabularies already exist and explicitly declines to retire or merge any of them.
 *
 * This is an ADDITIVE, 10th (well, 6th-through-11th) vocabulary source, not a retrofit of the
 * existing 9 — none of those 9 panels are about individual durable-record domain status; they're
 * about platform-level launch/activation readiness. Per the gap ledger's own instruction
 * ("Workstream M adds one new authoritative model without retiring the existing nine"), this module
 * and its panel (`AdminDurableRecordCapabilityPanel.tsx`) sit ALONGSIDE the existing panels, touching
 * none of them.
 *
 * STATIC, like `platformInventory.ts`. No runtime probes, no service calls — each `statusVocabulary`
 * is read directly off its capability's own real `_STATUSES` export (never invented here), so this
 * module cannot drift from the type it's reporting on without a compile error.
 */
export interface DurableRecordCapabilityEntry {
  readonly id: string;
  readonly label: string;
  /** Matches the corresponding `GovernedWriteEntry.id` in `platformInventory.ts`'s `GOVERNED_WRITES`. */
  readonly governedWriteId: string;
  readonly statusVocabulary: readonly string[];
  readonly typesFile: string;
  readonly storeFile: string;
  readonly actionFile: string;
  readonly mountedInPanel: string;
}

export const DURABLE_RECORD_CAPABILITIES: readonly DurableRecordCapabilityEntry[] = [
  {
    id: 'credit-approval-decision',
    label: 'Credit Approval Decision',
    governedWriteId: 'credit-approval-decision-submit',
    statusVocabulary: CREDIT_APPROVAL_DECISION_STATUSES,
    typesFile: 'src/workflow/creditApprovalDecisionTypes.ts',
    storeFile: 'src/creditApproval/creditApprovalDecisionStore.ts',
    actionFile: 'src/creditApproval/submitCreditApprovalDecision.ts',
    mountedInPanel: 'DealCreditApprovalDecisionPanelConnected.tsx',
  },
  {
    id: 'commitment-record',
    label: 'Commitment Record',
    governedWriteId: 'commitment-submit',
    statusVocabulary: COMMITMENT_STATUSES,
    typesFile: 'src/workflow/commitmentRecordTypes.ts',
    storeFile: 'src/commitment/commitmentRecordStore.ts',
    actionFile: 'src/commitment/submitCommitmentAction.ts',
    mountedInPanel: 'DealCommitmentPanelConnected.tsx',
  },
  {
    id: 'condition-verification',
    label: 'Condition Verification',
    governedWriteId: 'condition-verification-submit',
    statusVocabulary: CONDITION_VERIFICATION_STATUSES,
    typesFile: 'src/workflow/conditionVerificationTypes.ts',
    storeFile: 'src/documentation/conditionVerificationStore.ts',
    actionFile: 'src/documentation/submitConditionVerificationAction.ts',
    mountedInPanel: 'DealConditionVerificationPanelConnected.tsx',
  },
  {
    id: 'executed-document-attestation',
    label: 'Executed Document Attestation',
    governedWriteId: 'executed-document-attestation-submit',
    statusVocabulary: EXECUTED_DOCUMENT_CERTIFICATION_STATUSES,
    typesFile: 'src/workflow/executedDocumentAttestationTypes.ts',
    storeFile: 'src/closing/executedDocumentAttestationStore.ts',
    actionFile: 'src/closing/submitExecutedDocumentAttestationAction.ts',
    mountedInPanel: 'DealExecutedDocumentAttestationPanelConnected.tsx',
  },
  {
    id: 'booking-qc-check',
    label: 'Booking QC Check',
    governedWriteId: 'booking-qc-check-submit',
    statusVocabulary: BOOKING_QC_STATUSES,
    typesFile: 'src/workflow/bookingQcCheckTypes.ts',
    storeFile: 'src/closing/bookingQcCheckStore.ts',
    actionFile: 'src/closing/submitBookingQcCheckAction.ts',
    mountedInPanel: 'DealBookingQcPanelConnected.tsx',
  },
  {
    id: 'adverse-action-record',
    label: 'Adverse Action Record',
    governedWriteId: 'adverse-action-submit',
    statusVocabulary: ADVERSE_ACTION_RECORD_STATUSES,
    typesFile: 'src/workflow/adverseActionRecordTypes.ts',
    storeFile: 'src/creditApproval/adverseActionRecordStore.ts',
    actionFile: 'src/creditApproval/submitAdverseActionAction.ts',
    mountedInPanel: 'DealAdverseActionPanelConnected.tsx',
  },
];

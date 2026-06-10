/**
 * Phase 142R — Servicing lifecycle READ-ONLY Dataverse mapper.
 *
 * PURE, READ-ONLY. Projects already-available LOS / Dataverse-shaped deal fields
 * into a servicing lifecycle REVIEW summary. It creates NO servicing record,
 * mutates NO deal status, boards NO loan, syncs NO core banking, generates NO
 * payment schedule / amortization / statement, notifies NO borrower, and makes NO
 * delinquency / default / current decision. Every outcome keeps `readOnly` true
 * and `liveServicingSyncPerformed`, `coreBankingSyncPerformed`, `loanBoarded`,
 * `paymentScheduleGenerated`, and `externalSystemChanged` false. It never claims a
 * loan is "boarded", "serviced", "current", "delinquent", or "defaulted".
 */

export interface ServicingLifecycleMapperInput {
  dealId?: string;
  dealName?: string;
  clientName?: string;
  borrowerName?: string;
  borrowerLabel?: string;
  bankerName?: string;
  stage?: string;
  status?: string;
  productType?: string;
  loanStructure?: string;
  pricingType?: string;
  amount?: number;
  approvedAmount?: number;
  closeDate?: string;
  expectedCloseDate?: string;
  actualCloseDate?: string;
  maturityDate?: string;
  amortizationMonths?: number;
  collateralSummary?: string;
  covenantPackageType?: string;
  packageGeneratedAt?: string;
  memoGeneratedAt?: string;
  servicingRecordId?: string;
  sourceUpdatedAt?: string;
}

export type ServicingProjectionStatus =
  | 'not_ready_for_servicing'
  | 'ready_for_boarding_review'
  | 'boarding_data_incomplete'
  | 'servicing_record_unavailable'
  | 'unknown';

export type ServicingBoardingReadiness = 'review_required' | 'incomplete' | 'unavailable' | 'unknown';

export interface ServicingLoanSnapshot {
  productType: string;
  loanStructure: string;
  pricingType: string;
  amountLabel: string;
  maturityLabel: string;
  amortizationLabel: string;
}

export interface ServicingLifecycleMilestone {
  key: string;
  label: string;
  present: boolean;
}

export interface ServicingLifecycleProjection {
  dealId: string;
  dealName: string;
  clientName: string;
  borrowerLabel: string;
  bankerName: string;
  servicingProjectionStatus: ServicingProjectionStatus;
  servicingProjectionLabel: string;
  boardingReadiness: ServicingBoardingReadiness;
  loanSnapshot: ServicingLoanSnapshot;
  lifecycleMilestones: readonly ServicingLifecycleMilestone[];
  missingServicingFields: readonly string[];
  warnings: readonly string[];
  nextReadOnlyReviewStep: string;
  servicingReferencePresent: boolean;
  /** Pinned — this is a read-only projection. */
  readOnly: true;
  liveServicingSyncPerformed: false;
  coreBankingSyncPerformed: false;
  loanBoarded: false;
  paymentScheduleGenerated: false;
  externalSystemChanged: false;
}

const STATUS_LABELS: Record<ServicingProjectionStatus, string> = {
  not_ready_for_servicing: 'Not ready for servicing review',
  ready_for_boarding_review: 'Ready for human boarding review (servicing reference present, read-only)',
  boarding_data_incomplete: 'Boarding data incomplete',
  servicing_record_unavailable: 'Ready for human boarding review — no servicing reference yet',
  unknown: 'Servicing projection unknown',
};

const NEXT_STEPS: Record<ServicingProjectionStatus, string> = {
  not_ready_for_servicing: 'No servicing review yet — the deal is not closed / approved / originated.',
  ready_for_boarding_review: 'Conduct a read-only human boarding review (no loan boarding occurs).',
  boarding_data_incomplete: 'Complete the missing boarding fields for a future read-only review.',
  servicing_record_unavailable: 'Conduct a read-only human boarding review (no loan boarding occurs).',
  unknown: 'Provide deal identity to project servicing readiness.',
};

function text(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isClosedLike(input: ServicingLifecycleMapperInput): boolean {
  const haystack = `${input.status ?? ''} ${input.stage ?? ''}`.toLowerCase();
  return /clos|approv|originat|fund|book/.test(haystack);
}

function milestone(key: string, label: string, present: boolean): ServicingLifecycleMilestone {
  return { key, label, present };
}

export function deriveServicingLifecycleProjection(
  input: ServicingLifecycleMapperInput | null | undefined,
): ServicingLifecycleProjection {
  const dealRef = (input?.dealId ?? '').trim();
  const warnings: string[] = [];
  const missingServicingFields: string[] = [];

  const borrowerLabel = text(input?.borrowerLabel ?? input?.borrowerName, 'Unknown borrower');

  const amountValue = input?.approvedAmount ?? input?.amount;
  const loanSnapshot: ServicingLoanSnapshot = {
    productType: text(input?.productType, 'unavailable'),
    loanStructure: text(input?.loanStructure, 'unavailable'),
    pricingType: text(input?.pricingType, 'unavailable'),
    amountLabel: amountValue !== undefined ? String(amountValue) : 'unavailable',
    maturityLabel: text(input?.maturityDate, 'unavailable'),
    amortizationLabel: input?.amortizationMonths !== undefined ? `${input.amortizationMonths} months` : 'unavailable',
  };

  let servicingProjectionStatus: ServicingProjectionStatus;
  const servicingReferencePresent = (input?.servicingRecordId ?? '').trim().length > 0;

  if (!input || dealRef.length === 0) {
    servicingProjectionStatus = 'unknown';
    warnings.push('Deal identity is missing; servicing readiness cannot be projected.');
  } else if (!isClosedLike(input)) {
    servicingProjectionStatus = 'not_ready_for_servicing';
    warnings.push('Deal stage/status does not indicate a closed / approved / originated loan; not ready for servicing.');
  } else {
    // Closed-like — evaluate the fields needed for a human boarding review only.
    if (input.productType === undefined) missingServicingFields.push('productType');
    if (input.loanStructure === undefined) missingServicingFields.push('loanStructure');
    if (amountValue === undefined) missingServicingFields.push('amount');
    if (input.maturityDate === undefined) missingServicingFields.push('maturityDate');
    if (input.actualCloseDate === undefined && input.closeDate === undefined) missingServicingFields.push('closeDate');

    if (missingServicingFields.length > 0) {
      servicingProjectionStatus = 'boarding_data_incomplete';
    } else if (servicingReferencePresent) {
      servicingProjectionStatus = 'ready_for_boarding_review';
      warnings.push('Servicing reference present — read-only review only; live servicing is not active.');
    } else {
      servicingProjectionStatus = 'servicing_record_unavailable';
      warnings.push('No servicing record reference present — read-only boarding review only.');
    }
  }

  const boardingReadiness: ServicingBoardingReadiness =
    servicingProjectionStatus === 'unknown' ? 'unknown'
      : servicingProjectionStatus === 'not_ready_for_servicing' ? 'unavailable'
        : servicingProjectionStatus === 'boarding_data_incomplete' ? 'incomplete'
          : 'review_required';

  const reviewReady = servicingProjectionStatus === 'ready_for_boarding_review' || servicingProjectionStatus === 'servicing_record_unavailable';
  const lifecycleMilestones: ServicingLifecycleMilestone[] = [
    milestone('application', 'Application / underwriting package', (input?.packageGeneratedAt ?? input?.memoGeneratedAt) !== undefined),
    milestone('approval', 'Approval', input?.approvedAmount !== undefined || /approv/i.test(`${input?.status ?? ''} ${input?.stage ?? ''}`)),
    milestone('close', 'Close', (input?.actualCloseDate ?? input?.closeDate) !== undefined),
    milestone('boarding_review', 'Boarding review (read-only)', reviewReady),
  ].filter((m) => m.present);

  return {
    dealId: dealRef,
    dealName: text(input?.dealName, dealRef.length > 0 ? dealRef : 'unavailable'),
    clientName: text(input?.clientName, 'Unknown client'),
    borrowerLabel,
    bankerName: text(input?.bankerName, 'Unassigned'),
    servicingProjectionStatus,
    servicingProjectionLabel: STATUS_LABELS[servicingProjectionStatus],
    boardingReadiness,
    loanSnapshot,
    lifecycleMilestones,
    missingServicingFields,
    warnings,
    nextReadOnlyReviewStep: NEXT_STEPS[servicingProjectionStatus],
    servicingReferencePresent,
    readOnly: true,
    liveServicingSyncPerformed: false,
    coreBankingSyncPerformed: false,
    loanBoarded: false,
    paymentScheduleGenerated: false,
    externalSystemChanged: false,
  };
}

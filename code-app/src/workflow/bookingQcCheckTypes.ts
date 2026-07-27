/**
 * Final LOS Completion arc — Workstream H. Durable Booking QC Check record.
 *
 * Closes the CLOSING_FUNDING:booking_qc untracked() gap in loanWorkflowRequirementRegistry.ts —
 * confirmed by direct search (see docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md) that no
 * "booking QC"/"quality control" concept existed anywhere in this codebase before this record.
 * Append-only: a FAILED check can be re-run and superseded by a later PASSED/WAIVED one via
 * `supersedesCheckId`, never mutating the prior row.
 */

export type BookingQcStatus = 'PASSED' | 'FAILED' | 'WAIVED';

export const BOOKING_QC_STATUSES: readonly BookingQcStatus[] = ['PASSED', 'FAILED', 'WAIVED'];

/** Statuses that satisfy the requirement — a FAILED check does NOT clear it. */
export const AFFIRMATIVE_BOOKING_QC_STATUSES: ReadonlySet<BookingQcStatus> = new Set(['PASSED', 'WAIVED']);

export interface BookingQcCheckRecord {
  readonly checkId: string;
  readonly dealId: string;
  readonly status: BookingQcStatus;
  /** REQUIRED — a blank notes field is denied by submitBookingQcCheckAction() before any write is
   *  attempted; describes what was reviewed and the outcome. */
  readonly notes: string;
  readonly reviewedByActorEmail: string;
  readonly reviewedAtIso: string;
  readonly correlationId: string;
  readonly supersedesCheckId: string | undefined;
}

export interface BookingQcReadiness {
  /** CLOSING_FUNDING:booking_qc */
  readonly bookingQcComplete: { readonly met: boolean; readonly reason: string };
  /** The head-of-chain record, if any (for downstream display). */
  readonly currentCheck: BookingQcCheckRecord | undefined;
}

const NOT_MET = {
  met: false,
  reason: 'Booking quality control has not been completed for this deal.',
} as const;

/**
 * Resolves the head-of-chain record via the append-only chain's structural linkage
 * (`supersedesCheckId`), NOT by comparing timestamps — same discipline
 * `evaluateCommitmentReadiness` / `evaluateConditionVerificationReadiness` /
 * `evaluateExecutedDocumentAttestationReadiness` use.
 */
function headOfChain(records: readonly BookingQcCheckRecord[]): BookingQcCheckRecord | undefined {
  const supersededIds = new Set(
    records.map((r) => r.supersedesCheckId).filter((id): id is string => Boolean(id)),
  );
  const heads = records.filter((r) => !supersededIds.has(r.checkId));
  return [...heads].sort((a, b) => (b.reviewedAtIso ?? '').localeCompare(a.reviewedAtIso ?? ''))[0];
}

/**
 * Fail-closed Booking QC readiness (Final LOS Completion arc, Workstream H/K). Never fabricates a
 * check: an empty list, a deal-id mismatch, or a head record whose status is FAILED all fail closed
 * as not-met.
 */
export function evaluateBookingQcReadiness(
  records: readonly BookingQcCheckRecord[] | undefined,
  expectedDealId: string,
): BookingQcReadiness {
  const forDeal = (records ?? []).filter((r) => r.dealId === expectedDealId);
  const current = headOfChain(forDeal);
  const met = current !== undefined && AFFIRMATIVE_BOOKING_QC_STATUSES.has(current.status);
  return {
    bookingQcComplete: met ? { met: true, reason: '' } : NOT_MET,
    currentCheck: current,
  };
}

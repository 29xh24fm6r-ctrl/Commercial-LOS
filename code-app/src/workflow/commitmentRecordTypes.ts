/**
 * Final LOS Completion arc — Workstream D. Durable Commitment Record.
 *
 * Closes the COMMITMENT:commitment_issued / :borrower_acceptance untracked() gaps in
 * loanWorkflowRequirementRegistry.ts — until now neither the issuance of a commitment letter nor
 * the borrower's acceptance of it was persisted as its own record; this is that record.
 *
 * Append-only, same discipline as creditApprovalDecisionTypes.ts / fundingAuthorizationTypes.ts /
 * closingDocumentTypes.ts: ISSUED records the letter going out; a later ACCEPTED/DECLINED/EXPIRED/
 * WITHDRAWN record captures the outcome (never mutating the ISSUED row), optionally chained via
 * supersedesCommitmentId when a commitment is re-issued after a decline/expiration.
 */

export type CommitmentStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'WITHDRAWN'
  | 'SUPERSEDED';

export const COMMITMENT_STATUSES: readonly CommitmentStatus[] = [
  'DRAFT',
  'ISSUED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
  'SUPERSEDED',
];

/** Statuses a banker can directly RECORD via submitCommitmentAction (DRAFT/SUPERSEDED are
 *  administrative states this action never writes directly). */
export const RECORDABLE_COMMITMENT_STATUSES: ReadonlySet<CommitmentStatus> = new Set([
  'ISSUED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
]);

/** The subset of RECORDABLE_COMMITMENT_STATUSES that represent a borrower RESPONSE to an
 *  already-issued commitment, as opposed to the issuance itself. */
export const RESPONSE_COMMITMENT_STATUSES: ReadonlySet<CommitmentStatus> = new Set([
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
]);

export interface CommitmentRecord {
  readonly commitmentId: string;
  readonly dealId: string;
  readonly status: CommitmentStatus;
  readonly approvedAmount: number | undefined;
  readonly approvedProduct: string | undefined;
  readonly approvedTermMonths: number | undefined;
  readonly approvedPricing: string | undefined;
  /** REQUIRED on ISSUED — a blank key-terms summary is denied by submitCommitmentAction() before
   *  any write is attempted. */
  readonly keyTermsSummary: string;
  readonly expirationDateIso: string | undefined;
  readonly issuedByActorEmail: string;
  readonly issuedAtIso: string;
  readonly respondedByActorEmail: string | undefined;
  readonly respondedAtIso: string | undefined;
  /** Populated only when status === 'DECLINED'. */
  readonly declineReason: string | undefined;
  readonly correlationId: string;
  readonly supersedesCommitmentId: string | undefined;
}

export interface CommitmentDeepFactReadiness {
  readonly met: boolean;
  /** Policy-safe reason when not met (empty when met). */
  readonly reason: string;
}

export interface CommitmentReadiness {
  /** COMMITMENT:commitment_issued — an ISSUED (or later ACCEPTED) commitment exists for this exact
   *  deal. */
  readonly commitmentIssued: CommitmentDeepFactReadiness;
  /** COMMITMENT:borrower_acceptance — the borrower's acceptance has been durably recorded
   *  (status === 'ACCEPTED') for this exact deal. */
  readonly borrowerAcceptance: CommitmentDeepFactReadiness;
  /** The most recent ISSUED-or-later record, if any (for downstream display). */
  readonly currentCommitment: CommitmentRecord | undefined;
  /** The most recent ACCEPTED record, if any (may differ from currentCommitment if a later
   *  commitment was re-issued and not yet responded to). */
  readonly acceptedCommitment: CommitmentRecord | undefined;
}

const NOT_ISSUED: CommitmentDeepFactReadiness = {
  met: false,
  reason: 'No commitment letter has been issued for this deal.',
};

const NOT_ACCEPTED: CommitmentDeepFactReadiness = {
  met: false,
  reason: 'The borrower has not yet accepted a commitment for this deal.',
};

/**
 * Fail-closed Commitment readiness (Final LOS Completion arc, Workstream D/K). Never fabricates a
 * commitment: an empty list or a deal-id mismatch fails closed as not-met.
 *
 * `currentCommitment` is resolved via the append-only chain's structural linkage
 * (`supersedesCommitmentId`), NOT by comparing timestamps: the head of the chain is whichever
 * record is never referenced as another record's `supersedesCommitmentId`. Two records minted in
 * the same request (e.g. an ISSUE immediately followed by an ACCEPT) can carry timestamps with
 * insufficient resolution to disambiguate order reliably; the chain link is exact. Falls back to
 * the most recently issued record only to break a tie among multiple heads, which a correct linear
 * history never produces.
 */
export function evaluateCommitmentReadiness(
  commitments: readonly CommitmentRecord[] | undefined,
  expectedDealId: string,
): CommitmentReadiness {
  const forDeal = (commitments ?? []).filter((c) => c.dealId === expectedDealId);
  const supersededIds = new Set(
    forDeal.map((c) => c.supersedesCommitmentId).filter((id): id is string => Boolean(id)),
  );
  const heads = forDeal.filter((c) => !supersededIds.has(c.commitmentId));
  const issuedOrLaterHeads = heads.filter(
    (c) => c.status === 'ISSUED' || RESPONSE_COMMITMENT_STATUSES.has(c.status),
  );
  const currentCommitment = [...issuedOrLaterHeads].sort((a, b) =>
    (b.issuedAtIso ?? '').localeCompare(a.issuedAtIso ?? ''),
  )[0];

  const acceptedCommitment = currentCommitment?.status === 'ACCEPTED' ? currentCommitment : undefined;

  return {
    commitmentIssued: currentCommitment ? { met: true, reason: '' } : NOT_ISSUED,
    borrowerAcceptance: acceptedCommitment ? { met: true, reason: '' } : NOT_ACCEPTED,
    currentCommitment,
    acceptedCommitment,
  };
}

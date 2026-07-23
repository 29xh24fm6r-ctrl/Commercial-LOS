/**
 * final-seven-workstreams Workstream 7 — Funding Authorization Framework.
 *
 * Funding authorization is CONFIRMED GENUINELY MISSING: reaching the CLOSING_FUNDING stage is a
 * workflow-stage LABEL only — no module anywhere in this app models a separate, governed decision
 * of "this specific disbursement is authorized." This framework builds that missing control layer.
 *
 * It performs NO actual money movement and issues NO instruction to any payment rail — it is a
 * data/control layer that decides, records, and audits WHETHER a disbursement is authorized. A
 * `FUNDED` status here means "the bank's own governed process confirmed disbursement occurred,"
 * recorded after the fact by an operator — it never itself initiates a wire, ACH, or check.
 */

export type FundingAuthorizationStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'BLOCKED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED'
  | 'FUNDED'
  | 'CANCELLED';

/**
 * Terminal statuses: no further governed transition is legal from any of these. REVOKED is
 * terminal by design — re-authorizing after a revoke requires a fresh request (a new record that
 * `supersedesRecordId`s the revoked one), never resurrecting the revoked record itself. This keeps
 * authorization history immutable and matches the same supersession discipline as the
 * closing-document generation framework (Workstream 6).
 */
export const FUNDING_TERMINAL_STATUSES: ReadonlySet<FundingAuthorizationStatus> = new Set([
  'REJECTED',
  'REVOKED',
  'FUNDED',
  'CANCELLED',
]);

export interface FundingException {
  readonly id: string;
  readonly description: string;
  readonly resolved: boolean;
}

/**
 * The full funding-authorization record. Every field the spec names is present. `exceptions` and
 * `conditionsSatisfied` are honest facts this framework reads, not something it can independently
 * verify against Dataverse — callers must supply real, current values (see fundingReadiness.ts).
 */
export interface FundingAuthorizationRecord {
  readonly dealId: string;
  readonly authorizationStatus: FundingAuthorizationStatus;
  readonly requestedAmount: number;
  readonly approvedAmount?: number;
  readonly fundingDate?: string;
  readonly fundingMethod?: string;
  readonly destinationVerificationStatus: 'unverified' | 'verified' | 'failed';
  readonly conditionsSatisfied: boolean;
  readonly exceptions: readonly FundingException[];
  readonly authorizedBy?: string;
  readonly secondApprovedBy?: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly authorizedAt?: string;
  readonly correlationId: string;
  readonly supportingDocumentIds: readonly string[];
  readonly auditEventIds: readonly string[];
  /** Set only when this record supersedes a prior one (e.g. after a revoke-and-resubmit). Prior
   *  records are never mutated or deleted — see fundingAuthorizationPolicy.ts's history discipline. */
  readonly supersedesRecordId?: string;
  readonly recordId: string;
}

/** Facts needed to decide whether FUNDED can legally be reached — see fundingReadiness.ts. */
export interface FundingReadinessFacts {
  readonly requiredDocumentsComplete: boolean;
  readonly conditionsPrecedentResolved: boolean;
  readonly exceptionsAllResolved: boolean;
  readonly destinationVerified: boolean;
  readonly approvalExpired: boolean;
  readonly dealTerminalStatus: 'OPEN' | 'ON_HOLD' | 'DECLINED' | 'WITHDRAWN' | 'BOARDED';
}

/**
 * Document requirement lifecycle — pure state machine.
 *
 * Canonical lifecycle: Not Assessed -> Outstanding -> Requested -> Under
 * Review -> Reviewed, with governed alternate terminal states Waived and Not
 * Applicable, reachable from any pre-review state, and Reopen returning any
 * terminal state to Outstanding.
 *
 * "Received" is represented as an EVENT (the `cr664_receiveddate` timestamp,
 * stamped by the `receive` action), not a separate resting status: the moment
 * a document is received it is logically queued for review, so the `receive`
 * action's target status is `under_review` directly. This keeps a clean 1:1
 * mapping between each of the eight banker-facing actions and exactly one
 * status transition, while still recording the received timestamp as its own
 * persisted fact (so "received without reviewed" is fully expressible: status
 * `under_review`, `receivedDate` set, `reviewedDate` unset).
 *
 * A row with no persisted Dataverse record yet (a requirement the derivation
 * engine identified but nobody has acted on) is represented as a VIRTUAL row
 * in status `not_assessed`. It becomes a real persisted row the moment
 * `acknowledge` runs.
 */

export type DocumentRequirementStatus =
  | 'not_assessed'
  | 'outstanding'
  | 'requested'
  | 'under_review'
  | 'reviewed'
  | 'waived'
  | 'not_applicable';

export const GOVERNED_ALTERNATE_STATES: ReadonlySet<DocumentRequirementStatus> = new Set([
  'waived',
  'not_applicable',
]);

export type DocumentRequirementAction =
  | 'acknowledge'
  | 'request'
  | 'receive'
  | 'review'
  | 'return_for_correction'
  | 'waive'
  | 'mark_not_applicable'
  | 'reopen';

export const DOCUMENT_REQUIREMENT_ACTIONS: readonly DocumentRequirementAction[] = Object.freeze([
  'acknowledge',
  'request',
  'receive',
  'review',
  'return_for_correction',
  'waive',
  'mark_not_applicable',
  'reopen',
]);

/** The status(es) each action is a valid transition FROM. */
const VALID_FROM_STATES: Readonly<Record<DocumentRequirementAction, readonly DocumentRequirementStatus[]>> =
  Object.freeze({
    acknowledge: ['not_assessed'],
    request: ['outstanding'],
    receive: ['outstanding', 'requested'],
    review: ['under_review'],
    return_for_correction: ['under_review', 'reviewed'],
    waive: ['not_assessed', 'outstanding', 'requested'],
    mark_not_applicable: ['not_assessed', 'outstanding'],
    reopen: ['waived', 'not_applicable', 'reviewed'],
  });

/** The status each action transitions TO, once validated. */
const TARGET_STATE: Readonly<Record<DocumentRequirementAction, DocumentRequirementStatus>> = Object.freeze({
  acknowledge: 'outstanding',
  request: 'requested',
  receive: 'under_review',
  review: 'reviewed',
  return_for_correction: 'requested',
  waive: 'waived',
  mark_not_applicable: 'not_applicable',
  reopen: 'outstanding',
});

export type LifecycleTransitionResult =
  | { readonly ok: true; readonly nextStatus: DocumentRequirementStatus }
  | { readonly ok: false; readonly reason: string };

/** Pure transition check — no IO, no dependency on a specific row's other fields. */
export function applyLifecycleAction(
  currentStatus: DocumentRequirementStatus,
  action: DocumentRequirementAction,
): LifecycleTransitionResult {
  const validFrom = VALID_FROM_STATES[action];
  if (!validFrom.includes(currentStatus)) {
    return {
      ok: false,
      reason: `Cannot "${action}" a requirement in status "${currentStatus}"; valid from: ${validFrom.join(', ')}.`,
    };
  }
  return { ok: true, nextStatus: TARGET_STATE[action] };
}

/** The action buttons a valid-state UI should offer for a given current status. */
export function validActionsForStatus(
  status: DocumentRequirementStatus,
): readonly DocumentRequirementAction[] {
  switch (status) {
    case 'not_assessed':
      return ['acknowledge', 'waive', 'mark_not_applicable'];
    case 'outstanding':
      return ['request', 'receive', 'waive', 'mark_not_applicable'];
    case 'requested':
      return ['receive', 'waive'];
    case 'under_review':
      return ['review', 'return_for_correction'];
    case 'reviewed':
      return ['return_for_correction', 'reopen'];
    case 'waived':
      return ['reopen'];
    case 'not_applicable':
      return ['reopen'];
    default:
      return [];
  }
}

/**
 * A row counts as a live deal blocker when it is required and has not yet
 * cleared review (and has not been governed-excused via waiver / N/A).
 * Acknowledging a requirement moves it from `not_assessed` to `outstanding`
 * but deliberately does NOT clear this — acknowledgment records recognition
 * of the obligation, not satisfaction of it.
 */
export function isBlockingRequirementStatus(status: DocumentRequirementStatus): boolean {
  return (
    status === 'not_assessed' ||
    status === 'outstanding' ||
    status === 'requested' ||
    status === 'under_review'
  );
}

/** Whether "received" alone satisfies a requirement, or a completed review is required. */
export type DocumentRequirementReviewLevel = 'received' | 'reviewed';

export interface DocumentRequirementRow {
  /** Undefined for a virtual row the derivation engine identified but nobody has acted on yet. */
  readonly id: string | undefined;
  readonly documentName: string;
  readonly status: DocumentRequirementStatus;
  readonly required: boolean;
  readonly acknowledged: boolean;
  readonly acknowledgedBy: string | undefined;
  readonly acknowledgedDate: string | undefined;
  readonly requestedDate: string | undefined;
  readonly receivedDate: string | undefined;
  /**
   * Resolved cr664_user row id of whoever ran `receive` — the segregation-
   * of-duties fact `review` checks against. Optional so existing hand-built
   * `DocumentRequirementRow` test fixtures keep compiling without edits;
   * `documentRequirementReconciliation.ts`, the one real producer, always
   * sets it (undefined for a legacy row that predates this fact).
   */
  readonly receivedBy?: string | undefined;
  readonly reviewedDate: string | undefined;
  readonly reviewer: string | undefined;
  readonly waived: boolean;
  readonly waiverReason: string | undefined;
  readonly dueDate: string | undefined;
}

/** "Required — Outstanding" / "Waived" / "Not Applicable" etc. — the banker-facing label. */
export function describeRequirementStatus(row: Pick<DocumentRequirementRow, 'required' | 'status'>): string {
  if (!row.required) return 'Not Required';
  switch (row.status) {
    case 'not_assessed':
      return 'Required — Not Assessed';
    case 'outstanding':
      return 'Required — Outstanding';
    case 'requested':
      return 'Required — Requested';
    case 'under_review':
      return 'Required — Under Review';
    case 'reviewed':
      return 'Required — Reviewed';
    case 'waived':
      return 'Waived';
    case 'not_applicable':
      return 'Not Applicable';
    default:
      return 'Required';
  }
}

/** True once a required row has cleared review, or been governed-excused. */
/**
 * Whether a row currently satisfies its requirement — the real blocker gate.
 * `reviewLevel` (from the derivation engine's `RequiredDocumentDefinition`)
 * decides whether `under_review` (received, not yet reviewed) alone is
 * enough, or whether a completed `reviewed` is required. Defaults to
 * `'reviewed'` — the stricter, fail-closed default — when the caller doesn't
 * know the document's review level.
 */
export function isRequirementSatisfied(
  row: Pick<DocumentRequirementRow, 'required' | 'status'>,
  reviewLevel: DocumentRequirementReviewLevel = 'reviewed',
): boolean {
  if (!row.required) return true;
  if (row.status === 'under_review') return reviewLevel === 'received';
  return !isBlockingRequirementStatus(row.status);
}

/**
 * Governed write for the document requirement lifecycle (Acknowledge
 * Required, Request Document, Mark Received, Mark Reviewed, Return for
 * Correction, Waive, Mark Not Applicable, Reopen) — one dependency-injected
 * action for all eight, sharing the same three-write coordination every other
 * governed write in this module family uses:
 *
 *   1. Create (acknowledge only, when no row exists yet) or update the
 *      cr664_documentchecklist row's requirement fields.
 *   2. Emit cr664_AuditEvent.
 *   3. Emit cr664_DealTimelineEvent.
 *
 * Every transition is validated against the pure state machine
 * (documentRequirementLifecycle.ts) BEFORE any write — an invalid transition
 * never reaches the transport. Acknowledge and Waive persist an
 * actor-identity lookup (cr664_AcknowledgedBy -> cr664_user) and fail closed
 * if the actor cannot be resolved; every other action still audits with a
 * best-effort resolved actor but does not require the lookup to succeed to
 * persist the transition itself, matching this codebase's established
 * actor-resolution posture elsewhere (documentActions.ts).
 *
 * Duplicate-safety for `acknowledge` is two-layered: the pure transition
 * guard (acknowledge is valid ONLY from `not_assessed`) catches a stale UI
 * state, and a server-side `findRowByName` read-before-write catches a race
 * (two clicks, two bankers) by reusing whatever row already exists instead of
 * creating a second one — reported honestly as `already-acknowledged`, never
 * a silent duplicate.
 *
 * Pure over injected `deps` (SDK-free static graph) — the live wiring lives
 * in documentRequirementLiveDeps.ts, mirroring documentUploadLiveDeps.ts /
 * checklistLiveWriteDeps.ts.
 */

import { newCorrelationId } from '../shared/governance/correlationId';
import type { ActorChangedByResolution, ResolveActorChangedBy } from './newDealAuditActorResolver';
import {
  applyLifecycleAction,
  type DocumentRequirementAction,
  type DocumentRequirementStatus,
} from './documentRequirementLifecycle';

/** Persisted cr664_requirementstatus option-set values. */
export const REQUIREMENT_STATUS_CODES: Readonly<Record<DocumentRequirementStatus, number>> = Object.freeze({
  not_assessed: 788190100,
  outstanding: 788190101,
  requested: 788190102,
  under_review: 788190103,
  reviewed: 788190104,
  waived: 788190105,
  not_applicable: 788190106,
});

const STATUS_BY_CODE: ReadonlyMap<number, DocumentRequirementStatus> = new Map(
  Object.entries(REQUIREMENT_STATUS_CODES).map(([status, code]) => [code, status as DocumentRequirementStatus]),
);

/** Reverse lookup for reading a persisted cr664_requirementstatus value back off a live row. */
export function requirementStatusFromCode(code: number | undefined): DocumentRequirementStatus | undefined {
  if (code === undefined) return undefined;
  return STATUS_BY_CODE.get(code);
}

/** Actions that persist an actor-identity lookup and therefore fail closed on an unresolved actor. */
const IDENTITY_BOUND_ACTIONS: ReadonlySet<DocumentRequirementAction> = new Set(['acknowledge', 'waive']);

export type DocumentRequirementActionOutcome =
  | { kind: 'success'; documentId: string; status: DocumentRequirementStatus }
  | { kind: 'already-acknowledged'; documentId: string }
  | { kind: 'invalid-transition'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'unauthorized'; message: string }
  | { kind: 'write-failed'; error: string }
  | { kind: 'governance-partial'; auditError: string | undefined; timelineError: string | undefined }
  | { kind: 'dependency_not_ready'; detail: string }
  | { kind: 'unknown'; message: string };

export interface DocumentRequirementActionInput {
  readonly action: DocumentRequirementAction;
  readonly dealId: string;
  /** Existing row id. Undefined only for `acknowledge` against a virtual (not-yet-persisted) requirement. */
  readonly documentId: string | undefined;
  readonly documentName: string;
  /** The row's CURRENT status, from the caller's already-reconciled read — never re-derived here. */
  readonly currentStatus: DocumentRequirementStatus;
  readonly systemUserId: string | undefined;
  readonly actorEmail: string | undefined;
  /** Required for `review`. */
  readonly reviewerName?: string;
  /** Required for `waive`. */
  readonly waiverReason?: string;
}

export interface FindRowByNameResult {
  readonly ok: boolean;
  readonly row?: { readonly id: string; readonly acknowledged: boolean };
  readonly error?: string;
}
export interface CreateRowResult {
  readonly ok: boolean;
  readonly id?: string;
  readonly error?: string;
}
export interface WriteResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface DocumentRequirementAuditPayload {
  readonly action: DocumentRequirementAction;
  readonly dealId: string;
  readonly documentId: string;
  readonly documentName: string;
  readonly fromStatus: DocumentRequirementStatus;
  readonly toStatus: DocumentRequirementStatus;
  readonly waiverReason: string | undefined;
  readonly correlationId: string;
  readonly nowIso: string;
  readonly actor: ActorChangedByResolution;
}
export interface DocumentRequirementTimelinePayload {
  readonly action: DocumentRequirementAction;
  readonly dealId: string;
  readonly documentId: string;
  readonly documentName: string;
  readonly toStatus: DocumentRequirementStatus;
  readonly correlationId: string;
  readonly nowIso: string;
  readonly actor: ActorChangedByResolution;
}

export interface DocumentRequirementActionDeps {
  /** Finds an existing live row on this deal by normalized document name (acknowledge duplicate guard). */
  findRowByName(dealId: string, documentName: string): Promise<FindRowByNameResult>;
  /** Creates a new row (acknowledge only, when no matching row exists). */
  createRow(input: { dealId: string; documentName: string; fields: Record<string, unknown> }): Promise<CreateRowResult>;
  /** Updates an existing row by id. */
  updateRow(documentId: string, fields: Record<string, unknown>): Promise<WriteResult>;
  resolveActorChangedBy: ResolveActorChangedBy;
  emitAudit(payload: DocumentRequirementAuditPayload): Promise<{ ok: boolean; error?: string }>;
  emitTimeline(payload: DocumentRequirementTimelinePayload): Promise<{ ok: boolean; error?: string }>;
}

/** Builds the exact field payload for one action's transition. `null` clears a field (return_for_correction / reopen). */
function fieldsForAction(
  action: DocumentRequirementAction,
  nextStatus: DocumentRequirementStatus,
  ctx: { reviewerName: string | undefined; waiverReason: string | undefined; acknowledgedByBind: string | undefined; nowIso: string },
): Record<string, unknown> {
  const base: Record<string, unknown> = { cr664_requirementstatus: REQUIREMENT_STATUS_CODES[nextStatus] };
  switch (action) {
    case 'acknowledge':
      return {
        ...base,
        cr664_required: true,
        cr664_acknowledged: true,
        cr664_acknowledgeddate: ctx.nowIso,
        ...(ctx.acknowledgedByBind ? { 'cr664_AcknowledgedBy@odata.bind': ctx.acknowledgedByBind } : {}),
      };
    case 'request':
      return { ...base, cr664_requestdate: ctx.nowIso };
    case 'receive':
      return { ...base, cr664_receiveddate: ctx.nowIso };
    case 'review':
      return { ...base, cr664_revieweddate: ctx.nowIso, cr664_reviewer: ctx.reviewerName };
    case 'return_for_correction':
      return { ...base, cr664_receiveddate: null, cr664_revieweddate: null, cr664_reviewer: null };
    case 'waive':
      return { ...base, cr664_waived: true, cr664_waiverreason: ctx.waiverReason };
    case 'mark_not_applicable':
      return { ...base, cr664_required: false };
    case 'reopen':
      return { ...base, cr664_waived: false, cr664_waiverreason: null, cr664_required: true };
    default:
      return base;
  }
}

function validateActionInput(input: DocumentRequirementActionInput): string | undefined {
  if (input.action === 'waive' && (input.waiverReason ?? '').trim().length === 0) {
    return 'A waiver reason is required.';
  }
  if (input.action === 'review' && (input.reviewerName ?? '').trim().length === 0) {
    return 'A reviewer name is required.';
  }
  if (input.action !== 'acknowledge' && !input.documentId) {
    return 'No document id to update.';
  }
  return undefined;
}

export async function performDocumentRequirementAction(
  input: DocumentRequirementActionInput,
  deps?: DocumentRequirementActionDeps,
): Promise<DocumentRequirementActionOutcome> {
  if (!input.systemUserId) {
    return { kind: 'unauthorized', message: 'Actor is not authorized.' };
  }
  if (!deps) {
    return { kind: 'dependency_not_ready', detail: 'No live requirement-action dependency injected.' };
  }

  const invalidInput = validateActionInput(input);
  if (invalidInput) return { kind: 'invalid-input', reason: invalidInput };

  const transition = applyLifecycleAction(input.currentStatus, input.action);
  if (!transition.ok) return { kind: 'invalid-transition', reason: transition.reason };

  const nowIso = new Date().toISOString();
  const correlationId = newCorrelationId('dreq');
  const actor = await deps.resolveActorChangedBy(input.actorEmail);

  if (IDENTITY_BOUND_ACTIONS.has(input.action) && (!actor.ok || !actor.changedByBind)) {
    return { kind: 'unauthorized', message: `Actor identity could not be resolved: ${actor.reason ?? 'unknown'}.` };
  }

  let documentId = input.documentId;

  if (input.action === 'acknowledge') {
    const existing = await deps.findRowByName(input.dealId, input.documentName);
    if (!existing.ok) {
      return { kind: 'write-failed', error: existing.error ?? 'Could not check for an existing row.' };
    }
    if (existing.row) {
      // Duplicate-safe: a row already exists for this document on this deal — never
      // create a second one. If it's already acknowledged, this is a genuine duplicate
      // click/race; report it honestly rather than faking a fresh acknowledgment.
      if (existing.row.acknowledged) {
        return { kind: 'already-acknowledged', documentId: existing.row.id };
      }
      documentId = existing.row.id;
    }
  }

  const fields = fieldsForAction(input.action, transition.nextStatus, {
    reviewerName: input.reviewerName,
    waiverReason: input.waiverReason,
    acknowledgedByBind: actor.ok ? actor.changedByBind : undefined,
    nowIso,
  });

  if (input.action === 'acknowledge' && !documentId) {
    const create = await deps.createRow({ dealId: input.dealId, documentName: input.documentName, fields });
    if (!create.ok || !create.id) {
      return { kind: 'write-failed', error: create.error ?? 'Could not create the requirement row.' };
    }
    documentId = create.id;
  } else {
    if (!documentId) return { kind: 'invalid-input', reason: 'No document id to update.' };
    const update = await deps.updateRow(documentId, fields);
    if (!update.ok) {
      return { kind: 'write-failed', error: update.error ?? 'Could not update the requirement row.' };
    }
  }

  const [audit, timeline] = await Promise.all([
    deps.emitAudit({
      action: input.action,
      dealId: input.dealId,
      documentId,
      documentName: input.documentName,
      fromStatus: input.currentStatus,
      toStatus: transition.nextStatus,
      waiverReason: input.waiverReason,
      correlationId,
      nowIso,
      actor,
    }),
    deps.emitTimeline({
      action: input.action,
      dealId: input.dealId,
      documentId,
      documentName: input.documentName,
      toStatus: transition.nextStatus,
      correlationId,
      nowIso,
      actor,
    }),
  ]);

  if (!audit.ok || !timeline.ok) {
    return {
      kind: 'governance-partial',
      auditError: audit.ok ? undefined : audit.error,
      timelineError: timeline.ok ? undefined : timeline.error,
    };
  }

  return { kind: 'success', documentId, status: transition.nextStatus };
}

import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';
import { timelineEventByBind } from '../deals/timelineActorBind';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import {
  EXECUTED_DOCUMENT_CERTIFICATION_STATUSES,
  evaluateExecutedDocumentAttestationReadiness,
  type ExecutedDocumentAttestationRecord,
  type ExecutedDocumentAttestationStatus,
} from '../workflow/executedDocumentAttestationTypes';
import type { ExecutedDocumentAttestationStoreDeps } from './executedDocumentAttestationStore';

/**
 * Final LOS Completion arc — Workstream F. The governed write that turns a closer's attestation
 * that loan documents were executed (signed) into a DURABLE Executed Document Attestation record
 * — closing the CLOSING_FUNDING:executed_docs untracked() gap (see
 * loanWorkflowRequirementRegistry.ts). Previously this fact was never persisted at all.
 *
 * Enforcement, in order, all fail-closed:
 *   1. status must be a real recognized value (ATTESTED / REVOKED).
 *   2. executedDateIso and notes must not be blank.
 *   3. The record is written via the injected store; a write failure is fail-closed and every raw
 *      transport error is mapped through mapBusinessSafeError before reaching the caller.
 *   4. Audit + timeline are emitted in parallel; either failing flips the outcome to
 *      governance-partial (the record IS persisted) — same four-branch shape every other governed
 *      write in this codebase uses.
 *
 * A correction (e.g. revoking a mistaken attestation, or re-attesting after a revoke) is
 * automatically chained via `supersedesAttestationId` to the current head-of-chain record for
 * that deal, if any — same append-only discipline `submitCommitmentAction.ts` /
 * `submitConditionVerificationAction.ts` use.
 */

export type SubmitExecutedDocumentAttestationOutcome =
  | { readonly kind: 'success'; readonly record: ExecutedDocumentAttestationRecord }
  | {
      readonly kind: 'governance-partial';
      readonly record: ExecutedDocumentAttestationRecord;
      readonly auditError: string | undefined;
      readonly timelineError: string | undefined;
    }
  | { readonly kind: 'write-failed'; readonly error: string }
  | { readonly kind: 'invalid-input'; readonly message: string };

export interface SubmitExecutedDocumentAttestationInput {
  readonly dealId: string;
  readonly status: ExecutedDocumentAttestationStatus;
  readonly executedDateIso: string;
  readonly notes: string;
  readonly actorEmail: string;
  readonly systemUserId: string;
}

async function emitAuditEvent(opts: {
  input: SubmitExecutedDocumentAttestationInput;
  attestationId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
  notes: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
  const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
  const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
  const payload = {
    cr664_auditeventname: 'ExecutedDocumentAttestation Recorded',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.attestationId,
    cr664_relatedentitytype: 'cr664_executeddocattestation',
    cr664_relatedentityid: opts.attestationId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_attestationstatus',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.status,
    cr664_beforestate: 'No executed-document attestation',
    cr664_afterstate: opts.input.status,
    cr664_notes: opts.notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/Closing/attest',
    cr664_correlationid: opts.correlationId,
  };
  try {
    const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return { id: undefined, error: result.error?.message ?? 'AuditEvent create returned non-success' };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

async function emitTimelineEvent(opts: {
  input: SubmitExecutedDocumentAttestationInput;
  attestationId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
  notes: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // 788190002 == NoteLogged (see src/deals/activityQueries.ts EVENT_TYPE_MAP) — reused with a
  // distinct eventsubtype convention (same discipline submitCommitmentAction.ts /
  // submitConditionVerificationAction.ts use), so no additive option-set migration is needed.
  const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
  const payload = {
    cr664_title: `Executed documents: ${opts.input.status.toLowerCase()}`,
    cr664_summary: opts.notes,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_executeddocattestation',
    cr664_relatedentityid: opts.attestationId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `executeddocs:${opts.input.status.toLowerCase()}|correlation:${opts.correlationId}`,
  };
  try {
    const { Cr664_dealtimelineeventsService } = await import('../generated/services/Cr664_dealtimelineeventsService');
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
    );
    if (!result.success) {
      return { id: undefined, error: result.error?.message ?? 'DealTimelineEvent create returned non-success' };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function submitExecutedDocumentAttestationAction(
  input: SubmitExecutedDocumentAttestationInput,
  store: ExecutedDocumentAttestationStoreDeps,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<SubmitExecutedDocumentAttestationOutcome> {
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }
  if (!EXECUTED_DOCUMENT_CERTIFICATION_STATUSES.includes(input.status)) {
    return { kind: 'invalid-input', message: `"${input.status}" is not a recognized attestation status.` };
  }
  const executedDateIso = input.executedDateIso.trim();
  if (executedDateIso.length === 0) {
    return { kind: 'invalid-input', message: 'An executed date is required to attest executed documents.' };
  }
  const notes = input.notes.trim();
  if (notes.length === 0) {
    return { kind: 'invalid-input', message: 'Notes are required to attest executed documents.' };
  }

  let existing: readonly ExecutedDocumentAttestationRecord[] = [];
  const existingRead = await store.listAttestationsForDeal(dealId);
  if (existingRead.success) {
    existing = existingRead.records ?? [];
  } else {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(existingRead.error ?? 'Could not read existing executed document attestations.').safeMessage,
    };
  }
  const readiness = evaluateExecutedDocumentAttestationReadiness(existing, dealId);
  const supersedesAttestationId = readiness.currentAttestation?.attestationId;

  const correlationId = newCorrelationId('edc');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);

  const record: ExecutedDocumentAttestationRecord = {
    attestationId: newCorrelationId('edc-rec'),
    dealId,
    status: input.status,
    executedDateIso,
    notes,
    attestedByActorEmail: input.actorEmail,
    attestedAtIso: nowIso,
    correlationId,
    supersedesAttestationId,
  };

  const written = await store.createAttestationRecord(record);
  if (!written.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(written.error ?? 'Executed document attestation create returned non-success.', correlationId).safeMessage,
    };
  }

  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      attestationId: record.attestationId,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
      notes,
    }),
    emitTimelineEvent({ input, attestationId: record.attestationId, actor, correlationId, nowIso, notes }),
  ]);

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      record,
      auditError: audit.error ? mapBusinessSafeError(audit.error, correlationId).safeMessage : undefined,
      timelineError: timeline.error ? mapBusinessSafeError(timeline.error, correlationId).safeMessage : undefined,
    };
  }

  return { kind: 'success', record };
}

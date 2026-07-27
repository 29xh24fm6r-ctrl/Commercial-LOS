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
  CONDITION_TYPES,
  CONDITION_VERIFICATION_STATUSES,
  evaluateConditionVerificationReadiness,
  type ConditionType,
  type ConditionVerificationRecord,
  type ConditionVerificationStatus,
} from '../workflow/conditionVerificationTypes';
import type { ConditionVerificationStoreDeps } from './conditionVerificationStore';

/**
 * Final LOS Completion arc — Workstream E. The governed write that turns a closer's/loan-ops
 * verification of a closing condition into a DURABLE Condition Verification Record — closing the
 * DOCUMENTATION:conditions_precedent / :collateral_verified / :insurance_verified untracked() gaps
 * (see loanWorkflowRequirementRegistry.ts). Previously none of the three was persisted at all.
 *
 * Enforcement, in order, all fail-closed:
 *   1. conditionType and status must be real recognized values.
 *   2. Notes must not be blank — describes what was verified/waived/failed and why.
 *   3. The record is written via the injected store; a write failure is fail-closed and every raw
 *      transport error is mapped through mapBusinessSafeError before reaching the caller.
 *   4. Audit + timeline are emitted in parallel; either failing flips the outcome to
 *      governance-partial (the record IS persisted) — same four-branch shape every other governed
 *      write in this codebase uses.
 *
 * A re-verification (e.g. clearing a condition that previously FAILED) is automatically chained via
 * `supersedesRecordId` to the current head-of-chain record for that (deal, conditionType) pair, if
 * any — same append-only discipline `submitCommitmentAction.ts` (Workstream D) uses.
 */

export type SubmitConditionVerificationOutcome =
  | { readonly kind: 'success'; readonly record: ConditionVerificationRecord }
  | {
      readonly kind: 'governance-partial';
      readonly record: ConditionVerificationRecord;
      readonly auditError: string | undefined;
      readonly timelineError: string | undefined;
    }
  | { readonly kind: 'write-failed'; readonly error: string }
  | { readonly kind: 'invalid-input'; readonly message: string };

export interface SubmitConditionVerificationInput {
  readonly dealId: string;
  readonly conditionType: ConditionType;
  readonly status: ConditionVerificationStatus;
  readonly notes: string;
  readonly actorEmail: string;
  readonly systemUserId: string;
}

async function emitAuditEvent(opts: {
  input: SubmitConditionVerificationInput;
  recordId: string;
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
    cr664_auditeventname: 'ConditionVerification Recorded',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.recordId,
    cr664_relatedentitytype: 'cr664_conditionverification',
    cr664_relatedentityid: opts.recordId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_verificationstatus',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.status,
    cr664_beforestate: `No ${opts.input.conditionType} verification`,
    cr664_afterstate: opts.input.status,
    cr664_notes: opts.notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/Documentation/verify',
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
  input: SubmitConditionVerificationInput;
  recordId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
  notes: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // 788190002 == NoteLogged (see src/deals/activityQueries.ts EVENT_TYPE_MAP) — reused with a
  // distinct eventsubtype convention (same discipline documentActions.ts's markDocumentReviewed and
  // submitCommitmentAction.ts use), so no additive option-set migration is needed on the live
  // environment.
  const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
  const payload = {
    cr664_title: `${opts.input.conditionType.replace(/_/g, ' ')}: ${opts.input.status.toLowerCase()}`,
    cr664_summary: opts.notes,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_conditionverification',
    cr664_relatedentityid: opts.recordId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `condition:${opts.input.conditionType.toLowerCase()}:${opts.input.status.toLowerCase()}|correlation:${opts.correlationId}`,
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

export async function submitConditionVerificationAction(
  input: SubmitConditionVerificationInput,
  store: ConditionVerificationStoreDeps,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<SubmitConditionVerificationOutcome> {
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }
  if (!CONDITION_TYPES.includes(input.conditionType)) {
    return { kind: 'invalid-input', message: `"${input.conditionType}" is not a recognized condition type.` };
  }
  if (!CONDITION_VERIFICATION_STATUSES.includes(input.status)) {
    return { kind: 'invalid-input', message: `"${input.status}" is not a recognized verification status.` };
  }
  const notes = input.notes.trim();
  if (notes.length === 0) {
    return { kind: 'invalid-input', message: 'Notes are required to record a condition verification.' };
  }

  let existing: readonly ConditionVerificationRecord[] = [];
  const existingRead = await store.listVerificationsForDeal(dealId);
  if (existingRead.success) {
    existing = existingRead.records ?? [];
  } else {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(existingRead.error ?? 'Could not read existing condition verifications.').safeMessage,
    };
  }
  const readiness = evaluateConditionVerificationReadiness(existing, dealId);
  const supersedesRecordId = readiness.currentRecords[input.conditionType]?.recordId;

  const correlationId = newCorrelationId('cv');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);

  const record: ConditionVerificationRecord = {
    recordId: newCorrelationId('cv-rec'),
    dealId,
    conditionType: input.conditionType,
    status: input.status,
    notes,
    verifiedByActorEmail: input.actorEmail,
    verifiedAtIso: nowIso,
    correlationId,
    supersedesRecordId,
  };

  const written = await store.createVerificationRecord(record);
  if (!written.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(written.error ?? 'Condition verification create returned non-success.', correlationId).safeMessage,
    };
  }

  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      recordId: record.recordId,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
      notes,
    }),
    emitTimelineEvent({ input, recordId: record.recordId, actor, correlationId, nowIso, notes }),
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

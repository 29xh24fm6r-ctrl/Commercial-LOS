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
  BOOKING_QC_STATUSES,
  evaluateBookingQcReadiness,
  type BookingQcCheckRecord,
  type BookingQcStatus,
} from '../workflow/bookingQcCheckTypes';
import type { BookingQcCheckStoreDeps } from './bookingQcCheckStore';
import {
  evaluateLifecycleBeforeWrite,
  type LifecycleGovernanceInvocation,
} from '../governance/lifecycleGovernanceIntegration';

/**
 * Final LOS Completion arc — Workstream H. The governed write that turns a loan-ops reviewer's
 * booking quality-control check into a DURABLE Booking QC Check record — closing the
 * CLOSING_FUNDING:booking_qc untracked() gap (see loanWorkflowRequirementRegistry.ts). Previously
 * this fact was never persisted at all.
 *
 * Enforcement, in order, all fail-closed:
 *   1. status must be a real recognized value (PASSED / FAILED / WAIVED).
 *   2. Notes must not be blank.
 *   3. The record is written via the injected store; a write failure is fail-closed and every raw
 *      transport error is mapped through mapBusinessSafeError before reaching the caller.
 *   4. Audit + timeline are emitted in parallel; either failing flips the outcome to
 *      governance-partial (the record IS persisted) — same four-branch shape every other governed
 *      write in this codebase uses.
 *
 * A re-check (e.g. correcting and re-reviewing after a FAILED result) is automatically chained via
 * `supersedesCheckId` to the current head-of-chain record for that deal, if any — same append-only
 * discipline `submitConditionVerificationAction.ts` / `submitExecutedDocumentAttestationAction.ts`
 * use.
 */

export type SubmitBookingQcCheckOutcome =
  | { readonly kind: 'success'; readonly record: BookingQcCheckRecord }
  | {
      readonly kind: 'governance-partial';
      readonly record: BookingQcCheckRecord;
      readonly auditError: string | undefined;
      readonly timelineError: string | undefined;
    }
  | { readonly kind: 'write-failed'; readonly error: string }
  | { readonly kind: 'invalid-input'; readonly message: string };

export interface SubmitBookingQcCheckInput {
  readonly dealId: string;
  readonly status: BookingQcStatus;
  readonly notes: string;
  readonly actorEmail: string;
  readonly systemUserId: string;
}

async function emitAuditEvent(opts: {
  input: SubmitBookingQcCheckInput;
  checkId: string;
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
    cr664_auditeventname: 'BookingQcCheck Recorded',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.checkId,
    cr664_relatedentitytype: 'cr664_bookingqccheck',
    cr664_relatedentityid: opts.checkId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_qcstatus',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.status,
    cr664_beforestate: 'No booking QC check',
    cr664_afterstate: opts.input.status,
    cr664_notes: opts.notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/ClosingFunding/bookingQc',
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
  input: SubmitBookingQcCheckInput;
  checkId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
  notes: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // 788190002 == NoteLogged (see src/deals/activityQueries.ts EVENT_TYPE_MAP) — reused with a
  // distinct eventsubtype convention (same discipline every other Final LOS Completion arc
  // governed write in this codebase uses), so no additive option-set migration is needed.
  const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
  const payload = {
    cr664_title: `Booking QC: ${opts.input.status.toLowerCase()}`,
    cr664_summary: opts.notes,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_bookingqccheck',
    cr664_relatedentityid: opts.checkId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `bookingqc:${opts.input.status.toLowerCase()}|correlation:${opts.correlationId}`,
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

export async function submitBookingQcCheckAction(
  input: SubmitBookingQcCheckInput,
  store: BookingQcCheckStoreDeps,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
  lifecycleGovernance?: LifecycleGovernanceInvocation,
): Promise<SubmitBookingQcCheckOutcome> {
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }
  if (!BOOKING_QC_STATUSES.includes(input.status)) {
    return { kind: 'invalid-input', message: `"${input.status}" is not a recognized QC status.` };
  }
  const notes = input.notes.trim();
  if (notes.length === 0) {
    return { kind: 'invalid-input', message: 'Notes are required to record a booking QC check.' };
  }

  const existingRead = await store.listChecksForDeal(dealId);
  if (!existingRead.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(existingRead.error ?? 'Could not read existing booking QC checks.').safeMessage,
    };
  }
  const existing: readonly BookingQcCheckRecord[] = existingRead.records ?? [];
  const readiness = evaluateBookingQcReadiness(existing, dealId);
  const supersedesCheckId = readiness.currentCheck?.checkId;

  const lifecycleGate = await evaluateLifecycleBeforeWrite(
    'closing',
    lifecycleGovernance,
    { allowed: true, evidenceIds: ['legacy-booking-qc-readiness'] },
  );
  if (!lifecycleGate.allowed) {
    return { kind: 'invalid-input', message: lifecycleGate.safeMessage };
  }

  const correlationId = newCorrelationId('qc');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);

  const record: BookingQcCheckRecord = {
    checkId: newCorrelationId('qc-rec'),
    dealId,
    status: input.status,
    notes,
    reviewedByActorEmail: input.actorEmail,
    reviewedAtIso: nowIso,
    correlationId,
    supersedesCheckId,
  };

  const written = await store.createCheckRecord(record);
  if (!written.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(written.error ?? 'Booking QC check create returned non-success.', correlationId).safeMessage,
    };
  }

  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      checkId: record.checkId,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
      notes,
    }),
    emitTimelineEvent({ input, checkId: record.checkId, actor, correlationId, nowIso, notes }),
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

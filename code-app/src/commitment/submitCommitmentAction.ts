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
import { evaluateCreditApprovalDecisionReadiness, type CreditApprovalDecisionRecord } from '../workflow/creditApprovalDecisionTypes';
import {
  evaluateCommitmentReadiness,
  RESPONSE_COMMITMENT_STATUSES,
  type CommitmentRecord,
  type CommitmentStatus,
} from '../workflow/commitmentRecordTypes';
import type { CommitmentStoreDeps } from './commitmentRecordStore';

/**
 * Final LOS Completion arc — Workstream D. The governed write that turns commitment issuance and
 * the borrower's response into DURABLE Commitment Records — closing the
 * COMMITMENT:commitment_issued / :borrower_acceptance untracked() gaps (see
 * loanWorkflowRequirementRegistry.ts). Previously neither event was persisted at all.
 *
 * Two distinct actions, both routed through this one governed write so every commitment event
 * shares the same audit/timeline/error-mapping discipline:
 *   - ISSUE: requires a durable APPROVED/APPROVED_WITH_CONDITIONS Credit Approval Decision already
 *     on file for this exact deal (evaluateCreditApprovalDecisionReadiness, Workstream C) — a
 *     commitment can never be issued ahead of a recorded credit decision — and a non-blank
 *     key-terms summary.
 *   - ACCEPT / DECLINE / EXPIRE / WITHDRAW: requires an existing ISSUED commitment pending a
 *     response for this exact deal (never a fabricated acceptance with nothing issued); DECLINE
 *     additionally requires a non-blank decline reason.
 *
 * Every write is fail-closed (never a fabricated success) and every raw transport error is mapped
 * through mapBusinessSafeError before reaching the caller. Audit + timeline are emitted in
 * parallel; either failing flips the outcome to governance-partial (the record IS persisted) — same
 * four-branch shape every other governed write in this codebase uses.
 */

export type CommitmentAction = 'ISSUE' | 'ACCEPT' | 'DECLINE' | 'EXPIRE' | 'WITHDRAW';

const ACTION_TO_STATUS: Record<CommitmentAction, CommitmentStatus> = {
  ISSUE: 'ISSUED',
  ACCEPT: 'ACCEPTED',
  DECLINE: 'DECLINED',
  EXPIRE: 'EXPIRED',
  WITHDRAW: 'WITHDRAWN',
};

export type SubmitCommitmentActionOutcome =
  | { readonly kind: 'success'; readonly record: CommitmentRecord }
  | {
      readonly kind: 'governance-partial';
      readonly record: CommitmentRecord;
      readonly auditError: string | undefined;
      readonly timelineError: string | undefined;
    }
  | { readonly kind: 'write-failed'; readonly error: string }
  | { readonly kind: 'invalid-input'; readonly message: string };

export interface SubmitCommitmentActionInput {
  readonly dealId: string;
  readonly action: CommitmentAction;
  readonly approvedAmount: number | undefined;
  readonly approvedProduct: string | undefined;
  readonly approvedTermMonths: number | undefined;
  readonly approvedPricing: string | undefined;
  /** REQUIRED on ISSUE only. */
  readonly keyTermsSummary: string | undefined;
  readonly expirationDateIso: string | undefined;
  /** REQUIRED on DECLINE only. */
  readonly declineReason: string | undefined;
  readonly actorEmail: string;
  readonly systemUserId: string;
  /** The deal's existing credit approval decisions — gates ISSUE (see class doc above). */
  readonly creditApprovalDecisions: readonly CreditApprovalDecisionRecord[] | undefined;
}

async function emitAuditEvent(opts: {
  input: SubmitCommitmentActionInput;
  commitmentId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
  status: CommitmentStatus;
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
    cr664_auditeventname: 'CommitmentRecord Recorded',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.commitmentId,
    cr664_relatedentitytype: 'cr664_commitmentrecord',
    cr664_relatedentityid: opts.commitmentId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_commitmentstatus',
    cr664_oldvalue: '',
    cr664_newvalue: opts.status,
    cr664_beforestate: 'No commitment action',
    cr664_afterstate: opts.status,
    cr664_notes: opts.notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/Commitment/act',
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
  input: SubmitCommitmentActionInput;
  commitmentId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
  status: CommitmentStatus;
  title: string;
  summary: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // 788190002 == NoteLogged (see src/deals/activityQueries.ts EVENT_TYPE_MAP) — reused with a
  // distinct eventsubtype convention (same discipline documentActions.ts's markDocumentReviewed
  // uses), so no additive option-set migration is needed on the live environment.
  const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
  const payload = {
    cr664_title: opts.title,
    cr664_summary: opts.summary,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_commitmentrecord',
    cr664_relatedentityid: opts.commitmentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `commitment:${opts.status.toLowerCase()}|correlation:${opts.correlationId}`,
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

export async function submitCommitmentAction(
  input: SubmitCommitmentActionInput,
  store: CommitmentStoreDeps,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<SubmitCommitmentActionOutcome> {
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }
  const status = ACTION_TO_STATUS[input.action];

  let existing: readonly CommitmentRecord[] = [];
  const existingRead = await store.listCommitmentsForDeal(dealId);
  if (existingRead.success) {
    existing = existingRead.commitments ?? [];
  } else if (input.action !== 'ISSUE') {
    // A response action MUST see the existing commitment to respond to one — if the read itself
    // failed we cannot honestly evaluate readiness, so fail closed rather than assume none exists.
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(existingRead.error ?? 'Could not read the existing commitment record.').safeMessage,
    };
  }

  let keyTermsSummary = '';
  let declineReason: string | undefined;
  let supersedesCommitmentId: string | undefined;

  if (input.action === 'ISSUE') {
    const approvalReadiness = evaluateCreditApprovalDecisionReadiness(input.creditApprovalDecisions, dealId);
    if (!approvalReadiness.decisionRecorded.met) {
      return {
        kind: 'invalid-input',
        message: 'A credit approval decision must be recorded before a commitment can be issued.',
      };
    }
    keyTermsSummary = (input.keyTermsSummary ?? '').trim();
    if (keyTermsSummary.length === 0) {
      return { kind: 'invalid-input', message: 'A key terms summary is required to issue a commitment.' };
    }
    const readiness = evaluateCommitmentReadiness(existing, dealId);
    supersedesCommitmentId = readiness.currentCommitment?.commitmentId;
  } else {
    const readiness = evaluateCommitmentReadiness(existing, dealId);
    if (!readiness.currentCommitment || readiness.currentCommitment.status !== 'ISSUED') {
      return {
        kind: 'invalid-input',
        message: 'No commitment is currently pending a response for this deal.',
      };
    }
    supersedesCommitmentId = readiness.currentCommitment.commitmentId;
    keyTermsSummary = readiness.currentCommitment.keyTermsSummary;
    if (input.action === 'DECLINE') {
      declineReason = (input.declineReason ?? '').trim();
      if (declineReason.length === 0) {
        return { kind: 'invalid-input', message: 'A decline reason is required to record a declined commitment.' };
      }
    }
  }

  const correlationId = newCorrelationId('cmt');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);
  const isResponse = RESPONSE_COMMITMENT_STATUSES.has(status);

  const record: CommitmentRecord = {
    commitmentId: newCorrelationId('cmt-rec'),
    dealId,
    status,
    approvedAmount: input.approvedAmount,
    approvedProduct: input.approvedProduct,
    approvedTermMonths: input.approvedTermMonths,
    approvedPricing: input.approvedPricing,
    keyTermsSummary,
    expirationDateIso: input.expirationDateIso,
    issuedByActorEmail: input.actorEmail,
    issuedAtIso: isResponse ? nowIso : nowIso,
    respondedByActorEmail: isResponse ? input.actorEmail : undefined,
    respondedAtIso: isResponse ? nowIso : undefined,
    declineReason,
    correlationId,
    supersedesCommitmentId,
  };

  const written = await store.createCommitmentRecord(record);
  if (!written.success) {
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(written.error ?? 'Commitment record create returned non-success.', correlationId).safeMessage,
    };
  }

  const notes = input.action === 'DECLINE' ? (declineReason ?? '') : keyTermsSummary;
  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      commitmentId: record.commitmentId,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
      status,
      notes,
    }),
    emitTimelineEvent({
      input,
      commitmentId: record.commitmentId,
      actor,
      correlationId,
      nowIso,
      status,
      title: `Commitment ${status.toLowerCase()}`,
      summary: notes,
    }),
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

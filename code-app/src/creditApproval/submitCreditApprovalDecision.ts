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
  evaluateCreditApprovalAuthority,
  describeCreditApprovalAuthorityReason,
  type BankerCreditAuthority,
} from '../workflow/creditApprovalAuthority';
import { DECISION_STATUSES, type CreditApprovalDecisionRecord, type CreditApprovalDecisionStatus } from '../workflow/creditApprovalDecisionTypes';
import type { CreditApprovalDecisionStoreDeps } from './creditApprovalDecisionStore';

/**
 * Final LOS Completion arc — Workstream C. The governed write that turns a credit-authority
 * holder's decision into a DURABLE Credit Approval Decision record — closing the
 * CREDIT_APPROVAL:approval_decision / :approval_authority / :approval_conditions untracked() gaps
 * (see loanWorkflowRequirementRegistry.ts). Previously a "decision" was only ever the side effect
 * of a stage transition; this is the first durable record of the decision itself (amount, product,
 * term, pricing, collateral, conditions, authority tier, rationale — the arc's ~20-field spec).
 *
 * Enforcement, in order, all fail-closed:
 *   1. decisionStatus must be a real DECISION status (RETURNED/APPROVED/APPROVED_WITH_CONDITIONS/
 *      DECLINED) — DRAFT/SUBMITTED/REVOKED/SUPERSEDED are administrative states this action never
 *      writes directly.
 *   2. Rationale must not be blank — a blank rationale is denied before any write is attempted
 *      (per the arc spec's explicit "blank-rationale denial" requirement).
 *   3. evaluateCreditApprovalAuthority() (creditApprovalAuthority.ts, already used to gate the
 *      CREDIT_APPROVAL stage-exit transition) — self-approval prevention, credit-committee
 *      membership, and individual approval-limit checks, reused here rather than re-implemented, so
 *      this record's authority basis and the stage-transition guard can never disagree.
 *   4. The record is written via the injected store (createDataverseCreditApprovalDecisionStore in
 *      production); a write failure is fail-closed (never a fabricated success) and every raw
 *      transport error is mapped through mapBusinessSafeError before reaching the caller.
 *   5. Audit + timeline are emitted in parallel; either failing flips the outcome to
 *      governance-partial (the decision record IS persisted) — same four-branch shape every other
 *      governed write in this codebase uses.
 */

export type SubmitCreditApprovalDecisionOutcome =
  | { readonly kind: 'success'; readonly record: CreditApprovalDecisionRecord }
  | {
      readonly kind: 'governance-partial';
      readonly record: CreditApprovalDecisionRecord;
      readonly auditError: string | undefined;
      readonly timelineError: string | undefined;
    }
  | { readonly kind: 'write-failed'; readonly error: string }
  | { readonly kind: 'authority-denied'; readonly reasonCode: string; readonly message: string }
  | { readonly kind: 'invalid-input'; readonly message: string };

export interface SubmitCreditApprovalDecisionInput {
  readonly dealId: string;
  readonly decisionStatus: CreditApprovalDecisionStatus;
  readonly approvedAmount: number | undefined;
  readonly approvedProduct: string | undefined;
  readonly approvedTermMonths: number | undefined;
  readonly approvedPricing: string | undefined;
  readonly collateralSummary: string | undefined;
  readonly conditions: readonly string[];
  readonly rationale: string;
  readonly requestedByActorEmail: string;
  /** Acting (deciding) banker's email — resolved fail-closed to the audit's REQUIRED
   *  cr664_ChangedBy, same discipline as every other governed write in this codebase. */
  readonly actorEmail: string;
  readonly systemUserId: string;
  /** Authority-check inputs — passed straight through to evaluateCreditApprovalAuthority(). */
  readonly actorResolved: boolean;
  readonly banker: BankerCreditAuthority | undefined;
  readonly dealAmount: number | undefined;
  readonly requestProfileAmount: number | undefined;
  readonly advancingActorBankerId?: string | undefined;
  readonly originatingBankerId?: string | undefined;
  readonly supersedesDecisionId?: string | undefined;
}

function authorityTierFor(banker: BankerCreditAuthority | undefined): string | undefined {
  if (!banker) return undefined;
  if (banker.approvalOverrideAuthority) return 'override';
  if (banker.creditCommitteeMember) return 'committee';
  return 'individual';
}

async function emitAuditEvent(opts: {
  input: SubmitCreditApprovalDecisionInput;
  decisionId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
  const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
  const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
  const payload = {
    cr664_auditeventname: 'CreditApprovalDecision Recorded',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.decisionId,
    cr664_relatedentitytype: 'cr664_creditapprovaldecision',
    cr664_relatedentityid: opts.decisionId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_decisionstatus',
    cr664_oldvalue: '',
    cr664_newvalue: opts.input.decisionStatus,
    cr664_beforestate: 'No decision',
    cr664_afterstate: opts.input.decisionStatus,
    cr664_notes: opts.input.rationale,
    cr664_sourcescreensourceprocess: 'DealWorkspace/CreditApproval/decide',
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
  input: SubmitCreditApprovalDecisionInput;
  decisionId: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // 788190013 == ApprovalDecision (see src/deals/activityQueries.ts EVENT_TYPE_MAP) — an existing
  // option-set value already reserved for exactly this moment; no additive migration needed.
  const TIMELINE_EVENT_TYPE_APPROVAL_DECISION = 788190013;
  const payload = {
    cr664_title: `Credit approval: ${opts.input.decisionStatus}`,
    cr664_summary: opts.input.rationale,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_APPROVAL_DECISION,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_creditapprovaldecision',
    cr664_relatedentityid: opts.decisionId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
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

export async function submitCreditApprovalDecision(
  input: SubmitCreditApprovalDecisionInput,
  store: CreditApprovalDecisionStoreDeps,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<SubmitCreditApprovalDecisionOutcome> {
  if (!DECISION_STATUSES.has(input.decisionStatus)) {
    return {
      kind: 'invalid-input',
      message: `"${input.decisionStatus}" is not a decision status this action can record directly.`,
    };
  }
  const rationale = input.rationale.trim();
  if (rationale.length === 0) {
    return { kind: 'invalid-input', message: 'A rationale is required to record a credit approval decision.' };
  }
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }

  const authority = evaluateCreditApprovalAuthority({
    actorResolved: input.actorResolved,
    banker: input.banker,
    dealAmount: input.dealAmount,
    requestProfileAmount: input.requestProfileAmount,
    advancingActorBankerId: input.advancingActorBankerId,
    originatingBankerId: input.originatingBankerId,
  });
  if (!authority.allowed) {
    return {
      kind: 'authority-denied',
      reasonCode: authority.reasonCode,
      message: describeCreditApprovalAuthorityReason(authority.reasonCode),
    };
  }

  const correlationId = newCorrelationId('ca');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);

  const record: CreditApprovalDecisionRecord = {
    decisionId: newCorrelationId('cad'),
    dealId,
    status: input.decisionStatus,
    approvedAmount: input.approvedAmount,
    approvedProduct: input.approvedProduct,
    approvedTermMonths: input.approvedTermMonths,
    approvedPricing: input.approvedPricing,
    collateralSummary: input.collateralSummary,
    conditions: input.conditions,
    authorityTier: authorityTierFor(input.banker),
    rationale,
    requestedByActorEmail: input.requestedByActorEmail,
    requestedAtIso: nowIso,
    decidedByActorEmail: input.actorEmail,
    decidedAtIso: nowIso,
    correlationId,
    supersedesDecisionId: input.supersedesDecisionId,
  };

  const written = await store.createDecisionRecord(record);
  if (!written.success) {
    // Final LOS Completion arc (Workstream P discipline applied from day one on this new write path)
    // — never render a raw transport error verbatim.
    return {
      kind: 'write-failed',
      error: mapBusinessSafeError(written.error ?? 'Credit approval decision create returned non-success.', correlationId).safeMessage,
    };
  }

  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      decisionId: record.decisionId,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
    }),
    emitTimelineEvent({ input, decisionId: record.decisionId, actor, correlationId, nowIso }),
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

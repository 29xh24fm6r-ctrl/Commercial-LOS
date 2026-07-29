import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from './newDealAuditActorResolver';
import { timelineEventByBind } from './timelineActorBind';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import { loadDealCreditMemo } from './creditMemoQueries';
import { currentCreditMemo } from '../workflow/creditMemoFinalizationReadiness';

/**
 * Final LOS Completion arc (Workstream 146-B) — governed credit memo
 * finalization. Closes the CREDIT_APPROVAL:memo_finalized untracked() gap:
 * until now nothing ever flipped cr664_creditmemo1's status past Draft, so
 * the deep fact the requirement engine needs (creditMemoFinalizationReadiness.ts)
 * could never become true.
 *
 * Same coordination shape as saveCreditMemoDraft (creditMemoActions.ts):
 *   1. Fresh, fail-closed re-read of the deal's memos (never trust the
 *      caller's in-memory snapshot — a second banker/tab could have saved a
 *      newer draft since this one loaded).
 *   2. Reject if the caller's memoId is not the CURRENT (highest-version)
 *      memo, or if that memo is not currently Draft (already Final, or
 *      Stale — a stale memo must get a new draft before it can be
 *      finalized).
 *   3. Update the row's cr664_status to Final.
 *   4. Audit + Timeline writes in parallel, tied by one correlation id.
 *
 * Deliberately does NOT re-run checkCreditMemoConsistency() as a gate — its
 * own header explicitly forbids treating its findings as anything but
 * advisory ("NO official 'validation' claim"); those findings remain a
 * separate, non-blocking display surface (the existing consistency-review
 * panel), not reinterpreted here as a hard block.
 *
 * Deliberately does NOT re-check UNDERWRITING:risk_rating / :uw_recommendation
 * here — those already hard-gate the Underwriting stage exit that precedes
 * Credit Approval; duplicating them inside this action would be redundant
 * with the existing stage-advance guard, not a new control.
 */

export interface FinalizeCreditMemoInput {
  dealId: string;
  /** Acting banker/credit-officer's email — resolved fail-closed to the
   *  audit's REQUIRED cr664_ChangedBy (a cr664_user lookup) via the
   *  platform-user bridge, exactly like saveCreditMemoDraft. */
  actorEmail: string;
  /** The memo id the caller believes is current (highest version, Draft).
   *  Re-verified server-side against a fresh read before any write. */
  memoId: string;
  /** Note recorded on the audit/timeline trail explaining the
   *  finalization. Required; empty/whitespace-only rejected. */
  finalizeNote: string;
}

export type FinalizeCreditMemoOutcome =
  | { kind: 'success'; memoId: string }
  | { kind: 'verification-failed'; memoId: string; error: string }
  | {
      kind: 'governance-partial';
      memoId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'write-failed'; error: string }
  | { kind: 'invalid-input'; message: string };

// Schema-verified enum constant (see ../generated/models/Cr664_creditmemo1sModel.ts).
const MEMO_STATUS_FINAL = 788190001;

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
const TIMELINE_SUBTYPE_CREDIT_MEMO_FINALIZED = 'creditmemo:finalized';

function persistedMemoMatchesFinal(
  row: { cr664_status?: unknown; cr664_memotext?: unknown } | undefined,
  expectedText: string | undefined,
): boolean {
  if (!row || Number(row.cr664_status) !== MEMO_STATUS_FINAL) return false;
  if (expectedText === undefined) return true;
  return row.cr664_memotext === expectedText;
}

/**
 * A draft's parent memo preview is persisted with explicit draft language.
 * Finalization must update that preview atomically with the status so a Final
 * row can never still tell the banker it is "not saved, not final".
 */
export function buildFinalizedMemoText(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/^# Credit Memo [—-] DRAFT PREVIEW/m, '# Credit Memo — FINAL')
    .replace(
      'Draft preview — not saved, not final, banker review required.',
      'Finalized credit memo — retained as the approved version.',
    )
    .replace(
      'End of draft preview. Not saved to Dataverse. Not exported. Not finalized.',
      'End of finalized credit memo.',
    );
}

async function emitAuditEvent(opts: {
  dealId: string;
  memoId: string;
  note: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Fail closed: never POST an audit row without a resolved cr664_user actor.
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const payload = {
    cr664_auditeventname: 'CreditMemo Finalized',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.memoId,
    cr664_relatedentitytype: 'cr664_creditmemo1',
    cr664_relatedentityid: opts.memoId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_status',
    cr664_oldvalue: 'Draft',
    cr664_newvalue: 'Final',
    cr664_beforestate: 'Draft',
    cr664_afterstate: 'Final',
    cr664_notes: opts.note,
    cr664_sourcescreensourceprocess: 'DealWorkspace/CreditMemo/finalize',
    cr664_correlationid: opts.correlationId,
  };
  try {
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
  dealId: string;
  memoId: string;
  memoName: string;
  note: string;
  actor: ActorChangedByResolution;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: `Credit memo finalized — ${opts.memoName}`,
    cr664_summary: opts.note,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_eventsubtype: `${TIMELINE_SUBTYPE_CREDIT_MEMO_FINALIZED}|correlation:${opts.correlationId}`,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_creditmemo1',
    cr664_relatedentityid: opts.memoId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.dealId})`,
    ...timelineEventByBind(opts.actor),
  };
  try {
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

export async function finalizeCreditMemoAction(
  input: FinalizeCreditMemoInput,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
): Promise<FinalizeCreditMemoOutcome> {
  const dealId = input.dealId.trim();
  if (dealId.length === 0) {
    return { kind: 'invalid-input', message: 'No deal is in context.' };
  }
  const note = input.finalizeNote.trim();
  if (note.length === 0) {
    return { kind: 'invalid-input', message: 'A finalization note is required.' };
  }
  const memoId = input.memoId.trim();
  if (memoId.length === 0) {
    return { kind: 'invalid-input', message: 'No credit memo is selected to finalize.' };
  }

  // Fresh, fail-closed re-read — never trust the caller's in-memory snapshot
  // of which memo is current.
  let fresh;
  try {
    fresh = await loadDealCreditMemo(dealId);
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    return { kind: 'write-failed', error: mapBusinessSafeError(raw, newCorrelationId('cm')).safeMessage };
  }

  const current = currentCreditMemo(fresh);
  if (!current) {
    return { kind: 'invalid-input', message: 'No credit memo has been drafted for this deal yet.' };
  }
  if (current.id !== memoId) {
    return {
      kind: 'invalid-input',
      message: `A newer credit memo draft (v${current.version}) exists. Reload and finalize the current draft.`,
    };
  }
  if (current.statusKey === 'final') {
    return { kind: 'invalid-input', message: 'This credit memo has already been finalized.' };
  }
  if (current.statusKey === 'stale') {
    return { kind: 'invalid-input', message: 'This credit memo has Stale status. Save a new draft before finalizing.' };
  }
  if (current.statusKey !== 'draft') {
    return { kind: 'invalid-input', message: 'Only a draft credit memo can be finalized.' };
  }

  const correlationId = newCorrelationId('cm');
  const nowIso = new Date().toISOString();
  const actor = await resolveActorChangedBy(input.actorEmail);
  const finalizedText = buildFinalizedMemoText(current.fullText);

  try {
    const result = await Cr664_creditmemo1sService.update(memoId, {
      cr664_status: MEMO_STATUS_FINAL,
      ...(finalizedText ? { cr664_memotext: finalizedText } : {}),
    });
    if (!result.success) {
      const rawError = result.error?.message ?? 'Unknown memo finalize error';
      void emitAuditEvent({
        dealId,
        memoId,
        note,
        actor,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: rawError,
        nowIso,
      });
      return { kind: 'write-failed', error: mapBusinessSafeError(rawError, correlationId).safeMessage };
    }
  } catch (err: unknown) {
    const rawError = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      dealId,
      memoId,
      note,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: rawError,
      nowIso,
    });
    return { kind: 'write-failed', error: mapBusinessSafeError(rawError, correlationId).safeMessage };
  }

  // A successful PATCH is not proof that the final status and content are
  // durable. Read the same row back and compare both fields before emitting a
  // success audit/timeline or telling the operator the memo is final.
  try {
    const readback = await Cr664_creditmemo1sService.get(memoId, {
      select: ['cr664_status', 'cr664_memotext'],
    });
    if (!readback.success || !persistedMemoMatchesFinal(readback.data, finalizedText)) {
      const rawError = readback.success
        ? 'Final memo readback did not match the status and text written.'
        : readback.error?.message ?? 'Final memo readback failed.';
      void emitAuditEvent({
        dealId,
        memoId,
        note,
        actor,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: rawError,
        nowIso,
      });
      return {
        kind: 'verification-failed',
        memoId,
        error: `The memo update could not be verified. Refresh before taking any approval action (reference ${correlationId}).`,
      };
    }
  } catch (err: unknown) {
    const rawError = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      dealId,
      memoId,
      note,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: rawError,
      nowIso,
    });
    return {
      kind: 'verification-failed',
      memoId,
      error: `The memo update could not be verified. Refresh before taking any approval action (reference ${correlationId}).`,
    };
  }

  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      dealId,
      memoId,
      note,
      actor,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      nowIso,
    }),
    emitTimelineEvent({
      dealId,
      memoId,
      memoName: current.name,
      note,
      actor,
      correlationId,
      nowIso,
    }),
  ]);

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      memoId,
      auditError: audit.error ? mapBusinessSafeError(audit.error, correlationId).safeMessage : undefined,
      timelineError: timeline.error ? mapBusinessSafeError(timeline.error, correlationId).safeMessage : undefined,
    };
  }

  return { kind: 'success', memoId };
}

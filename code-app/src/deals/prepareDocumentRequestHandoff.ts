import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { maskRecipient } from './emailDelivery/recipientMasking';

/**
 * Phase 63: governed write that records a banker-initiated email
 * HANDOFF for a document request.
 *
 * What this is — and what it is NOT:
 *
 *   - This action is invoked AFTER the banker has already opened
 *     their local Outlook client via `mailto:` OR copied the
 *     composed email to the clipboard. The app does NOT send email
 *     here. The Office 365 Outlook connector is not invoked, no
 *     Graph API is called, no secrets live in the client.
 *
 *   - The banker is responsible for the actual send. This action
 *     records the FACT that a handoff was prepared, with the
 *     method (`mailto` or `clipboard`), the masked recipient, and
 *     a correlation id binding the audit + timeline rows. The
 *     wording across audit + timeline + outcome surfaces is
 *     deliberately conservative: "handoff prepared", never "sent"
 *     or "delivered".
 *
 *   - The Phase-22 `requestDocument` write (which stamps
 *     cr664_requestdate on the checklist row) is independent of
 *     this action. The modal can sequence them: record the request
 *     first, then prepare the handoff. A handoff failure does not
 *     orphan the request.
 *
 * Coordination (Phase 22/61 pattern, two-row instead of three):
 *   1. Emit one cr664_AuditEvent recording the handoff. The FULL
 *      recipient address lives ONLY on this row (privileged ledger).
 *   2. Emit one cr664_DealTimelineEvent so the deal activity ledger
 *      shows the handoff. The summary uses the MASKED recipient.
 *
 * There is NO main "write to checklist" step — the handoff itself
 * does not mutate the checklist row. The audit + timeline pair IS
 * the durable trace of the handoff.
 *
 * Outcome union (Phase 47 discriminant pattern):
 *   - 'success'            — both audit + timeline emitted.
 *   - 'handoff-failed'     — pre-flight input check rejected the
 *                            request (malformed recipient, empty
 *                            subject/body). Nothing was emitted.
 *   - 'governance-partial' — audit and/or timeline emission failed
 *                            AFTER the banker had already invoked
 *                            their local client. The banker's local
 *                            send may have already happened; do NOT
 *                            ask them to retry from the modal.
 *   - 'unknown'            — caller-safe catch-all.
 */

import type { EmailMode } from './emailDelivery/emailMode';

// Audit + timeline enum constants — locked to the verified schema.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;

export type HandoffMethod = 'mailto' | 'clipboard';

export type PrepareDocumentRequestHandoffOutcome =
  | {
      kind: 'success';
      mode: EmailMode;
      method: HandoffMethod;
      maskedRecipient: string;
    }
  | {
      kind: 'handoff-failed';
      reason: string;
      method: HandoffMethod;
    }
  | {
      kind: 'governance-partial';
      mode: EmailMode;
      method: HandoffMethod;
      maskedRecipient: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface PrepareDocumentRequestHandoffInput {
  documentId: string;
  documentName: string;
  dealId: string;
  systemUserId: string;
  /** Unmasked recipient — the banker typed it. Goes to the audit
   *  event verbatim; appears in masked form everywhere else. */
  recipient: string;
  subject: string;
  body: string;
  /** Whether the banker chose 'Open in Outlook' (mailto) or
   *  'Copy email' (clipboard). Recorded honestly so the audit row
   *  reflects which physical path the banker took. */
  method: HandoffMethod;
  /** Active EmailMode (typically 'HANDOFF'). Captured so the audit
   *  row matches the operational mode the build was deployed in.
   *  The action does not gate on it — DRY_RUN deployments are free
   *  to record handoff events too. */
  mode: EmailMode;
}

function isLikelyValidEmail(addr: string): boolean {
  const trimmed = addr.trim();
  if (trimmed.length === 0) return false;
  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@')) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length === 0 || domain.length === 0) return false;
  if (!domain.includes('.')) return false;
  if (/\s/.test(trimmed)) return false;
  return true;
}

function afterStateForMethod(method: HandoffMethod): string {
  return method === 'mailto'
    ? 'Outlook handoff prepared (mailto)'
    : 'Outlook handoff prepared (clipboard)';
}

async function emitAuditEvent(opts: {
  input: PrepareDocumentRequestHandoffInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  afterState: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Notes carry verbatim subject + full recipient. The audit row is
  // the privileged ledger; full recipient lives here and ONLY here.
  const notes =
    `Mode: ${opts.input.mode}. Method: ${opts.input.method}. ` +
    `Recipient: ${opts.input.recipient}. ` +
    `Subject: ${opts.input.subject}. ` +
    (opts.failureReason ? `Reason: ${opts.failureReason}` : '');
  const payload = {
    cr664_auditeventname: 'DocumentRequest Outlook Handoff',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.documentId,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'outlook_handoff_prepared',
    cr664_oldvalue: '',
    cr664_newvalue: opts.afterState,
    cr664_beforestate: 'Outlook handoff not yet prepared',
    cr664_afterstate: opts.afterState,
    cr664_notes: notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/request-handoff',
    cr664_correlationid: opts.correlationId,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'AuditEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_auditeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

async function emitTimelineEvent(opts: {
  input: PrepareDocumentRequestHandoffInput;
  correlationId: string;
  nowIso: string;
  maskedRecipient: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Phase 45 conservative-copy rules: NEVER say "sent" or "delivered"
  // — the app did not send. "Handoff prepared" is the precise verb.
  const methodLabel =
    opts.input.method === 'mailto' ? 'mailto link opened' : 'clipboard copied';
  const summary =
    `Document request handoff prepared for ${opts.maskedRecipient} ` +
    `(${methodLabel}). The banker sends from Outlook; the app did not send.`;
  const payload = {
    cr664_title: `Document request handoff: ${opts.input.documentName}`,
    cr664_summary: summary,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `documentrequest:outlook-handoff-prepared|correlation:${opts.correlationId}`,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<
        typeof Cr664_dealtimelineeventsService.create
      >[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'DealTimelineEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function prepareDocumentRequestHandoff(
  input: PrepareDocumentRequestHandoffInput,
): Promise<PrepareDocumentRequestHandoffOutcome> {
  // Pre-flight input checks. A handoff with a malformed recipient
  // is meaningless: there is no audit row worth writing because no
  // honest handoff happened. We do NOT emit a failed audit row in
  // this branch (no transport call was attempted; the banker simply
  // had a typo).
  const recipient = input.recipient.trim();
  if (!isLikelyValidEmail(recipient)) {
    return {
      kind: 'handoff-failed',
      reason: `Recipient does not look like an email address: ${input.recipient}`,
      method: input.method,
    };
  }
  if (input.subject.trim().length === 0) {
    return {
      kind: 'handoff-failed',
      reason: 'Subject must not be empty.',
      method: input.method,
    };
  }
  if (input.body.trim().length === 0) {
    return {
      kind: 'handoff-failed',
      reason: 'Body must not be empty.',
      method: input.method,
    };
  }

  const correlationId = newCorrelationId('oh');
  const nowIso = new Date().toISOString();
  const maskedRecipient = maskRecipient(recipient);
  const afterState = afterStateForMethod(input.method);

  let audit: { id: string | undefined; error: string | undefined };
  let timeline: { id: string | undefined; error: string | undefined };
  try {
    [audit, timeline] = await Promise.all([
      emitAuditEvent({
        input,
        correlationId,
        outcome: AUDIT_OUTCOME_SUCCEEDED,
        failureReason: undefined,
        afterState,
        nowIso,
      }),
      emitTimelineEvent({
        input,
        correlationId,
        nowIso,
        maskedRecipient,
      }),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort failure-audit so the ledger captures the throw.
    // Suppress its own error — we already have a message to surface.
    void emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      afterState: 'Outlook handoff failed (governance emission threw)',
      nowIso,
    });
    return { kind: 'unknown', message };
  }

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      mode: input.mode,
      method: input.method,
      maskedRecipient,
      auditError: audit.error,
      timelineError: timeline.error,
    };
  }
  return {
    kind: 'success',
    mode: input.mode,
    method: input.method,
    maskedRecipient,
  };
}

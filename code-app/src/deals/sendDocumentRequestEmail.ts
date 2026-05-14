import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { newCorrelationId } from '../shared/governance/correlationId';
import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { getEmailAdapter, isLikelyValidEmail } from './emailDelivery/outlookEmailAdapters';
import { maskRecipient } from './emailDelivery/recipientMasking';
import type { EmailMode } from './emailDelivery/emailMode';
import type {
  OutlookEmailPort,
  OutlookSendResult,
} from './emailDelivery/outlookEmailPort';

/**
 * Phase 61: governed write that delivers a banker-initiated document
 * request email through the Office 365 Outlook adapter.
 *
 * What this does:
 *   1. Calls the injected OutlookEmailPort.send() with the (banker-
 *      supplied) recipient, subject, and body. The DRY_RUN adapter
 *      validates inputs locally and synthesizes 'accepted'; the LIVE
 *      adapter (today) returns a permanent-failure with a clear
 *      "connector not yet registered" reason. When the Office 365
 *      Outlook connector is registered, the LIVE adapter's body swaps
 *      to the typed connector call.
 *   2. Emits one cr664_AuditEvent (Lifecycle / StatusChange) recording
 *      the send attempt. The FULL recipient address lives ONLY on the
 *      audit row — that row is the privileged ledger.
 *   3. Emits one cr664_DealTimelineEvent (EmailLogged, 788190001) so
 *      the deal's activity ledger records the send. The timeline row
 *      uses the MASKED recipient form so banker + manager surfaces
 *      do not casually expose the address.
 *
 * What this is NOT:
 *   - It is NOT a replacement for `requestDocument`. The prior write
 *     stamps cr664_requestdate on the document checklist and records
 *     the request itself; THIS write records the email-delivery side
 *     effect. The caller (RequestDocumentModal) sequences them so the
 *     request is always recorded BEFORE the send is attempted — that
 *     way a send failure cannot orphan the request.
 *   - It is NOT a borrower inbox sync, a campaign tool, or a copilot
 *     drafter. The banker writes the recipient, subject, and body
 *     by hand and is responsible for accuracy.
 *
 * Outcome union (Phase 47 discriminant pattern):
 *   - 'success'             — adapter accepted; audit + timeline both
 *                             succeeded; mode + providerMessageId
 *                             carried for honest UI surfacing.
 *   - 'send-failed'         — adapter rejected (invalid recipient,
 *                             transient, permanent). NEITHER audit
 *                             nor timeline ran for this branch — a
 *                             best-effort audit row is emitted on
 *                             the catch path; see emitAuditEvent below.
 *                             Actually we DO emit an audit-failed row
 *                             so the failure is captured in the ledger.
 *   - 'governance-partial'  — adapter accepted but audit and/or
 *                             timeline emission failed. The send DID
 *                             go out; do not retry.
 *   - 'unknown'             — caller-safe catch-all carrying message.
 */

// Enum constants — locked to the verified schema, kept inline so the
// action does not depend on the generated runtime enum maps.
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_EMAIL_LOGGED = 788190001;

export type SendDocumentRequestEmailOutcome =
  | {
      kind: 'success';
      mode: EmailMode;
      providerMessageId: string | undefined;
      maskedRecipient: string;
    }
  | {
      kind: 'send-failed';
      sendError: string;
      transient: boolean;
      mode: EmailMode;
    }
  | {
      kind: 'governance-partial';
      mode: EmailMode;
      providerMessageId: string | undefined;
      maskedRecipient: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface SendDocumentRequestEmailInput {
  documentId: string;
  documentName: string;
  dealId: string;
  systemUserId: string;
  /** Unmasked recipient — the banker typed it. Goes to the audit
   *  event verbatim; appears in masked form everywhere else. */
  recipient: string;
  subject: string;
  body: string;
}

export interface SendDocumentRequestEmailDependencies {
  /** Adapter injected for testability. Defaults to the mode-selected
   *  adapter from getEmailAdapter(). */
  adapter?: OutlookEmailPort;
}

function describeSendOutcome(result: OutlookSendResult): {
  succeeded: boolean;
  afterState: string;
  failureReason: string | undefined;
  transient: boolean;
} {
  switch (result.kind) {
    case 'accepted':
      return {
        succeeded: true,
        afterState: 'Outlook send accepted',
        failureReason: undefined,
        transient: false,
      };
    case 'invalid-recipient':
      return {
        succeeded: false,
        afterState: 'Outlook send rejected (invalid recipient)',
        failureReason: result.reason,
        transient: false,
      };
    case 'transient-failure':
      return {
        succeeded: false,
        afterState: 'Outlook send failed (transient)',
        failureReason: result.reason,
        transient: true,
      };
    case 'permanent-failure':
      return {
        succeeded: false,
        afterState: 'Outlook send failed (permanent)',
        failureReason: result.reason,
        transient: false,
      };
  }
}

async function emitAuditEvent(opts: {
  input: SendDocumentRequestEmailInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  afterState: string;
  nowIso: string;
  mode: EmailMode;
  providerMessageId: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Notes carry the verbatim banker-supplied subject + the full
  // recipient address. The audit row is the privileged ledger; full
  // recipient lives here and ONLY here.
  const notes =
    `Mode: ${opts.mode}. ` +
    `Recipient: ${opts.input.recipient}. ` +
    `Subject: ${opts.input.subject}. ` +
    (opts.providerMessageId ? `Provider id: ${opts.providerMessageId}. ` : '') +
    (opts.failureReason ? `Reason: ${opts.failureReason}` : '');
  const payload = {
    cr664_auditeventname: 'DocumentRequest Outlook Send',
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
    cr664_fieldname: 'outlook_send_attempt',
    cr664_oldvalue: '',
    cr664_newvalue: opts.afterState,
    cr664_beforestate: 'Outlook send not yet attempted',
    cr664_afterstate: opts.afterState,
    cr664_notes: notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealDocuments/request-email',
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
  input: SendDocumentRequestEmailInput;
  correlationId: string;
  nowIso: string;
  mode: EmailMode;
  maskedRecipient: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Timeline summary uses the MASKED recipient and the active mode.
  // Phase 45 conservative-copy rules: do not say "delivered" or
  // "[email] sent". "Outlook accepted" / "queued (DRY_RUN)" are
  // accurate descriptions of what actually happened.
  const summary =
    opts.mode === 'LIVE'
      ? `Outlook accepted document request to ${opts.maskedRecipient}.`
      : `Document request prepared for ${opts.maskedRecipient}. Mode: DRY_RUN; nothing left the client.`;
  const payload = {
    cr664_title: `Document request: ${opts.input.documentName}`,
    cr664_summary: summary,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_EMAIL_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_documentchecklist',
    cr664_relatedentityid: opts.input.documentId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_eventsubtype: `correlation:${opts.correlationId}`,
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

export async function sendDocumentRequestEmail(
  input: SendDocumentRequestEmailInput,
  deps: SendDocumentRequestEmailDependencies = {},
): Promise<SendDocumentRequestEmailOutcome> {
  // Local input checks. These mirror the adapter's own shape checks
  // so a malformed input fails fast without consuming a transport call
  // slot. The adapter still validates — that is the source of truth.
  const recipient = input.recipient.trim();
  if (!isLikelyValidEmail(recipient)) {
    return {
      kind: 'unknown',
      message: `Recipient does not look like an email address: ${input.recipient}`,
    };
  }
  if (input.subject.trim().length === 0) {
    return { kind: 'unknown', message: 'Subject must not be empty.' };
  }
  if (input.body.trim().length === 0) {
    return { kind: 'unknown', message: 'Body must not be empty.' };
  }

  const adapter = deps.adapter ?? getEmailAdapter();
  const correlationId = newCorrelationId('oe');
  const nowIso = new Date().toISOString();
  const maskedRecipient = maskRecipient(recipient);

  let sendResult: OutlookSendResult;
  try {
    sendResult = await adapter.send({
      recipient,
      subject: input.subject,
      body: input.body,
      correlationId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort audit row records the unexpected adapter throw.
    void emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      afterState: 'Outlook send failed (adapter threw)',
      nowIso,
      mode: adapter.mode,
      providerMessageId: undefined,
    });
    return { kind: 'unknown', message };
  }

  const describe = describeSendOutcome(sendResult);
  const providerMessageId =
    sendResult.kind === 'accepted' ? sendResult.providerMessageId : undefined;

  if (!describe.succeeded) {
    // Send was attempted and rejected. Emit a best-effort failed
    // audit row so the ledger records the attempt + reason; do NOT
    // emit a timeline row (nothing happened on the deal's activity
    // ledger that the banker / manager should see beyond the modal
    // outcome — the audit row is the durable trace).
    void emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: describe.failureReason,
      afterState: describe.afterState,
      nowIso,
      mode: adapter.mode,
      providerMessageId: undefined,
    });
    return {
      kind: 'send-failed',
      sendError: describe.failureReason ?? 'Outlook send failed',
      transient: describe.transient,
      mode: adapter.mode,
    };
  }

  // Adapter accepted. Emit audit + timeline in parallel. Either
  // failing flips the outcome to governance-partial.
  const [audit, timeline] = await Promise.all([
    emitAuditEvent({
      input,
      correlationId,
      outcome: AUDIT_OUTCOME_SUCCEEDED,
      failureReason: undefined,
      afterState: describe.afterState,
      nowIso,
      mode: adapter.mode,
      providerMessageId,
    }),
    emitTimelineEvent({
      input,
      correlationId,
      nowIso,
      mode: adapter.mode,
      maskedRecipient,
    }),
  ]);

  if (audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      mode: adapter.mode,
      providerMessageId,
      maskedRecipient,
      auditError: audit.error,
      timelineError: timeline.error,
    };
  }
  return {
    kind: 'success',
    mode: adapter.mode,
    providerMessageId,
    maskedRecipient,
  };
}

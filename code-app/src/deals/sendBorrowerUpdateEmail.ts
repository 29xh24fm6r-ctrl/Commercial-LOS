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
 * Phase 105: governed write that delivers a banker-initiated borrower-
 * update email through the Office 365 Outlook adapter.
 *
 * Mirrors the Phase 61 / Phase 104 document-request email shape so the
 * Phase 46/47/49/50 discipline sweeps see one consistent pattern:
 *
 *   1. Calls the injected OutlookEmailPort.send() with the banker-
 *      supplied recipient, subject, and body. DRY_RUN synthesizes
 *      'accepted'; LIVE calls Office365OutlookService.SendEmailV2 (the
 *      Phase 104 swap path).
 *   2. Emits one cr664_AuditEvent (Lifecycle / StatusChange) recording
 *      the send attempt. The FULL recipient address lives ONLY on the
 *      audit row.
 *   3. Emits one cr664_DealTimelineEvent. Uses BorrowerUpdateSent
 *      (788190014) — the schema designer reserved this enum value for
 *      exactly this moment; the Phase 23 guardrail in
 *      ../deals/borrowerUpdateDraft.ts explicitly says we MUST NOT
 *      emit it unless the message was actually sent. Phase 105 is
 *      that moment. The timeline row uses the MASKED recipient.
 *
 * Outcome union (Phase 47 discriminant pattern):
 *   - 'success'             — adapter accepted; audit + timeline both
 *                             succeeded.
 *   - 'send-failed'         — adapter rejected (invalid-recipient,
 *                             transient, permanent). Best-effort
 *                             failed audit row is emitted.
 *   - 'governance-partial'  — adapter accepted but audit and/or
 *                             timeline emission failed.
 *   - 'unknown'             — caller-safe catch-all carrying message.
 *
 * What this is NOT:
 *   - It is NOT a replacement for the Phase 23 local draft / Copy
 *     flow. The local flow remains for DRY_RUN mode and as a manual
 *     fallback. Phase 23 prohibited-term ("clear to close", etc.)
 *     validation already runs in the draft modal before the banker
 *     can click Send.
 *   - It is NOT a borrower-portal post, an inbound-mail sync, or a
 *     subscription. The send is one-shot and the banker types the
 *     recipient by hand (cr664_borrowers has no email column).
 *   - It does NOT carry attachments, Cc, Bcc, From (shared mailbox),
 *     ReplyTo, or Sensitivity. The adapter pins this.
 */

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

const TIMELINE_EVENT_TYPE_BORROWER_UPDATE_SENT = 788190014;

export type SendBorrowerUpdateEmailOutcome =
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

export interface SendBorrowerUpdateEmailInput {
  dealId: string;
  systemUserId: string;
  /** Unmasked recipient — the banker typed it. Goes to the audit
   *  event verbatim; appears in masked form everywhere else. */
  recipient: string;
  subject: string;
  body: string;
  /** Banker note explaining WHY the update is going out. Captured on
   *  the audit row only; not part of the borrower-facing body. */
  bankerNote: string;
  /** Template the banker chose in the modal (general-status,
   *  missing-documents, underwriting-update, closing-progress).
   *  Recorded in audit notes so the ledger preserves the template
   *  used; not borrower-facing. */
  template: string;
}

export interface SendBorrowerUpdateEmailDependencies {
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
        afterState: 'Outlook accepted borrower update',
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
  input: SendBorrowerUpdateEmailInput;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  afterState: string;
  nowIso: string;
  mode: EmailMode;
  providerMessageId: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const notes =
    `Mode: ${opts.mode}. ` +
    `Template: ${opts.input.template}. ` +
    `Recipient: ${opts.input.recipient}. ` +
    `Subject: ${opts.input.subject}. ` +
    `Banker note: ${opts.input.bankerNote}. ` +
    (opts.providerMessageId ? `Provider id: ${opts.providerMessageId}. ` : '') +
    (opts.failureReason ? `Reason: ${opts.failureReason}` : '');
  const payload = {
    cr664_auditeventname: 'BorrowerUpdate Outlook Send',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.dealId,
    cr664_relatedentitytype: 'cr664_loandeal',
    cr664_relatedentityid: opts.input.dealId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'borrower_update_send_attempt',
    cr664_oldvalue: '',
    cr664_newvalue: opts.afterState,
    cr664_beforestate: 'Borrower update not yet attempted',
    cr664_afterstate: opts.afterState,
    cr664_notes: notes,
    cr664_sourcescreensourceprocess: 'DealWorkspace/BorrowerCommunication/borrower-update-email',
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
  input: SendBorrowerUpdateEmailInput;
  correlationId: string;
  nowIso: string;
  mode: EmailMode;
  maskedRecipient: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Phase 45 conservative copy: do NOT say "delivered" or "sent". The
  // LIVE adapter contract is "Outlook accepted" — i.e. the connector
  // acknowledged the request for handoff, not that the borrower
  // received the message.
  const summary =
    opts.mode === 'LIVE'
      ? `Outlook accepted borrower update to ${opts.maskedRecipient}.`
      : `Borrower update prepared for ${opts.maskedRecipient}. Mode: DRY_RUN; nothing left the client.`;
  const payload = {
    cr664_title: `Borrower update`,
    cr664_summary: summary,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_BORROWER_UPDATE_SENT,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_loandeal',
    cr664_relatedentityid: opts.input.dealId,
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
        error:
          result.error?.message ?? 'DealTimelineEvent create returned non-success',
      };
    }
    return { id: result.data?.cr664_dealtimelineeventid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendBorrowerUpdateEmail(
  input: SendBorrowerUpdateEmailInput,
  deps: SendBorrowerUpdateEmailDependencies = {},
): Promise<SendBorrowerUpdateEmailOutcome> {
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
  if (input.bankerNote.trim().length === 0) {
    return {
      kind: 'unknown',
      message: 'Banker note must not be empty (required by Phase 23 + Phase 105 audit discipline).',
    };
  }

  const adapter = deps.adapter ?? getEmailAdapter();
  const correlationId = newCorrelationId('bue');
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

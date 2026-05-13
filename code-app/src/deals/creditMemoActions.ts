import { Cr664_creditmemo1sService } from '../generated/services/Cr664_creditmemo1sService';
import { Cr664_creditmemodraftsectionsService } from '../generated/services/Cr664_creditmemodraftsectionsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';

/**
 * Phase 25: governed credit-memo draft save. The fifth governed
 * write, sharing the same coordination shape as Phase 21/22:
 *
 *   1. Create cr664_creditmemo1 (status = Draft).
 *   2. Best-effort create cr664_creditmemodraftsection records for
 *      each included section (one per enabled section).
 *   3. Audit + Timeline writes in parallel, both tied by a single
 *      correlation id to the memo.
 *
 * Outcome shape mirrors completeTask/requestDocument and adds a
 * sectionErrors[] surface inside governance-partial so a per-section
 * create failure is visible to the banker without obscuring the
 * memo-level success. A section failure does NOT roll back the
 * memo — once the memo is created the draft IS persisted, so we
 * surface a CRITICAL governance-partial warning instead.
 *
 * Schema verification (see ../generated/models/Cr664_creditmemo1sModel.ts
 * and Cr664_creditmemodraftsectionsModel.ts):
 *   - cr664_creditmemo1 supports create. Required fields stamped:
 *       cr664_memoname, cr664_memotype, cr664_status, cr664_version,
 *       cr664_generatedat, cr664_borrowersafe, cr664_workspaceid,
 *       ownerid, owneridtype, statecode.
 *     Optional fields stamped: cr664_memotext, cr664_Deal@odata.bind,
 *     cr664_memo_schema_version (set to 'phase25').
 *   - cr664_status enum: 788190000 = draft (verified from generated
 *     model). We only ever write Draft here; Final/Stale belong to
 *     later phases.
 *   - cr664_creditmemodraftsection supports create. Required fields
 *     stamped: cr664_sectionkey, cr664_reviewstatus (Pending),
 *     ownerid, owneridtype, statecode. Optional: cr664_drafttext,
 *     cr664_lastgeneratedat, cr664_Deal@odata.bind.
 *   - DealTimelineEvent eventtype enum has NO CreditMemoDrafted
 *     value. We use NoteLogged (788190002) with a stable subtype
 *     'creditmemo:draft-saved' so the event can be filtered without
 *     being misleading (DocumentGenerated would be wrong — that
 *     refers to documentchecklist generation, not memo drafting).
 *
 * Final memos are NEVER modified by this action — we only create
 * new draft rows.
 */

export interface SaveCreditMemoDraftSection {
  sectionKey: string;
  sectionLabel: string;
  /** Section-specific text snippet pulled from the generator's body.
   *  Saved verbatim — the action does not re-generate. */
  draftText: string;
}

export interface SaveCreditMemoDraftInput {
  dealId: string;
  dealName: string;
  workspaceId: string;
  systemUserId: string;
  memoName: string;
  memoType: string;
  memoBody: string;
  /** Banker note explaining why this draft is being saved. Required;
   *  empty / whitespace-only rejected at the action layer. */
  saveNote: string;
  /** Section drafts to create alongside the memo, one per included
   *  section. Empty array = save memo only, no sections. */
  sections: readonly SaveCreditMemoDraftSection[];
  /** Version stamp on the new cr664_creditmemo1 row. Caller computes
   *  this from existing memos (e.g. latest version + 1). */
  version: number;
}

export type SaveCreditMemoDraftOutcome =
  | { kind: 'success'; memoId: string; sectionIds: string[] }
  | { kind: 'memo-failed'; memoError: string }
  | {
      kind: 'governance-partial';
      memoId: string;
      sectionErrors: { sectionKey: string; error: string }[];
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

// Schema-verified enum constants. Keep inline to avoid coupling to
// the generated runtime enum maps.
const MEMO_STATUS_DRAFT = 788190000;
const SECTION_REVIEW_STATUS_PENDING = 788190000;

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;
const AUDIT_OUTCOME_SUCCEEDED = 788190000;
const AUDIT_OUTCOME_FAILED = 788190001;

const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000;
const TIMELINE_SUBTYPE_CREDIT_MEMO_DRAFT_SAVED = 'creditmemo:draft-saved';

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function emitAuditEvent(opts: {
  input: SaveCreditMemoDraftInput;
  memoId: string | undefined;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_auditeventname: 'CreditMemo Draft Saved',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.memoId ?? opts.input.dealId,
    cr664_relatedentitytype: 'cr664_creditmemo1',
    cr664_relatedentityid: opts.memoId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: opts.nowIso,
    'cr664_ChangedBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    'cr664_ActorUser@odata.bind': `/systemusers(${opts.input.systemUserId})`,
    cr664_fieldname: 'cr664_status',
    cr664_oldvalue: '',
    cr664_newvalue: 'Draft',
    cr664_beforestate: 'Not yet drafted',
    cr664_afterstate: 'Draft',
    cr664_notes: opts.input.saveNote,
    cr664_sourcescreensourceprocess: 'DealWorkspace/CreditMemo/saveDraft',
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
  input: SaveCreditMemoDraftInput;
  memoId: string;
  correlationId: string;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_title: `Credit memo draft saved — ${opts.input.memoName}`,
    cr664_summary: opts.input.saveNote,
    cr664_eventat: opts.nowIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_eventsubtype: `${TIMELINE_SUBTYPE_CREDIT_MEMO_DRAFT_SAVED}|correlation:${opts.correlationId}`,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_creditmemo1',
    cr664_relatedentityid: opts.memoId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    'cr664_EventBy@odata.bind': `/systemusers(${opts.input.systemUserId})`,
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

async function createMemoSection(opts: {
  input: SaveCreditMemoDraftInput;
  section: SaveCreditMemoDraftSection;
  nowIso: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const payload = {
    cr664_sectionkey: opts.section.sectionKey,
    cr664_drafttext: opts.section.draftText,
    cr664_lastgeneratedat: opts.nowIso,
    cr664_reviewstatus: SECTION_REVIEW_STATUS_PENDING,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    ownerid: opts.input.systemUserId,
    owneridtype: 'systemuser',
    statecode: 0,
  };
  try {
    const result = await Cr664_creditmemodraftsectionsService.create(
      payload as unknown as Parameters<
        typeof Cr664_creditmemodraftsectionsService.create
      >[0],
    );
    if (!result.success) {
      return {
        id: undefined,
        error: result.error?.message ?? 'Section create returned non-success',
      };
    }
    return { id: result.data?.cr664_creditmemodraftsectionid, error: undefined };
  } catch (err: unknown) {
    return { id: undefined, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveCreditMemoDraft(
  input: SaveCreditMemoDraftInput,
): Promise<SaveCreditMemoDraftOutcome> {
  const note = input.saveNote.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Save note must not be empty.' };
  }
  if (input.memoBody.trim().length === 0) {
    return { kind: 'unknown', message: 'Memo body must not be empty.' };
  }

  // Audit + timeline get the TRIMMED note to keep the governance
  // trail clean. The memo body itself is preserved verbatim so the
  // banker's whitespace/formatting isn't silently rewritten.
  const trimmedInput = { ...input, saveNote: note };

  const correlationId = newCorrelationId();
  const nowIso = new Date().toISOString();

  // Step 1: create the cr664_creditmemo1 row as Draft.
  let memoId: string | undefined;
  try {
    const memoPayload = {
      cr664_memoname: input.memoName,
      cr664_memotype: input.memoType,
      cr664_memotext: input.memoBody,
      cr664_status: MEMO_STATUS_DRAFT,
      cr664_version: input.version,
      cr664_generatedat: nowIso,
      cr664_borrowersafe: false,
      cr664_workspaceid: input.workspaceId,
      cr664_memo_schema_version: 'phase25',
      'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
      ownerid: input.systemUserId,
      owneridtype: 'systemuser',
      statecode: 0,
    };
    const result = await Cr664_creditmemo1sService.create(
      memoPayload as unknown as Parameters<
        typeof Cr664_creditmemo1sService.create
      >[0],
    );
    if (!result.success) {
      void emitAuditEvent({
        input: trimmedInput,
        memoId: undefined,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: result.error?.message ?? 'Unknown memo create error',
        nowIso,
      });
      return {
        kind: 'memo-failed',
        memoError: result.error?.message ?? 'Credit memo create failed',
      };
    }
    memoId = result.data?.cr664_creditmemo1id;
    if (!memoId) {
      void emitAuditEvent({
        input: trimmedInput,
        memoId: undefined,
        correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: 'Memo create returned success without an id',
        nowIso,
      });
      return {
        kind: 'memo-failed',
        memoError: 'Credit memo create returned success without an id.',
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void emitAuditEvent({
      input,
      memoId: undefined,
      correlationId,
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: message,
      nowIso,
    });
    return { kind: 'memo-failed', memoError: message };
  }

  // Step 2 + 3 + 4: sections (one create per included section) plus
  // the audit + timeline events, all in parallel. Once the memo is
  // created, ANY of these failing flips the outcome to
  // governance-partial — never roll back. The memo IS persisted.
  const sectionsP = Promise.all(
    input.sections.map((s) =>
      createMemoSection({ input, section: s, nowIso }).then((r) => ({
        sectionKey: s.sectionKey,
        ...r,
      })),
    ),
  );
  const auditP = emitAuditEvent({
    input: trimmedInput,
    memoId,
    correlationId,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
    nowIso,
  });
  const timelineP = emitTimelineEvent({
    input: trimmedInput,
    memoId,
    correlationId,
    nowIso,
  });

  const [sections, audit, timeline] = await Promise.all([
    sectionsP,
    auditP,
    timelineP,
  ]);

  const sectionErrors = sections
    .filter((s) => s.error)
    .map((s) => ({ sectionKey: s.sectionKey, error: s.error as string }));
  const sectionIds = sections
    .filter((s) => s.id)
    .map((s) => s.id as string);

  if (sectionErrors.length > 0 || audit.error || timeline.error) {
    return {
      kind: 'governance-partial',
      memoId,
      sectionErrors,
      auditError: audit.error,
      timelineError: timeline.error,
    };
  }

  return { kind: 'success', memoId, sectionIds };
}

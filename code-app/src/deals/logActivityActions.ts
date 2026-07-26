import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { Cr664_dealtimelineeventsService } from '../generated/services/Cr664_dealtimelineeventsService';
import { AUDIT_OUTCOME_FAILED, AUDIT_OUTCOME_SUCCEEDED } from '../shared/governance/auditEnums';
import { newCorrelationId } from '../shared/governance/correlationId';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ActorChangedByResolution,
  type ResolveActorChangedBy,
} from './newDealAuditActorResolver';
import { timelineEventByBind } from './timelineActorBind';
import {
  ACTIVITY_TYPE_LABEL,
  ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE,
  appendFoldedOutcomeAndFollowUp,
  type CanonicalActivityType,
} from '../activity/canonicalActivityLogging';
import { resolveLiveDealBridgedOrganizationId, type DealBridgedOrganizationResult } from './dealBridgedOrganizationLookup';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';

/**
 * Phase 160: governed write for banker-authored activity notes.
 *
 * The canonical activity row is cr664_DealTimelineEvent. A matching
 * audit row records the attempt and shares the same correlation id.
 *
 * final-seven-workstreams Workstream 2: this writer now shares its activity-type vocabulary and
 * outcome/next-follow-up text formatting with the CRM-scoped writer
 * (`../crm/write/crmWriteAdapter.ts`'s `logActivity()`) via `../activity/canonicalActivityLogging.ts`
 * — the two forms present the same choices and the two Dataverse rows read the same way. It also
 * now best-effort cross-writes a matching cr664_crmtimelineevents row when the deal's client is
 * bridged to a CRM organization, closing the previously-documented gap that only the CRM-to-deal
 * direction cross-wrote (commit 1c12590 / D3) and the deal-to-CRM direction did not.
 */

const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

export interface LogActivityCrossWriteDeps {
  readonly resolveDealBridgedOrganizationId?: (dealId: string) => Promise<DealBridgedOrganizationResult>;
  readonly createCrmTimelineEvent?: (payload: Record<string, unknown>) => Promise<{ readonly success: boolean; readonly id?: string; readonly error?: { readonly message?: string } }>;
}

export function buildLiveLogActivityCrossWriteDeps(): LogActivityCrossWriteDeps {
  return {
    resolveDealBridgedOrganizationId: resolveLiveDealBridgedOrganizationId,
    createCrmTimelineEvent: async (payload) => {
      const { Cr664_crmtimelineeventsService } = await import('../generated/services/Cr664_crmtimelineeventsService');
      const r = await Cr664_crmtimelineeventsService.create(payload as never);
      return { success: r.success, id: r.data?.cr664_crmtimelineeventid, error: r.error ?? undefined };
    },
  };
}

/**
 * Best-effort reverse cross-write (deal cockpit -> CRM company timeline). Never blocks or reverts
 * the primary deal-timeline write that already succeeded; a failure here is swallowed (the same
 * best-effort contract `crossWriteDealTimelineEvent` in crmWriteAdapter.ts uses for its own
 * direction) since neither direction's cross-write has a durable error channel back to the
 * originating write's own outcome type today — a documented, symmetric limitation, not new.
 */
async function crossWriteCrmTimelineEvent(opts: {
  readonly input: LogActivityInput;
  readonly activityType: CanonicalActivityType;
  readonly summaryText: string;
  readonly occurredAtIso: string;
  readonly deps: LogActivityCrossWriteDeps;
}): Promise<void> {
  if (!opts.deps.resolveDealBridgedOrganizationId || !opts.deps.createCrmTimelineEvent) return;
  try {
    const bridge = await opts.deps.resolveDealBridgedOrganizationId(opts.input.dealId);
    if (bridge.status !== 'ready') return; // no-client-link / no-org-link / unavailable — nothing to cross-write.
    const label = ACTIVITY_TYPE_LABEL[opts.activityType];
    await opts.deps.createCrmTimelineEvent({
      cr664_name: `${label}: ${opts.summaryText.slice(0, 80)}`,
      cr664_eventtype: opts.activityType,
      cr664_summary: opts.summaryText,
      cr664_actor: opts.input.actorEmail,
      cr664_occurredat: opts.occurredAtIso,
      'cr664_Organization@odata.bind': `/cr664_crmorganizations(${bridge.organizationId})`,
      'cr664_OriginatedLoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    });
  } catch {
    // Best-effort only — see the function doc comment.
  }
}

export type LogActivityOutcome =
  | { kind: 'success'; activityId: string }
  | { kind: 'activity-failed'; activityError: string }
  | {
      kind: 'governance-partial';
      activityId: string;
      auditError: string | undefined;
      timelineError: string | undefined;
    }
  | { kind: 'unknown'; message: string };

export interface LogActivityInput {
  dealId: string;
  dealName: string;
  systemUserId: string;
  /** Acting banker's email — resolved fail-closed to the audit's REQUIRED
   *  cr664_ChangedBy (a cr664_user lookup) via the platform-user bridge.
   *  A systemuser id is NEVER bound into cr664_ChangedBy (Phase 187H / G-5). */
  actorEmail: string;
  bankerName: string | undefined;
  note: string;
  /** Workstream 2 — defaults to 'note' when omitted (preserves the original bare-note behavior). */
  activityType?: CanonicalActivityType;
  /** Workstream 2 — optional; folded as text onto cr664_summary (no dedicated column exists). */
  outcome?: string;
  /** Workstream 2 — optional; folded as text onto cr664_summary (no dedicated column exists). */
  nextFollowUpDate?: string;
}

async function emitAuditEvent(opts: {
  input: LogActivityInput;
  actor: ActorChangedByResolution;
  correlationId: string;
  activityId: string;
  outcome: number;
  failureReason: string | undefined;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  // Fail closed: never POST an audit row without a resolved cr664_user actor.
  // No systemuser id is ever bound into cr664_ChangedBy (it targets cr664_user).
  if (!opts.actor.ok || !opts.actor.changedByBind) {
    return { id: undefined, error: opts.actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(opts.actor.changedByBind);
  const nowIso = new Date().toISOString();
  const payload = {
    cr664_auditeventname: 'Deal Activity Logged',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: opts.input.dealId,
    cr664_relatedentitytype: 'cr664_dealtimelineevent',
    cr664_relatedentityid: opts.activityId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    // The ONLY actor/user bind. REQUIRED, targets cr664_user; value resolved
    // fail-closed from the actor email via the platform-user bridge. No
    // cr664_ActorUser, no ownerid/owneridtype/statecode (server-defaulted).
    'cr664_ChangedBy@odata.bind': opts.actor.changedByBind,
    cr664_fieldname: 'cr664_dealtimelineeventid',
    cr664_oldvalue: 'No banker activity note',
    cr664_newvalue: opts.activityId,
    cr664_beforestate: 'No banker activity note',
    cr664_afterstate: 'Banker activity note logged',
    cr664_notes:
      `Activity note logged on "${opts.input.dealName}". ` +
      `Banker: ${opts.input.bankerName ?? 'Unknown banker'}. ` +
      `Note: ${opts.input.note}`,
    cr664_sourcescreensourceprocess: 'BankerWorkspace/GreetingHeader/log-activity',
    cr664_correlationid: opts.correlationId,
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

async function createTimelineEvent(opts: {
  input: LogActivityInput;
  actor: ActorChangedByResolution;
  correlationId: string;
}): Promise<{ id: string | undefined; error: string | undefined }> {
  const nowIso = new Date().toISOString();
  const activityType = opts.input.activityType ?? 'note';
  const summary = appendFoldedOutcomeAndFollowUp(opts.input.note, opts.input.outcome, opts.input.nextFollowUpDate);
  const payload = {
    cr664_title: `Banker ${ACTIVITY_TYPE_LABEL[activityType]} logged`,
    cr664_summary: summary,
    cr664_eventat: nowIso,
    cr664_eventtype: ACTIVITY_TYPE_TO_DEAL_TIMELINE_EVENT_TYPE[activityType],
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_loandeal',
    cr664_relatedentityid: opts.input.dealId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${opts.input.dealId})`,
    // cr664_EventBy targets cr664_user — bind the resolved cr664_user, omit when
    // unresolved (fail-closed); never a systemuser id. Owner/state server-defaulted.
    ...timelineEventByBind(opts.actor),
    cr664_eventsubtype: `activity:${activityType}|correlation:${opts.correlationId}`,
  };
  try {
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
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

export async function logActivity(
  input: LogActivityInput,
  resolveActorChangedBy: ResolveActorChangedBy = createActorChangedByResolver(),
  crossWriteDeps: LogActivityCrossWriteDeps = buildLiveLogActivityCrossWriteDeps(),
): Promise<LogActivityOutcome> {
  const note = input.note.trim();
  if (note.length === 0) {
    return { kind: 'unknown', message: 'Activity note must not be empty.' };
  }
  if (!input.dealId.trim()) {
    return { kind: 'unknown', message: 'A deal must be selected before logging activity.' };
  }

  const normalized: LogActivityInput = {
    ...input,
    note,
    dealName: input.dealName.trim() || 'Selected deal',
  };
  const correlationId = newCorrelationId('la');
  // Resolve the audit actor's cr664_user bind once, fail-closed.
  const actor = await resolveActorChangedBy(input.actorEmail);
  const timeline = await createTimelineEvent({ input: normalized, actor, correlationId });

  if (timeline.error || !timeline.id) {
    void emitAuditEvent({
      input: normalized,
      actor,
      correlationId,
      activityId: 'unknown',
      outcome: AUDIT_OUTCOME_FAILED,
      failureReason: timeline.error ?? 'DealTimelineEvent create returned no id',
    });
    return {
      kind: 'activity-failed',
      // Final LOS Completion arc (Workstream P) — never render a raw transport error verbatim.
      activityError: mapBusinessSafeError(
        timeline.error ?? 'DealTimelineEvent create returned no id',
        correlationId,
      ).safeMessage,
    };
  }

  // Workstream 2 — best-effort reverse cross-write onto the deal's bridged CRM company timeline
  // (never blocks/reverts the primary write already committed above; awaited only so tests and
  // callers observe it deterministically, its own errors are swallowed internally).
  // Workstream 2 — best-effort reverse cross-write onto the deal's bridged CRM company timeline
  // (never blocks/reverts the primary write already committed above; awaited only so tests and
  // callers observe it deterministically, its own errors are swallowed internally).
  await crossWriteCrmTimelineEvent({
    input: normalized,
    activityType: normalized.activityType ?? 'note',
    summaryText: appendFoldedOutcomeAndFollowUp(normalized.note, normalized.outcome, normalized.nextFollowUpDate),
    occurredAtIso: new Date().toISOString(),
    deps: crossWriteDeps,
  });

  const audit = await emitAuditEvent({
    input: normalized,
    actor,
    correlationId,
    activityId: timeline.id,
    outcome: AUDIT_OUTCOME_SUCCEEDED,
    failureReason: undefined,
  });

  if (audit.error) {
    return {
      kind: 'governance-partial',
      activityId: timeline.id,
      // Final LOS Completion arc (Workstream P) — never render a raw transport error verbatim.
      auditError: mapBusinessSafeError(audit.error, correlationId).safeMessage,
      timelineError: undefined,
    };
  }

  return { kind: 'success', activityId: timeline.id };
}

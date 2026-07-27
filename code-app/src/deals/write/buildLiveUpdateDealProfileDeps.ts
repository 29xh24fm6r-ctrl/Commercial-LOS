/**
 * Live dependency factory for the governed Deal Profile update.
 *
 * Keeps the SDK out of `updateDealProfile.ts`'s static graph: the generated
 * services are pulled in via dynamic import inside each live dep, and the audit
 * reuses the SAME cr664_AuditEvent + fail-closed cr664_ChangedBy (cr664_user)
 * resolver pattern as the other governed deal writes (see dealTaskActions).
 */

import { AUDIT_OUTCOME_SUCCEEDED } from '../../shared/governance/auditEnums';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../../shared/governance/timelineEnums';
import { assertChangedByCoreUserBind } from '../../shared/governance/auditActorBind';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../newDealAuditActorResolver';
import { timelineEventByBind } from '../timelineActorBind';
import type {
  UpdateDealProfileDeps,
  EmitDealProfileAuditInput,
  EmitDealProfileTimelineInput,
} from './updateDealProfile';

// Verified schema enum values (mirrors dealTaskActions — kept inline so the
// audit does not depend on the generated runtime enum maps).
const AUDIT_EVENT_CATEGORY_LIFECYCLE = 788190002;
const AUDIT_EVENT_TYPE_STATUS_CHANGE = 788190001;
const AUDIT_ENTITY_TYPE_LOAN_DEAL = 788190000;

async function emitDealProfileAudit(
  input: EmitDealProfileAuditInput,
  resolveActorChangedBy: ResolveActorChangedBy,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Fail closed: never POST an audit row without a resolved cr664_user actor.
  const actor = await resolveActorChangedBy(input.actorEmail);
  if (!actor.ok || !actor.changedByBind) {
    return { ok: false, error: actor.reason ?? 'audit actor identity unresolved' };
  }
  assertChangedByCoreUserBind(actor.changedByBind);
  const nowIso = new Date().toISOString();
  const summary = input.changedLabels.join(', ');
  const payload = {
    cr664_auditeventname: 'Deal Profile Updated',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_LIFECYCLE,
    cr664_eventtype: AUDIT_EVENT_TYPE_STATUS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_LOAN_DEAL,
    cr664_entityid: input.dealId,
    'cr664_LoanDeal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    cr664_outcomestatus: AUDIT_OUTCOME_SUCCEEDED,
    cr664_changeddate: nowIso,
    // The ONLY actor/user bind — resolved cr664_user, never a systemuser id.
    'cr664_ChangedBy@odata.bind': actor.changedByBind,
    cr664_fieldname: 'deal-profile',
    cr664_oldvalue: '',
    cr664_newvalue: summary,
    cr664_beforestate: 'Profile incomplete',
    cr664_afterstate: `Profile fields updated: ${summary}`,
    cr664_notes: `Governed Deal Profile completion updated: ${summary}.`,
    cr664_sourcescreensourceprocess: 'DealWorkspace/DealProfile/update',
    cr664_correlationid: input.correlationId,
  };
  try {
    const { Cr664_auditeventsService } = await import('../../generated/services/Cr664_auditeventsService');
    const result = await Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    );
    if (!result.success) {
      return { ok: false, error: result.error?.message ?? 'AuditEvent create returned non-success' };
    }
    return { ok: true, id: result.data?.cr664_auditeventid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Final LOS Completion arc — Workstream K. Title/subtype per field, matching the NoteLogged-reuse
// convention every other new-timeline-event workstream in this arc already established (no
// additive option-set migration needed).
const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002;
const DEAL_PROFILE_TIMELINE_COPY: Readonly<Record<EmitDealProfileTimelineInput['field'], { title: string; subtype: string }>> = {
  riskRatingInputs: { title: 'Risk rating assigned', subtype: 'riskrating:assigned' },
  underwritingRecommendationInputs: { title: 'Underwriting recommendation finalized', subtype: 'uwrecommendation:finalized' },
};

async function emitDealProfileTimeline(
  input: EmitDealProfileTimelineInput,
  resolveActorChangedBy: ResolveActorChangedBy,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const actor = await resolveActorChangedBy(input.actorEmail);
  const copy = DEAL_PROFILE_TIMELINE_COPY[input.field];
  const payload = {
    cr664_title: copy.title,
    cr664_summary: copy.title,
    cr664_eventat: new Date().toISOString(),
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${input.dealId})`,
    ...timelineEventByBind(actor),
    cr664_eventsubtype: `${copy.subtype}|correlation:${input.correlationId}`,
  };
  try {
    const { Cr664_dealtimelineeventsService } = await import('../../generated/services/Cr664_dealtimelineeventsService');
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
    );
    if (!result.success) {
      return { ok: false, error: result.error?.message ?? 'DealTimelineEvent create returned non-success' };
    }
    return { ok: true, id: result.data?.cr664_dealtimelineeventid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function buildLiveUpdateDealProfileDeps(): UpdateDealProfileDeps {
  const resolveActorChangedBy = createActorChangedByResolver();
  return {
    updateDeal: async (dealId, body) => {
      const { Cr664_loandealsService } = await import('../../generated/services/Cr664_loandealsService');
      const r = await Cr664_loandealsService.update(
        dealId,
        body as unknown as Parameters<typeof Cr664_loandealsService.update>[1],
      );
      return { success: r.success, error: r.error ?? undefined };
    },
    readDeal: async (dealId) => {
      const { Cr664_loandealsService } = await import('../../generated/services/Cr664_loandealsService');
      const r = await Cr664_loandealsService.get(dealId);
      return {
        success: r.success,
        row: (r.data ?? undefined) as unknown as Record<string, unknown> | undefined,
        error: r.error ?? undefined,
      };
    },
    emitAudit: (input) => emitDealProfileAudit(input, resolveActorChangedBy),
    emitTimeline: (input) => emitDealProfileTimeline(input, resolveActorChangedBy),
  };
}

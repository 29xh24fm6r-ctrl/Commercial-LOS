import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../shared/governance/timelineEnums';
import { timelineEventByBind } from '../deals/timelineActorBind';
import { buildFundingTimelineEntry } from './fundingTimeline';
import type { EmitFundingTimeline } from './fundingTimelineWrite';

/**
 * Final LOS Completion arc — Workstream K. The live `EmitFundingTimeline` implementation, mirroring
 * `fundingAuditLiveDeps.ts`'s exact shape and disclosure pattern for the audit sink. Reuses
 * `buildFundingTimelineEntry` (`fundingTimeline.ts`) for the title/summary text — that payload-shape
 * logic was already correct, only unreached; this module supplies the missing live emit.
 */

const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002; // 'NoteLogged' — no dedicated funding-timeline option-set value exists.

export const emitLiveFundingTimeline: EmitFundingTimeline = async ({ record, action, occurredAtIso, changedByBind }) => {
  const entry = buildFundingTimelineEntry(record, action, occurredAtIso);
  const payload = {
    cr664_title: entry.title,
    cr664_summary: entry.summary,
    cr664_eventat: entry.occurredAtIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_fundingauthorization',
    cr664_relatedentityid: record.recordId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${entry.dealId})`,
    ...timelineEventByBind({ ok: true, changedByBind }),
    cr664_eventsubtype: `funding:${action}|correlation:${record.correlationId}`,
  };
  try {
    const { Cr664_dealtimelineeventsService } = await import('../generated/services/Cr664_dealtimelineeventsService');
    const result = await Cr664_dealtimelineeventsService.create(
      payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
    );
    if (!result.success) {
      return { success: false, error: result.error?.message ?? 'DealTimelineEvent create returned non-success' };
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
};

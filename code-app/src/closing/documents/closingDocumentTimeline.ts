import { assertChangedByCoreUserBind } from '../../shared/governance/auditActorBind';
import { TIMELINE_VISIBILITY_BANKER_AND_MANAGER } from '../../shared/governance/timelineEnums';
import { timelineEventByBind } from '../../deals/timelineActorBind';
import type { ActorChangedByResolution, ResolveActorChangedBy } from '../../deals/newDealAuditActorResolver';
import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';

/**
 * Final LOS Completion arc — Workstream K. Closing-document generation previously emitted an audit
 * row (well, attempted to — the live call site's `emitAudit` is still a documented, deliberate
 * no-op stub pending a separate build-out) but NO timeline event of any kind — a confirmed gap (see
 * docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md §7). This closes it independently of that
 * still-pending audit work: the timeline sink here is real and live, following the exact
 * `recordClosingDocumentGenerationAudit` shape (`closingDocumentAudit.ts`) this file sits next to.
 *
 * Uses the schema's own pre-existing `788190011` (`DocumentGenerated`) event type — see
 * `src/deals/activityQueries.ts`'s `EVENT_TYPE_MAP` — rather than the NoteLogged-reuse convention
 * this arc used elsewhere, since a semantically exact, already-live option-set value exists here and
 * needs no reuse trick.
 */
export interface ClosingDocumentTimelineEvent {
  readonly manifest: GeneratedClosingDocumentManifest;
  readonly changedByBind: string;
}

export type EmitClosingDocumentTimeline = (
  event: ClosingDocumentTimelineEvent,
) => Promise<{ success: boolean; error?: string }>;

const TIMELINE_EVENT_TYPE_DOCUMENT_GENERATED = 788190011;

export async function recordClosingDocumentGenerationTimeline(
  manifest: GeneratedClosingDocumentManifest,
  resolveActorChangedBy: ResolveActorChangedBy,
  emitTimeline: EmitClosingDocumentTimeline,
): Promise<{ recorded: boolean; error?: string }> {
  let actor: ActorChangedByResolution;
  try {
    actor = await resolveActorChangedBy(manifest.generatedByActorEmail);
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!actor.ok || !actor.changedByBind) {
    return { recorded: false, error: actor.ok ? 'No cr664_user bind resolved.' : actor.reason };
  }
  assertChangedByCoreUserBind(actor.changedByBind);
  try {
    const result = await emitTimeline({ manifest, changedByBind: actor.changedByBind });
    return result.success ? { recorded: true } : { recorded: false, error: result.error ?? 'Timeline emit returned non-success.' };
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The live `EmitClosingDocumentTimeline` implementation — the POST only (actor resolution is
 * `recordClosingDocumentGenerationTimeline`'s job above, mirroring `closingDocumentAudit.ts`'s exact
 * split). Dynamic-import-only, matching every other SDK-touching module in this codebase.
 */
export const liveEmitClosingDocumentTimeline: EmitClosingDocumentTimeline = async ({ manifest: m, changedByBind }) => {
  const payload = {
    cr664_title: `${m.templateKey} generated`,
    cr664_summary: `Closing document "${m.templateKey}" (v${m.templateVersion}) generated.`,
    cr664_eventat: m.generatedAtIso,
    cr664_eventtype: TIMELINE_EVENT_TYPE_DOCUMENT_GENERATED,
    cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
    cr664_issystemgenerated: false,
    cr664_relatedentitytype: 'cr664_closingdocumentmanifest',
    cr664_relatedentityid: m.manifestId,
    'cr664_Deal@odata.bind': `/cr664_loandeals(${m.dealId})`,
    ...timelineEventByBind({ ok: true, changedByBind }),
    cr664_eventsubtype: `closingdocument:generated|correlation:${m.correlationId}`,
  };
  try {
    const { Cr664_dealtimelineeventsService } = await import('../../generated/services/Cr664_dealtimelineeventsService');
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

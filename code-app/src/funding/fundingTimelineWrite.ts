import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { ActorChangedByResolution, ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import type { FundingAuditAction } from './fundingAudit';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

/**
 * Final LOS Completion arc — Workstream K. `fundingTimeline.ts`'s `buildFundingTimelineEntry` was a
 * pure payload SHAPE with zero live call sites — confirmed by direct search (see
 * docs/final-completion/FINAL_REMAINING_GAP_LEDGER.md §7): funding requested/approved/rejected/
 * revoked/funded emitted an audit row but no timeline event at all. This is the write orchestrator
 * that actually calls it, mirroring `recordFundingAudit`'s (`fundingAudit.ts`) exact
 * resolve-actor → fail-closed → emit shape. No schema change: reuses NoteLogged (788190002) with a
 * distinct `cr664_eventsubtype`, same convention this arc used for every other new timeline event
 * (see `fundingTimelineLiveDeps.ts`).
 */
export interface FundingTimelineWriteEvent {
  readonly record: FundingAuthorizationRecord;
  readonly action: FundingAuditAction;
  readonly occurredAtIso: string;
  readonly changedByBind: string;
}

export type EmitFundingTimeline = (event: FundingTimelineWriteEvent) => Promise<{ success: boolean; error?: string }>;

export async function recordFundingTimeline(
  record: FundingAuthorizationRecord,
  action: FundingAuditAction,
  actorEmail: string,
  occurredAtIso: string,
  resolveActorChangedBy: ResolveActorChangedBy,
  emitTimeline: EmitFundingTimeline,
): Promise<{ recorded: boolean; error?: string }> {
  let actor: ActorChangedByResolution;
  try {
    actor = await resolveActorChangedBy(actorEmail);
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!actor.ok || !actor.changedByBind) {
    return { recorded: false, error: actor.ok ? 'No cr664_user bind resolved.' : actor.reason };
  }
  assertChangedByCoreUserBind(actor.changedByBind);
  try {
    const result = await emitTimeline({ record, action, occurredAtIso, changedByBind: actor.changedByBind });
    return result.success ? { recorded: true } : { recorded: false, error: result.error ?? 'Timeline emit returned non-success.' };
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

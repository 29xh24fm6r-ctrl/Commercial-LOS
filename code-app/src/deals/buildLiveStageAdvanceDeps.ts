/**
 * Live (Dataverse) wiring for the governed stage-advance write seam
 * (stageAdvanceWriteDependency.ts). Kept SDK-only and SEPARATE from the pure
 * seam so the core stays importable without the data client.
 *
 * DISABLED in effect: `advanceWorkflowStage` refuses with `disabled` while
 * AUTO_STAGE_ADVANCE_ENABLED is false (its default), so importing or building
 * these deps performs NO IO — the sinks are only reached by an explicit, gated,
 * authorized invocation. No borrower-comms module is imported.
 *
 * Each sink mirrors a PROVEN governed-write pattern (nothing invented):
 *   - updateDealStage resolves the canonical target stage code to its live
 *     `cr664_dealstagereferences` bind (fail-closed until the table is seeded),
 *     then updates `cr664_StageReference` + `cr664_stageentrydate` on the deal —
 *     the exact fields the governed New Deal create proved.
 *   - the audit sink emits a governed `cr664_AuditEvent` via the single canonical
 *     builder (`buildNewDealAuditPayload`) + the fail-closed `cr664_user` actor
 *     resolver, so a systemuser id is never bound into the required
 *     `cr664_ChangedBy` lookup.
 *   - the timeline sink emits a `StageChanged` `cr664_dealtimelineevent`,
 *     mirroring `dealTaskActions`.
 */

import {
  buildNewDealAuditPayload,
  AUDIT_OUTCOME_SUCCEEDED,
  AUDIT_OUTCOME_FAILED,
} from './dealOriginationAudit';
import type {
  StageAdvanceTransport,
  StageAdvanceAuditSink,
  StageAdvanceTimelineSink,
} from '../workflow/stageAdvanceWriteDependency';

// The generated services + the (SDK-touching) actor resolver are pulled in via
// GUARDED dynamic imports so this module keeps the Power Apps SDK OUT of the
// static graph — a UI consumer (the canonical stage card) can import it without
// loading the data client. The reachability audit still follows these dynamic
// specifiers. Mirrors the buildLiveExistingLoanDeps idiom.

// Verified cr664_dealtimelineevents option-set values (see the generated model).
const TIMELINE_EVENT_TYPE_STAGE_CHANGED = 788190006; // 'StageChanged'
const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000; // 'BankerAndManager'

export interface LiveStageAdvanceActor {
  /** The authorized operator's Dataverse systemuserid (timeline EventBy + owner). */
  readonly actorSystemUserId: string;
  /** The operator's email (UPN) — resolves the REQUIRED audit cr664_ChangedBy bind. */
  readonly actorEmail?: string;
}

export interface LiveStageAdvanceDeps {
  readonly transport: StageAdvanceTransport;
  readonly auditSink: StageAdvanceAuditSink;
  readonly timelineSink: StageAdvanceTimelineSink;
}

/**
 * Resolve a canonical stage code (e.g. 'UNDERWRITING') to its live
 * `/cr664_dealstagereferences(<id>)` bind. Returns null when the reference row
 * is absent/inactive (the table not yet seeded) — the caller then reports the
 * write fail-closed. NEVER fabricates a bind.
 */
async function resolveStageReferenceBind(stageCode: string): Promise<string | null> {
  const { Cr664_dealstagereferencesService } = await import(
    '../generated/services/Cr664_dealstagereferencesService'
  );
  const escaped = stageCode.replace(/'/g, "''");
  const res = await Cr664_dealstagereferencesService.getAll({
    select: ['cr664_dealstagereferenceid', 'cr664_code', 'cr664_activeflag'],
    filter: `cr664_code eq '${escaped}'`,
    top: 1,
  });
  if (!res.success) return null;
  const row = (res.data ?? []).find(
    (r) => (r.cr664_code ?? '') === stageCode && r.cr664_activeflag === true,
  );
  return row?.cr664_dealstagereferenceid
    ? `/cr664_dealstagereferences(${row.cr664_dealstagereferenceid})`
    : null;
}

/**
 * App-default LIVE deps for the governed stage-advance seam. Building these
 * performs no IO; the seam stays fail-closed until an operator arms
 * AUTO_STAGE_ADVANCE_ENABLED and the stage reference table is seeded.
 */
export function buildLiveStageAdvanceDeps(actor: LiveStageAdvanceActor): LiveStageAdvanceDeps {
  const transport: StageAdvanceTransport = {
    async updateDealStage(input) {
      try {
        const bind = await resolveStageReferenceBind(input.toStageId);
        if (!bind) {
          return {
            ok: false,
            error: `No active cr664_dealstagereferences row for stage code "${input.toStageId}"; seed the stage reference table before advancing.`,
          };
        }
        const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
        const res = await Cr664_loandealsService.update(input.dealId, {
          'cr664_StageReference@odata.bind': bind,
          cr664_stageentrydate: input.entryDateIso,
        } as unknown as Parameters<typeof Cr664_loandealsService.update>[1]);
        return { ok: res.success, error: res.error?.message };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  const auditSink: StageAdvanceAuditSink = {
    async write(audit) {
      try {
        const { createActorChangedByResolver } = await import('./newDealAuditActorResolver');
        const resolved = await createActorChangedByResolver()(actor.actorEmail);
        if (!resolved.ok || !resolved.changedByBind) {
          return {
            ok: false,
            error:
              'audit blocked: cr664_ChangedBy (a REQUIRED cr664_user lookup) could not be resolved ' +
              `for the actor — ${resolved.reason ?? 'no cr664_user identity'}. No audit row written (fail-closed).`,
          };
        }
        const outcome = audit.outcome === 'advanced' ? AUDIT_OUTCOME_SUCCEEDED : AUDIT_OUTCOME_FAILED;
        const payload = buildNewDealAuditPayload(
          {
            eventName: 'Deal Stage Advanced',
            dealId: audit.dealId,
            changedByBind: resolved.changedByBind,
            actorSystemUserId: actor.actorSystemUserId,
            correlationId: audit.correlationId,
            outcome,
            sourceProcess: 'StageAdvanceWriteDependency/governed-advance',
            notes: `Governed stage advance ${audit.fromStageId} -> ${audit.toStageId}.`,
            fieldName: 'cr664_StageReference',
            oldValue: audit.fromStageId,
            newValue: audit.toStageId,
            beforeState: audit.fromStageId,
            afterState: audit.toStageId,
          },
          new Date().toISOString(),
        );
        const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
        const res = await Cr664_auditeventsService.create(
          payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
        );
        return { ok: res.success, error: res.error?.message };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  const timelineSink: StageAdvanceTimelineSink = {
    async write(event) {
      try {
        const payload = {
          cr664_title: `Stage advanced to ${event.toStageId}`,
          cr664_eventat: new Date().toISOString(),
          cr664_eventtype: TIMELINE_EVENT_TYPE_STAGE_CHANGED,
          cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
          cr664_issystemgenerated: false,
          cr664_eventsubtype: `correlation:${event.correlationId}`,
          'cr664_Deal@odata.bind': `/cr664_loandeals(${event.dealId})`,
          'cr664_EventBy@odata.bind': `/systemusers(${actor.actorSystemUserId})`,
          ownerid: actor.actorSystemUserId,
          owneridtype: 'systemuser',
          statecode: 0,
        };
        const { Cr664_dealtimelineeventsService } = await import(
          '../generated/services/Cr664_dealtimelineeventsService'
        );
        const res = await Cr664_dealtimelineeventsService.create(
          payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
        );
        return { ok: res.success, error: res.error?.message };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };

  return { transport, auditSink, timelineSink };
}

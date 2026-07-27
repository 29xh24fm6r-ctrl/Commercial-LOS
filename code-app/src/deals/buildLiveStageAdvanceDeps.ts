/**
 * Live (Dataverse) wiring for the governed stage-advance write seam
 * (stageAdvanceWriteDependency.ts). Kept SDK-only and SEPARATE from the pure
 * seam so the core stays importable without the data client.
 *
 * AUTO_STAGE_ADVANCE_ENABLED is ARMED (true) as of the WF-1A phase — this is a
 * LIVE write path, mounted via DealStageProgressionCard.tsx in the banker/manager/
 * team workspaces. `advanceWorkflowStage` still fail-closes with `disabled` if the
 * flag were ever unset, and the sinks are only reached by an explicit, gated,
 * authorized invocation — but do not assume importing/building these deps is inert.
 * No borrower-comms module is imported.
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
 *
 * ⚠ 2026-07-14 remediation note (docs/LOAN_WORKFLOW_INDEPENDENT_AUDIT_2026-07-14.md, finding C1):
 *   `Cr664_loandealsService.update()` itself performs no validation — the fail-closed gating
 *   described above (and in stageAdvanceWriteDependency.ts) is enforced entirely by THIS app's
 *   client code, not by Dataverse. See docs/DATAVERSE_SECURITY_ROLE_RUNBOOK.md.
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
  StageAdvanceOnDealBoarded,
} from '../workflow/stageAdvanceWriteDependency';
import type { DealDetail } from './dealQueries';

// The generated services + the (SDK-touching) actor resolver are pulled in via
// GUARDED dynamic imports so this module keeps the Power Apps SDK OUT of the
// static graph — a UI consumer (the canonical stage card) can import it without
// loading the data client. The reachability audit still follows these dynamic
// specifiers. Mirrors the buildLiveExistingLoanDeps idiom.

// Verified cr664_dealtimelineevents option-set values (see the generated model).
const TIMELINE_EVENT_TYPE_STAGE_CHANGED = 788190006; // 'StageChanged'
const TIMELINE_EVENT_TYPE_NOTE_LOGGED = 788190002; // 'NoteLogged' — reused for boarded-loan-created (Workstream K)
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
  readonly onDealBoarded: StageAdvanceOnDealBoarded;
}

/**
 * Resolve a canonical stage code (e.g. 'UNDERWRITING') to its live
 * `/cr664_dealstagereferences(<id>)` bind. Returns null when the reference row
 * is absent/inactive (the table not yet seeded) — the caller then reports the
 * write fail-closed. NEVER fabricates a bind.
 */
async function resolveStageReferenceId(stageCode: string): Promise<string | null> {
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
  return row?.cr664_dealstagereferenceid ?? null;
}

async function resolveStageReferenceBind(stageCode: string): Promise<string | null> {
  const id = await resolveStageReferenceId(stageCode);
  return id ? `/cr664_dealstagereferences(${id})` : null;
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
    // WFLOW-B — prove persistence: re-read the deal's stage-reference value + entry
    // date and confirm they match the requested stage. Fail-closed: any read failure
    // is `ok:false` (unavailable), a value mismatch is `matched:false`.
    async readbackDealStage(input) {
      try {
        const expectedId = await resolveStageReferenceId(input.expectedStageId);
        if (!expectedId) {
          return { ok: false, matched: false, detail: `No active stage reference row for "${input.expectedStageId}" to read back against.` };
        }
        const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
        const res = await Cr664_loandealsService.get(input.dealId, {
          select: ['_cr664_stagereference_value', 'cr664_stageentrydate'],
        });
        if (!res.success || !res.data) {
          return { ok: false, matched: false, detail: res.error?.message ?? 'Deal stage readback read failed.' };
        }
        const raw = res.data as unknown as Record<string, unknown>;
        const actualStageId = typeof raw['_cr664_stagereference_value'] === 'string' ? raw['_cr664_stagereference_value'] : undefined;
        const entryPresent = typeof raw['cr664_stageentrydate'] === 'string' && raw['cr664_stageentrydate'].length > 0;
        if (actualStageId !== expectedId) {
          return { ok: true, matched: false, detail: `Readback stage reference did not match ${input.expectedStageId}; the deal did not persist the move.` };
        }
        if (!entryPresent) {
          return { ok: true, matched: false, detail: 'Readback found no cr664_stageentrydate on the deal after the update.' };
        }
        return { ok: true, matched: true };
      } catch (err: unknown) {
        return { ok: false, matched: false, detail: err instanceof Error ? err.message : String(err) };
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
        // cr664_EventBy targets the custom cr664_user table — NOT systemuser —
        // exactly like the audit's cr664_ChangedBy. Binding a systemuser id here
        // is rejected as "Entity 'cr664_User' ... Does Not Exist" (the same defect
        // fixed on the task path). Resolve the actor's cr664_user bind and use it;
        // OMIT the optional lookup when the actor cannot resolve (fail-closed, no
        // faked identity). Owner/state are server-defaulted (removed with the
        // task-payload owner-field fix).
        const { createActorChangedByResolver } = await import('./newDealAuditActorResolver');
        const resolved = await createActorChangedByResolver()(actor.actorEmail);
        const eventByBind = resolved.ok && resolved.changedByBind ? resolved.changedByBind : undefined;
        const payload = {
          cr664_title: `Stage advanced to ${event.toStageId}`,
          cr664_eventat: new Date().toISOString(),
          cr664_eventtype: TIMELINE_EVENT_TYPE_STAGE_CHANGED,
          cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
          cr664_issystemgenerated: false,
          cr664_eventsubtype: `correlation:${event.correlationId}`,
          'cr664_Deal@odata.bind': `/cr664_loandeals(${event.dealId})`,
          ...(eventByBind ? { 'cr664_EventBy@odata.bind': eventByBind } : {}),
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

  // Auto-board: reuses the ALREADY-LIVE Phase 259 "Add Existing Loan" write path
  // (existingLoanEntryAdapter.ts, mounted via ExistingPortfolioLoansPanel.tsx) — no
  // feature flag gates this, so a deal reaching BOARDED boards for real immediately.
  const onDealBoarded: StageAdvanceOnDealBoarded = {
    async run(deal: DealDetail) {
      const { mapDealToExistingLoanInput } = await import('../portfolioBoarding/mapDealToExistingLoanInput');
      const input = mapDealToExistingLoanInput({
        deal,
        authorized: Boolean(actor.actorSystemUserId),
        actorEmail: actor.actorEmail,
        actorSystemUserId: actor.actorSystemUserId,
      });
      if (!input) {
        return { ok: false, detail: 'Deal has no borrower/client name to board — skipped auto-boarding.' };
      }
      const { boardExistingLoan, buildLiveExistingLoanDeps } = await import(
        '../portfolioBoarding/existingLoanEntryAdapter'
      );
      const outcome = await boardExistingLoan(input, buildLiveExistingLoanDeps());
      if (outcome.kind === 'success') {
        // Final LOS Completion arc — Workstream K: a dedicated boarded-loan-created timeline event
        // on the DEAL's own timeline (distinct from the boarding write's own audit trail on
        // cr664_portfolioboardedloanauditentries) — previously only the generic StageChanged event
        // fired here. Best-effort: never blocks or reverts the boarding write that already
        // succeeded. Reuses NoteLogged (no dedicated option-set value exists for this event, same
        // discipline this arc used for every other new timeline event it added).
        try {
          const { createActorChangedByResolver } = await import('./newDealAuditActorResolver');
          const { timelineEventByBind } = await import('./timelineActorBind');
          const resolved = await createActorChangedByResolver()(actor.actorEmail);
          const payload = {
            cr664_title: `Boarded as portfolio loan ${outcome.loanNumber}`,
            cr664_summary: `Deal boarded to the portfolio as loan ${outcome.loanNumber}.`,
            cr664_eventat: new Date().toISOString(),
            cr664_eventtype: TIMELINE_EVENT_TYPE_NOTE_LOGGED,
            cr664_visibilityscope: TIMELINE_VISIBILITY_BANKER_AND_MANAGER,
            cr664_issystemgenerated: false,
            cr664_relatedentitytype: 'cr664_portfolioboardedloan',
            cr664_relatedentityid: outcome.loanId,
            'cr664_Deal@odata.bind': `/cr664_loandeals(${deal.id})`,
            ...timelineEventByBind(resolved),
            cr664_eventsubtype: `boarded:created|correlation:${outcome.correlationId}`,
          };
          const { Cr664_dealtimelineeventsService } = await import(
            '../generated/services/Cr664_dealtimelineeventsService'
          );
          await Cr664_dealtimelineeventsService.create(
            payload as unknown as Parameters<typeof Cr664_dealtimelineeventsService.create>[0],
          );
        } catch {
          // Best-effort — see the comment above.
        }
        return { ok: true, detail: `Boarded as portfolio loan ${outcome.loanNumber}.` };
      }
      if (outcome.kind === 'duplicate') {
        return { ok: true, detail: `Already boarded (loan number ${outcome.loanNumber} exists).` };
      }
      const detail = 'reason' in outcome ? outcome.reason : 'error' in outcome ? outcome.error : outcome.kind;
      return { ok: false, detail: `Auto-boarding failed: ${detail}` };
    },
  };

  return { transport, auditSink, timelineSink, onDealBoarded };
}

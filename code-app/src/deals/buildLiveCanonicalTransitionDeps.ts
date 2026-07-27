/**
 * Live (Dataverse) wiring for the canonical 4-kind stage transition engine
 * (canonicalStageTransition.ts). Kept SDK-only and SEPARATE from the pure engine
 * so the core stays importable without the data client.
 *
 * LIVE as of the governance initiative (2026-07-21): AUTO_STAGE_ADVANCE_ENABLED is
 * ARMED (true, as of WF-1A) AND `DealGovernedTransitionPanel.tsx` mounts
 * StageWorkflowControl.tsx (the UI for RETURN/DECLINE/WITHDRAW) in the banker deal
 * workspace with `liveEnabled` set — `executeCanonicalStageTransition` IS reachable
 * from a real, authorized user action today. (This comment previously claimed the
 * control was unmounted; that was stale and is corrected here — Final LOS
 * Completion arc, Workstream J.) NO borrower-comms module is imported (DECLINE/
 * WITHDRAW never send anything).
 *
 * Each sink mirrors a PROVEN governed-write pattern (nothing invented):
 *   - applyTransition writes the deal's StageReference + cr664_stageentrydate for a
 *     stage move (ADVANCE/RETURN) and/or its StatusReference for a status change
 *     (DECLINE/WITHDRAW/BOARDED) — resolving each canonical code to its live
 *     reference bind, fail-closed until the tables are seeded.
 *   - readbackTransition re-reads the deal and PROVES the persisted stage/status
 *     reference matches the requested transition (WFLOW-C/D/E).
 *   - the audit sink emits a governed cr664_AuditEvent via the single canonical
 *     builder (buildNewDealAuditPayload) + the fail-closed cr664_user actor
 *     resolver — a systemuser id is never bound into the required cr664_ChangedBy.
 *   - the timeline sink emits a cr664_dealtimelineevent whose cr664_EventBy targets
 *     the custom cr664_user table (never systemuser), mirroring the ADVANCE path.
 */

import {
  buildNewDealAuditPayload,
  AUDIT_OUTCOME_SUCCEEDED,
  AUDIT_OUTCOME_FAILED,
} from './dealOriginationAudit';
import {
  resolveStageReferenceId,
  resolveStageReferenceBind,
  resolveStatusReferenceId,
  resolveStatusReferenceBind,
} from './dealReferenceResolvers';
import { GOVERNANCE_REASON_FIELD_ENABLED } from './dealOriginationFeatureFlags';
import { GOVERNED_TRANSITION_REASON_COLUMN } from './governedTransitionReasonSchema';
import { mapBusinessSafeError } from '../shared/errors/businessSafeErrorMapping';
import type {
  CanonicalStageTransport,
  CanonicalAuditSink,
  CanonicalTimelineSink,
  StageTransitionKind,
  DealStatusCode,
} from '../workflow/canonicalStageTransition';

// Verified cr664_dealtimelineevents option-set values (see the generated model).
const TIMELINE_EVENT_TYPE_STAGE_CHANGED = 788190006; // 'StageChanged'
const TIMELINE_EVENT_TYPE_APPROVAL_DECISION = 788190013; // 'ApprovalDecision'
const TIMELINE_VISIBILITY_BANKER_AND_MANAGER = 788190000; // 'BankerAndManager'

/** A status is "changed" (needs a StatusReference write) when it is not the OPEN default. */
function isStatusChange(status: DealStatusCode): boolean {
  return status !== 'OPEN';
}

function timelineEventType(kind: StageTransitionKind): number {
  // DECLINE is recorded as an approval decision; every other kind is a lifecycle
  // stage/status change. The human-readable title carries the exact semantics.
  return kind === 'DECLINE' ? TIMELINE_EVENT_TYPE_APPROVAL_DECISION : TIMELINE_EVENT_TYPE_STAGE_CHANGED;
}

function transitionTitle(kind: StageTransitionKind, toStage?: string, newStatus?: DealStatusCode): string {
  switch (kind) {
    case 'ADVANCE':
      return `Stage advanced to ${toStage}`;
    case 'RETURN':
      return `Stage returned to ${toStage}`;
    case 'DECLINE':
      return 'Deal declined';
    case 'WITHDRAW':
      return 'Deal withdrawn';
    default:
      return `Deal status ${newStatus}`;
  }
}

export interface LiveCanonicalTransitionActor {
  /** The authorized operator's Dataverse systemuserid (timeline EventBy + owner). */
  readonly actorSystemUserId: string;
  /** The operator's email (UPN) — resolves the REQUIRED audit cr664_ChangedBy bind. */
  readonly actorEmail?: string;
}

export interface LiveCanonicalTransitionDeps {
  readonly transport: CanonicalStageTransport;
  readonly auditSink: CanonicalAuditSink;
  readonly timelineSink: CanonicalTimelineSink;
}

/**
 * App-default LIVE deps for the canonical transition engine. Building these performs
 * no IO. AUTO_STAGE_ADVANCE_ENABLED is already armed; the engine stays fail-closed on
 * this path today because StageWorkflowControl.tsx is not mounted anywhere (and,
 * independently, until the stage + status reference tables are seeded).
 */
export function buildLiveCanonicalTransitionDeps(
  actor: LiveCanonicalTransitionActor,
): LiveCanonicalTransitionDeps {
  const transport: CanonicalStageTransport = {
    async applyTransition(input) {
      try {
        const patch: Record<string, unknown> = {};

        // Stage move (ADVANCE/RETURN, and ADVANCE→BOARDED): resolve + bind the target
        // stage reference and stamp the entry date. Fail-closed if not seeded.
        if (input.toStage) {
          const stageBind = await resolveStageReferenceBind(input.toStage);
          if (!stageBind) {
            return { ok: false, error: `No active cr664_dealstagereferences row for stage code "${input.toStage}"; seed the stage reference table before transitioning.` };
          }
          patch['cr664_StageReference@odata.bind'] = stageBind;
          patch.cr664_stageentrydate = input.entryDateIso;
        }

        // Status change (DECLINE/WITHDRAW/BOARDED): resolve + bind the status reference.
        if (isStatusChange(input.newStatus)) {
          const statusBind = await resolveStatusReferenceBind(input.newStatus);
          if (!statusBind) {
            return { ok: false, error: `No active cr664_dealstatusreferences row for status code "${input.newStatus}"; seed the status reference table before transitioning.` };
          }
          patch['cr664_StatusReference@odata.bind'] = statusBind;
        }

        // Governance initiative (2026-07-21) — write the reason onto the SAME record/request the
        // enforcement plugin inspects, not only into the audit event's notes (a separate entity the
        // plugin cannot see). Fail-closed behind GOVERNANCE_REASON_FIELD_ENABLED until an operator
        // provisions the column (see governedTransitionReasonSchema.ts) — omitted entirely, never
        // written to a non-existent field, when the flag is off.
        if (GOVERNANCE_REASON_FIELD_ENABLED && (input.reasonCode || input.reasonText)) {
          const reason = input.reasonCode
            ? `${input.reasonCode}${input.reasonText ? ` — ${input.reasonText}` : ''}`
            : (input.reasonText ?? '');
          if (reason.trim().length > 0) {
            patch[GOVERNED_TRANSITION_REASON_COLUMN] = reason;
          }
        }

        if (Object.keys(patch).length === 0) {
          return { ok: false, error: `Transition ${input.transition} resolved to no deal-field change; refusing an empty write.` };
        }

        const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
        const res = await Cr664_loandealsService.update(
          input.dealId,
          patch as unknown as Parameters<typeof Cr664_loandealsService.update>[1],
        );
        // PR A remediation — res.error?.message is a raw transport-failure string; every other
        // `error` return in this function above is this codebase's own authored, already-safe
        // descriptive text (e.g. "No active cr664_dealstagereferences row..."), which stays as-is.
        return { ok: res.success, error: res.error?.message ? mapBusinessSafeError(res.error.message).safeMessage : undefined };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, error: mapBusinessSafeError(raw).safeMessage };
      }
    },

    async readbackTransition(input) {
      try {
        const { Cr664_loandealsService } = await import('../generated/services/Cr664_loandealsService');
        const res = await Cr664_loandealsService.get(input.dealId, {
          select: ['_cr664_stagereference_value', 'cr664_stageentrydate', '_cr664_statusreference_value'],
        });
        if (!res.success || !res.data) {
          // PR A remediation — res.error?.message is a raw transport-failure string.
          return {
            ok: false,
            matched: false,
            detail: res.error?.message ? mapBusinessSafeError(res.error.message).safeMessage : 'Deal transition readback read failed.',
          };
        }
        const raw = res.data as unknown as Record<string, unknown>;

        // Stage-move transitions: prove the stage reference + entry date persisted.
        if (input.expectedToStage) {
          const expectedStageId = await resolveStageReferenceId(input.expectedToStage);
          if (!expectedStageId) {
            return { ok: false, matched: false, detail: `No active stage reference row for "${input.expectedToStage}" to read back against.` };
          }
          const actualStageId = typeof raw['_cr664_stagereference_value'] === 'string' ? raw['_cr664_stagereference_value'] : undefined;
          const entryPresent = typeof raw['cr664_stageentrydate'] === 'string' && raw['cr664_stageentrydate'].length > 0;
          if (actualStageId !== expectedStageId) {
            return { ok: true, matched: false, detail: `Readback stage reference did not match ${input.expectedToStage}; the deal did not persist the move.` };
          }
          if (!entryPresent) {
            return { ok: true, matched: false, detail: 'Readback found no cr664_stageentrydate on the deal after the transition.' };
          }
        }

        // Status-change transitions: prove the status reference persisted.
        if (isStatusChange(input.expectedStatus)) {
          const expectedStatusId = await resolveStatusReferenceId(input.expectedStatus);
          if (!expectedStatusId) {
            return { ok: false, matched: false, detail: `No active status reference row for "${input.expectedStatus}" to read back against.` };
          }
          const actualStatusId = typeof raw['_cr664_statusreference_value'] === 'string' ? raw['_cr664_statusreference_value'] : undefined;
          if (actualStatusId !== expectedStatusId) {
            return { ok: true, matched: false, detail: `Readback status reference did not match ${input.expectedStatus}; the deal did not persist the ${input.transition}.` };
          }
        }

        return { ok: true, matched: true };
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : String(err);
        return { ok: false, matched: false, detail: mapBusinessSafeError(raw).safeMessage };
      }
    },
  };

  const auditSink: CanonicalAuditSink = {
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
        const outcome = audit.outcome === 'transitioned' ? AUDIT_OUTCOME_SUCCEEDED : AUDIT_OUTCOME_FAILED;
        const reasonSuffix = audit.reasonCode
          ? ` Reason: ${audit.reasonCode}${audit.reasonText ? ` — ${audit.reasonText}` : ''}.`
          : audit.reasonText
            ? ` Reason: ${audit.reasonText}.`
            : '';
        const target = audit.toStage ?? audit.newStatus;
        const payload = buildNewDealAuditPayload(
          {
            eventName: `Deal ${audit.transition}`,
            dealId: audit.dealId,
            changedByBind: resolved.changedByBind,
            actorSystemUserId: actor.actorSystemUserId,
            correlationId: audit.correlationId,
            outcome,
            sourceProcess: 'CanonicalStageTransition/governed-transition',
            notes:
              `Governed ${audit.transition} ${audit.fromStage} -> ${target} (status ${audit.newStatus}).` +
              (audit.adverseActionPending ? ' Adverse-action handling PENDING.' : '') +
              reasonSuffix,
            fieldName: audit.toStage ? 'cr664_StageReference' : 'cr664_StatusReference',
            oldValue: audit.fromStage,
            newValue: String(target),
            beforeState: audit.fromStage,
            afterState: audit.newStatus,
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

  const timelineSink: CanonicalTimelineSink = {
    async write(event) {
      try {
        // cr664_EventBy targets the custom cr664_user table — NOT systemuser. Resolve
        // the actor's cr664_user bind; OMIT the optional lookup when unresolved
        // (fail-closed, no faked identity). Owner/state are server-defaulted.
        const { createActorChangedByResolver } = await import('./newDealAuditActorResolver');
        const resolved = await createActorChangedByResolver()(actor.actorEmail);
        const eventByBind = resolved.ok && resolved.changedByBind ? resolved.changedByBind : undefined;
        const payload = {
          cr664_title: transitionTitle(event.transition, event.toStage, event.newStatus),
          cr664_eventat: new Date().toISOString(),
          cr664_eventtype: timelineEventType(event.transition),
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

  return { transport, auditSink, timelineSink };
}

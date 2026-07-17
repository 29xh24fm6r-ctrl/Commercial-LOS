/**
 * Live (Dataverse) wiring for `createChecklistWriteDependency`
 * (`checklistWriteDependency.ts`) — the "Generate checklist" button's write
 * seam. Kept SEPARATE from the pure dependency so its SDK-free static graph
 * stays testable without a live client; only the factories below touch the
 * generated SDK, and only when actually called.
 *
 * The row transport writes the same allow-listed payload
 * (`cr664_documentname` + `cr664_Deal@odata.bind`) as
 * `newDealChecklistGenerationAdapter.ts`'s live path. The audit sink reuses
 * that same module's proven cr664_ChangedBy resolution: cr664_ChangedBy is a
 * REQUIRED lookup targeting `cr664_user` (never `systemuser`), resolved via
 * the platform-user bridge and hard-guarded by `assertChangedByCoreUserBind`.
 */

import { createActorChangedByResolver } from './newDealAuditActorResolver';
import {
  buildNewDealAuditPayload,
  summarizeAuditPayloadShape,
  AUDIT_OUTCOME_SUCCEEDED,
  AUDIT_OUTCOME_FAILED,
} from './dealOriginationAudit';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { ChecklistRow, ChecklistRowTransport, ChecklistWriteAuditSink } from '../workflow/checklistWriteDependency';

/** Create ONE cr664_documentchecklists row (allow-listed payload only). */
export function buildLiveChecklistRowTransport(): ChecklistRowTransport {
  return {
    async createChecklistRow(row: ChecklistRow) {
      try {
        const { Cr664_documentchecklistsService } = await import(
          '../generated/services/Cr664_documentchecklistsService'
        );
        const res = await Cr664_documentchecklistsService.create({
          cr664_documentname: row.documentName,
          'cr664_Deal@odata.bind': row.dealBind,
        } as unknown as Parameters<typeof Cr664_documentchecklistsService.create>[0]);
        if (!res.success || !res.data?.cr664_documentchecklistid) {
          return { ok: false, error: res.error?.message ?? 'documentchecklists create returned non-success.' };
        }
        return { ok: true, id: res.data.cr664_documentchecklistid };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/**
 * Per-row audit sink. `actorEmail` is captured once at build time (the caller
 * resolves it from the signed-in banker) and used to resolve the required
 * cr664_ChangedBy bind on every row's audit event.
 */
export function buildLiveChecklistAuditSink(actorEmail: string | undefined): ChecklistWriteAuditSink {
  const resolveActorChangedBy = createActorChangedByResolver();
  return {
    async write(audit) {
      const resolution = await resolveActorChangedBy(actorEmail);
      if (!resolution.ok || !resolution.changedByBind) {
        return {
          ok: false,
          error:
            'audit blocked: cr664_ChangedBy could not be resolved to a cr664_user — ' +
            `${resolution.reason ?? 'no actor identity'}. No audit row written (fail-closed).`,
        };
      }
      assertChangedByCoreUserBind(resolution.changedByBind);

      const nowIso = new Date().toISOString();
      const payload = buildNewDealAuditPayload(
        {
          eventName: 'Document Checklist Row Generated',
          dealId: audit.dealId,
          changedByBind: resolution.changedByBind,
          correlationId: audit.correlationId,
          outcome: audit.outcome === 'created' ? AUDIT_OUTCOME_SUCCEEDED : AUDIT_OUTCOME_FAILED,
          sourceProcess: 'checklistWriteDependency/createChecklistWriteDependency',
          notes:
            audit.outcome === 'created'
              ? `Checklist row created: ${audit.documentName}.`
              : `Checklist row failed: ${audit.documentName} (${audit.error ?? 'unknown error'}).`,
          failureReason: audit.outcome === 'failed' ? (audit.error ?? undefined) : undefined,
          fieldName: 'cr664_documentname',
          oldValue: '',
          newValue: audit.outcome === 'created' ? audit.documentName : '',
        },
        nowIso,
      );
      const shape = summarizeAuditPayloadShape(payload);
      try {
        const { Cr664_auditeventsService } = await import('../generated/services/Cr664_auditeventsService');
        const result = await Cr664_auditeventsService.create(
          payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
        );
        if (!result.success) {
          return { ok: false, error: `${result.error?.message ?? 'AuditEvent create returned non-success.'} | ${shape}` };
        }
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `${msg} | ${shape}` };
      }
    },
  };
}

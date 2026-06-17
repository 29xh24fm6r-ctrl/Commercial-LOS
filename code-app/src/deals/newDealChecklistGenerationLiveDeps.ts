/**
 * Phase 188C -- live (Dataverse) wiring for the audited document-checklist
 * generator. Kept SEPARATE from newDealChecklistGenerationAdapter.ts so the
 * adapter's pure core stays SDK-free and importable without pulling the data
 * client. Imports the generated services here only.
 *
 * Still DISABLED by default: nothing calls `buildLiveAuditedChecklistDeps()`
 * yet (no UI, no orchestrator wiring, no auto-run). Importing these deps never
 * runs IO; only an explicit, gated invocation would. NO borrower-comms module
 * is imported (no email / SMS / Outlook / handoff).
 */

import { Cr664_documentchecklistsService } from '../generated/services/Cr664_documentchecklistsService';
import { Cr664_auditeventsService } from '../generated/services/Cr664_auditeventsService';
import { createActorChangedByResolver } from './newDealAuditActorResolver';
import {
  createChecklistGenerationAuditEmitter,
  type AuditedChecklistDeps,
  type ChecklistRowPayload,
} from './newDealChecklistGenerationAdapter';

/** Read existing checklist document names already on a deal (idempotency). */
async function liveListExistingChecklistRows(
  dealId: string,
): Promise<{ ok: boolean; names?: readonly string[]; error?: string }> {
  try {
    const res = await Cr664_documentchecklistsService.getAll({
      select: ['cr664_documentname'],
      filter: `_cr664_deal_value eq ${dealId}`,
    });
    if (!res.success) {
      return { ok: false, error: res.error?.message ?? 'documentchecklists getAll returned non-success.' };
    }
    const names = (res.data ?? [])
      .map((r) => (r.cr664_documentname ?? '').trim())
      .filter((n) => n.length > 0);
    return { ok: true, names };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Create ONE cr664_documentchecklists row (allow-listed payload only). */
async function liveCreateChecklistRow(
  payload: ChecklistRowPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await Cr664_documentchecklistsService.create(
      payload as unknown as Parameters<typeof Cr664_documentchecklistsService.create>[0],
    );
    if (!res.success || !res.data?.cr664_documentchecklistid) {
      return { ok: false, error: res.error?.message ?? 'documentchecklists create returned non-success.' };
    }
    return { ok: true, id: res.data.cr664_documentchecklistid };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Live audit emitter: resolver -> /cr664_users bind + guard -> auditevents POST. */
const liveEmitChecklistGenerationAudit = createChecklistGenerationAuditEmitter({
  resolveActorChangedBy: createActorChangedByResolver(),
  createAudit: (payload) =>
    Cr664_auditeventsService.create(
      payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
    ),
});

/**
 * App-default live deps for the audited generator. NOTE: nothing wires these in
 * this phase -- the generator stays gated OFF (DOCUMENT_CHECKLIST_GENERATION_ENABLED
 * = false) and is never auto-run. This factory exists so a future gated pilot
 * surface (188D/188E) can inject the live IO.
 */
export function buildLiveAuditedChecklistDeps(): AuditedChecklistDeps {
  return {
    listExistingChecklistRows: liveListExistingChecklistRows,
    createChecklistRow: liveCreateChecklistRow,
    emitChecklistGenerationAudit: liveEmitChecklistGenerationAudit,
  };
}

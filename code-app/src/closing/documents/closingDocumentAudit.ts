import { assertChangedByCoreUserBind } from '../../shared/governance/auditActorBind';
import type { ActorChangedByResolution, ResolveActorChangedBy } from '../../deals/newDealAuditActorResolver';
import type { GeneratedClosingDocumentManifest } from './closingDocumentTypes';

/**
 * Governed-write audit discipline, reused verbatim from the rest of this app: resolve the acting
 * banker's email to a `cr664_user` bind (never `/systemusers`), fail closed (never POST) if it
 * cannot be resolved. A failed/unresolved audit does not revert the document generation that
 * already happened — mirrors this codebase's "governance-partial" outcome pattern elsewhere
 * (e.g. `src/deals/logActivityActions.ts`).
 */
export interface ClosingDocumentAuditEvent {
  readonly manifest: GeneratedClosingDocumentManifest;
  readonly changedByBind: string;
}

export type EmitClosingDocumentAudit = (event: ClosingDocumentAuditEvent) => Promise<{ success: boolean; error?: string }>;

export async function recordClosingDocumentGenerationAudit(
  manifest: GeneratedClosingDocumentManifest,
  resolveActorChangedBy: ResolveActorChangedBy,
  emitAudit: EmitClosingDocumentAudit,
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
    const result = await emitAudit({ manifest, changedByBind: actor.changedByBind });
    return result.success ? { recorded: true } : { recorded: false, error: result.error ?? 'Audit emit returned non-success.' };
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

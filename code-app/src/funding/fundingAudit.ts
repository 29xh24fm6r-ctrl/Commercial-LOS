import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import type { ActorChangedByResolution, ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';
import type { FundingAuthorizationRecord } from './fundingAuthorizationTypes';

/**
 * Governed-write audit discipline, reused verbatim from the rest of this app (see
 * src/closing/documents/closingDocumentAudit.ts for the identical pattern applied to closing
 * documents): resolve the acting user's email to a `cr664_user` bind, fail closed (never POST) if
 * unresolved. A failed/unresolved audit never reverts the funding transition that already happened
 * — mirrors this codebase's "governance-partial" outcome pattern.
 */
export type FundingAuditAction = 'requested' | 'first_approval' | 'fully_approved' | 'rejected' | 'revoked' | 'funded';

export interface FundingAuditEvent {
  readonly record: FundingAuthorizationRecord;
  readonly action: FundingAuditAction;
  readonly changedByBind: string;
}

export type EmitFundingAudit = (event: FundingAuditEvent) => Promise<{ success: boolean; id?: string; error?: string }>;

export async function recordFundingAudit(
  record: FundingAuthorizationRecord,
  action: FundingAuditAction,
  actorEmail: string,
  resolveActorChangedBy: ResolveActorChangedBy,
  emitAudit: EmitFundingAudit,
): Promise<{ recorded: boolean; auditId?: string; error?: string }> {
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
    const result = await emitAudit({ record, action, changedByBind: actor.changedByBind });
    return result.success
      ? { recorded: true, auditId: result.id }
      : { recorded: false, error: result.error ?? 'Audit emit returned non-success.' };
  } catch (err: unknown) {
    return { recorded: false, error: err instanceof Error ? err.message : String(err) };
  }
}

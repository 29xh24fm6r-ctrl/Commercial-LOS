/**
 * Phase 257 — governed app-level workspace-entitlement write.
 *
 * Changes a platform user's PRIMARY WORKSPACE — the field that drives which
 * workspace (banker / team / manager / executive / admin) that user is
 * entitled to. This is the first governed app-level entitlement write; it
 * follows the same discipline as every other governed write in the app:
 *
 *   - Fail-closed authorization: nothing is attempted unless the caller is an
 *     authorized admin AND a write identity (systemuser) is present.
 *   - Auditable actor first: the audit cr664_ChangedBy (a REQUIRED cr664_user
 *     lookup) is resolved BEFORE the write. If it cannot be resolved we do NOT
 *     mutate — an entitlement change that cannot be attributed is never written.
 *   - Readback verification: after the update we re-read the user and confirm
 *     the lookup actually changed to the requested workspace. A mismatch is a
 *     hard failure, never reported as success.
 *   - Honest audit: a Succeeded audit on a verified write; a best-effort Failed
 *     audit on a write/readback failure. A write that succeeds but whose audit
 *     emit fails returns `audit-failed` — never a clean success.
 *
 * The core function is pure over injected dependencies so the fail-closed
 * behaviour is fully unit-testable without the live data client.
 */

import { AUDIT_OUTCOME_SUCCEEDED, AUDIT_OUTCOME_FAILED } from '../shared/governance/auditEnums';
import { assertChangedByCoreUserBind } from '../shared/governance/auditActorBind';
import { newCorrelationId } from '../shared/governance/correlationId';
import {
  createActorChangedByResolver,
  type ResolveActorChangedBy,
} from '../deals/newDealAuditActorResolver';

// Schema-verified option-set values (kept inline so the action does not depend
// on the generated runtime enum maps). cr664_auditevents columns:
//   eventcategory Authorization = 788190001
//   eventtype     UserAccessChange = 788190008
//   entitytype    User = 788190003
const AUDIT_EVENT_CATEGORY_AUTHORIZATION = 788190001;
const AUDIT_EVENT_TYPE_USER_ACCESS_CHANGE = 788190008;
const AUDIT_ENTITY_TYPE_USER = 788190003;

const PRIMARY_WORKSPACE_FIELD = 'cr664_PrimaryWorkspace';
const PLATFORM_WORKSPACES_ENTITY_SET = 'cr664_platformworkspaces';
const SOURCE_PROCESS = 'AdminWorkspace/UserAccess/change-primary-workspace';

export interface ChangeWorkspaceInput {
  /** cr664_platformuserid of the user whose workspace is changing. */
  readonly platformUserId: string;
  /** Display name of the user (audit context only). */
  readonly userDisplayName: string;
  /** cr664_platformworkspaceid to set as the new primary workspace. */
  readonly targetWorkspaceId: string;
  /** Display name of the target workspace (audit + success label). */
  readonly targetWorkspaceName: string;
  /** Acting admin's email — resolves the REQUIRED audit cr664_ChangedBy. */
  readonly actorEmail: string | undefined;
  /** Acting admin's Dataverse systemuserid — required for a governed write. */
  readonly actorSystemUserId: string | undefined;
  /** Caller's fail-closed admin authorization. */
  readonly authorized: boolean;
}

export type ChangeWorkspaceOutcome =
  | { kind: 'success'; correlationId: string; workspaceName: string; auditId: string | undefined }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'identity-unresolved'; reason: string }
  | { kind: 'invalid-input'; reason: string }
  | { kind: 'write-failed'; error: string; correlationId: string }
  | {
      kind: 'readback-mismatch';
      expectedWorkspaceId: string;
      actualWorkspaceId: string | undefined;
      correlationId: string;
    }
  | { kind: 'audit-failed'; auditError: string | undefined; correlationId: string }
  | { kind: 'unknown'; message: string };

/** Minimal read shape of a platform-user row needed by this write. */
export interface PlatformUserReadRow {
  readonly _cr664_primaryworkspace_value?: string;
  readonly cr664_primaryworkspacename?: string;
}

export interface ReadResult {
  readonly success: boolean;
  readonly data?: PlatformUserReadRow;
  readonly error?: { readonly message?: string };
}

export interface WriteResult {
  readonly success: boolean;
  readonly error?: { readonly message?: string };
}

export interface AuditResult {
  readonly success: boolean;
  readonly id?: string;
  readonly error?: { readonly message?: string };
}

/** Injected dependencies — SDK-free so the adapter is unit-testable. */
export interface ChangeWorkspaceDeps {
  /** Read the user's current primary-workspace lookup value + name. */
  readonly getUser: (id: string) => Promise<ReadResult>;
  /** Update the user's PrimaryWorkspace lookup bind. */
  readonly updateUser: (
    id: string,
    changedFields: Record<string, unknown>,
  ) => Promise<WriteResult>;
  /** Emit a governed audit event. */
  readonly emitAudit: (payload: Record<string, unknown>) => Promise<AuditResult>;
  /** Resolve the actor's cr664_ChangedBy bind, fail-closed. */
  readonly resolveActorChangedBy: ResolveActorChangedBy;
}

function trimmed(v: string | undefined): string {
  return (v ?? '').trim();
}

/**
 * Governed primary-workspace change. Pure over `deps` — no SDK, no globals.
 */
export async function changePrimaryWorkspace(
  input: ChangeWorkspaceInput,
  deps: ChangeWorkspaceDeps,
): Promise<ChangeWorkspaceOutcome> {
  // 1. Fail-closed authorization.
  if (!input.authorized) {
    return { kind: 'unauthorized', reason: 'Caller is not an authorized administrator.' };
  }

  // 2. Validate inputs.
  const userId = trimmed(input.platformUserId);
  const workspaceId = trimmed(input.targetWorkspaceId);
  const workspaceName = trimmed(input.targetWorkspaceName);
  if (userId.length === 0) {
    return { kind: 'invalid-input', reason: 'No platform user was selected.' };
  }
  if (workspaceId.length === 0 || workspaceName.length === 0) {
    return { kind: 'invalid-input', reason: 'No target workspace was selected.' };
  }

  // 3. A governed write requires a resolved systemuser identity.
  if (trimmed(input.actorSystemUserId).length === 0) {
    return {
      kind: 'identity-unresolved',
      reason: 'No Dataverse identity is available for the signed-in administrator; the change was not attempted.',
    };
  }

  const correlationId = newCorrelationId('pw');

  // 4. Resolve the auditable actor BEFORE mutating. No attributable actor → no write.
  const actor = await deps.resolveActorChangedBy(input.actorEmail);
  if (!actor.ok || !actor.changedByBind) {
    return {
      kind: 'identity-unresolved',
      reason:
        actor.reason ?? 'The signed-in administrator could not be resolved to an auditable identity; the change was not attempted.',
    };
  }

  // 5. Read the before-state. A user we cannot read is never mutated.
  let beforeRead: ReadResult;
  try {
    beforeRead = await deps.getUser(userId);
  } catch (err: unknown) {
    return {
      kind: 'write-failed',
      error: err instanceof Error ? err.message : String(err),
      correlationId,
    };
  }
  if (!beforeRead.success || !beforeRead.data) {
    return {
      kind: 'write-failed',
      error: beforeRead.error?.message ?? 'The selected user could not be read; the change was not attempted.',
      correlationId,
    };
  }
  const beforeWorkspaceId = trimmed(beforeRead.data._cr664_primaryworkspace_value);
  const beforeWorkspaceName = trimmed(beforeRead.data.cr664_primaryworkspacename);

  // 6. Update the lookup.
  let update: WriteResult;
  try {
    update = await deps.updateUser(userId, {
      [`${PRIMARY_WORKSPACE_FIELD}@odata.bind`]: `/${PLATFORM_WORKSPACES_ENTITY_SET}(${workspaceId})`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitFailedAudit(deps, {
      input,
      actorBind: actor.changedByBind,
      correlationId,
      beforeWorkspaceId,
      beforeWorkspaceName,
      failureReason: `update threw: ${message}`,
    });
    return { kind: 'write-failed', error: message, correlationId };
  }
  if (!update.success) {
    const message = update.error?.message ?? 'PrimaryWorkspace update returned non-success.';
    await emitFailedAudit(deps, {
      input,
      actorBind: actor.changedByBind,
      correlationId,
      beforeWorkspaceId,
      beforeWorkspaceName,
      failureReason: message,
    });
    return { kind: 'write-failed', error: message, correlationId };
  }

  // 7. Readback verification — confirm the lookup actually changed.
  let afterRead: ReadResult;
  try {
    afterRead = await deps.getUser(userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitFailedAudit(deps, {
      input,
      actorBind: actor.changedByBind,
      correlationId,
      beforeWorkspaceId,
      beforeWorkspaceName,
      failureReason: `readback threw: ${message}`,
    });
    return {
      kind: 'readback-mismatch',
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: undefined,
      correlationId,
    };
  }
  const afterWorkspaceId = trimmed(afterRead.data?._cr664_primaryworkspace_value);
  if (!afterRead.success || afterWorkspaceId !== workspaceId) {
    await emitFailedAudit(deps, {
      input,
      actorBind: actor.changedByBind,
      correlationId,
      beforeWorkspaceId,
      beforeWorkspaceName,
      failureReason: `readback verification failed (expected ${workspaceId}, read ${afterWorkspaceId || '(none)'}).`,
    });
    return {
      kind: 'readback-mismatch',
      expectedWorkspaceId: workspaceId,
      actualWorkspaceId: afterWorkspaceId || undefined,
      correlationId,
    };
  }

  // 8. Emit the Succeeded audit. A failed audit on a verified write is an
  //    honest partial — never a clean success.
  assertChangedByCoreUserBind(actor.changedByBind);
  let audit: AuditResult;
  try {
    audit = await deps.emitAudit(
      buildAuditPayload({
        input,
        actorBind: actor.changedByBind,
        correlationId,
        outcome: AUDIT_OUTCOME_SUCCEEDED,
        failureReason: undefined,
        beforeWorkspaceId,
        beforeWorkspaceName,
      }),
    );
  } catch (err: unknown) {
    return {
      kind: 'audit-failed',
      auditError: err instanceof Error ? err.message : String(err),
      correlationId,
    };
  }
  if (!audit.success) {
    return {
      kind: 'audit-failed',
      auditError: audit.error?.message ?? 'Audit create returned non-success.',
      correlationId,
    };
  }

  return { kind: 'success', correlationId, workspaceName, auditId: audit.id };
}

function buildAuditPayload(opts: {
  input: ChangeWorkspaceInput;
  actorBind: string;
  correlationId: string;
  outcome: number;
  failureReason: string | undefined;
  beforeWorkspaceId: string;
  beforeWorkspaceName: string;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    cr664_auditeventname: 'Workspace entitlement changed',
    cr664_eventcategory: AUDIT_EVENT_CATEGORY_AUTHORIZATION,
    cr664_eventtype: AUDIT_EVENT_TYPE_USER_ACCESS_CHANGE,
    cr664_entitytype: AUDIT_ENTITY_TYPE_USER,
    cr664_entityid: opts.input.platformUserId,
    cr664_relatedentitytype: 'cr664_platformuser',
    cr664_relatedentityid: opts.input.platformUserId,
    cr664_outcomestatus: opts.outcome,
    cr664_failurereason: opts.failureReason,
    cr664_changeddate: nowIso,
    'cr664_ChangedBy@odata.bind': opts.actorBind,
    cr664_fieldname: PRIMARY_WORKSPACE_FIELD,
    cr664_oldvalue: opts.beforeWorkspaceId || '(unresolved)',
    cr664_newvalue: opts.input.targetWorkspaceId,
    cr664_beforestate: opts.beforeWorkspaceName || '(unknown)',
    cr664_afterstate: opts.input.targetWorkspaceName,
    cr664_notes: `Primary workspace for ${opts.input.userDisplayName} set to ${opts.input.targetWorkspaceName} from the Admin Operations Console.`,
    cr664_sourcescreensourceprocess: SOURCE_PROCESS,
    cr664_correlationid: opts.correlationId,
  };
}

/** Best-effort Failed audit for a write/readback failure. Never throws. */
async function emitFailedAudit(
  deps: ChangeWorkspaceDeps,
  opts: {
    input: ChangeWorkspaceInput;
    actorBind: string;
    correlationId: string;
    beforeWorkspaceId: string;
    beforeWorkspaceName: string;
    failureReason: string;
  },
): Promise<void> {
  try {
    assertChangedByCoreUserBind(opts.actorBind);
    await deps.emitAudit(
      buildAuditPayload({
        input: opts.input,
        actorBind: opts.actorBind,
        correlationId: opts.correlationId,
        outcome: AUDIT_OUTCOME_FAILED,
        failureReason: opts.failureReason,
        beforeWorkspaceId: opts.beforeWorkspaceId,
        beforeWorkspaceName: opts.beforeWorkspaceName,
      }),
    );
  } catch {
    // A failed write whose failure-audit also fails is still surfaced honestly
    // through the returned outcome; we never throw out of the audit path.
  }
}

/**
 * Live dependencies wired to the generated Dataverse services. Imported only
 * by the panel that performs the write; the generated services pull in the
 * SDK + data-source manifest exactly as every other governed write does.
 */
export function buildLiveChangeWorkspaceDeps(): ChangeWorkspaceDeps {
  return {
    getUser: async (id) => {
      const { Cr664_platformusersService } = await import(
        '../generated/services/Cr664_platformusersService'
      );
      const res = await Cr664_platformusersService.get(id, {
        select: ['cr664_platformuserid', '_cr664_primaryworkspace_value', 'cr664_primaryworkspacename'],
      });
      return {
        success: res.success,
        data: res.data ?? undefined,
        error: res.error ?? undefined,
      };
    },
    updateUser: async (id, changedFields) => {
      const { Cr664_platformusersService } = await import(
        '../generated/services/Cr664_platformusersService'
      );
      const res = await Cr664_platformusersService.update(
        id,
        changedFields as unknown as Parameters<typeof Cr664_platformusersService.update>[1],
      );
      return { success: res.success, error: res.error ?? undefined };
    },
    emitAudit: async (payload) => {
      const { Cr664_auditeventsService } = await import(
        '../generated/services/Cr664_auditeventsService'
      );
      const res = await Cr664_auditeventsService.create(
        payload as unknown as Parameters<typeof Cr664_auditeventsService.create>[0],
      );
      return { success: res.success, id: res.data?.cr664_auditeventid, error: res.error ?? undefined };
    },
    resolveActorChangedBy: createActorChangedByResolver(),
  };
}

import { describe, it, expect, vi } from 'vitest';
import {
  changePrimaryWorkspace,
  type ChangeWorkspaceDeps,
  type ChangeWorkspaceInput,
} from './workspaceEntitlementWrite';
import type { ResolveActorChangedBy } from '../deals/newDealAuditActorResolver';

/**
 * Phase 257 — fail-closed coverage for the governed primary-workspace write.
 *
 * The required fail-closed cases: no authorization, missing Dataverse identity,
 * write failure, and readback mismatch — plus audit failure and the verified
 * success path. Every dependency is injected so no SDK / Dataverse is touched.
 */

const OK_ACTOR: ResolveActorChangedBy = async () => ({
  ok: true,
  changedByBind: '/cr664_users(00000000-0000-0000-0000-0000000000aa)',
});

function baseInput(overrides: Partial<ChangeWorkspaceInput> = {}): ChangeWorkspaceInput {
  return {
    platformUserId: 'user-1',
    userDisplayName: 'Casey Banker',
    targetWorkspaceId: 'ws-manager',
    targetWorkspaceName: 'Manager Command Center',
    actorEmail: 'admin@oldglorybank.com',
    actorSystemUserId: 'sys-admin-1',
    authorized: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ChangeWorkspaceDeps> = {}): ChangeWorkspaceDeps {
  return {
    getUser: vi.fn(async () => ({
      success: true,
      data: { _cr664_primaryworkspace_value: 'ws-banker', cr664_primaryworkspacename: 'Banker Workspace' },
    })),
    updateUser: vi.fn(async () => ({ success: true })),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: OK_ACTOR,
    ...overrides,
  };
}

describe('Phase 257 — changePrimaryWorkspace fail-closed posture', () => {
  it('refuses when the caller is not authorized (no write attempted)', async () => {
    const deps = makeDeps();
    const out = await changePrimaryWorkspace(baseInput({ authorized: false }), deps);
    expect(out.kind).toBe('unauthorized');
    expect(deps.updateUser).not.toHaveBeenCalled();
    expect(deps.emitAudit).not.toHaveBeenCalled();
  });

  it('refuses when the admin has no Dataverse systemuser identity', async () => {
    const deps = makeDeps();
    const out = await changePrimaryWorkspace(baseInput({ actorSystemUserId: undefined }), deps);
    expect(out.kind).toBe('identity-unresolved');
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('refuses when the auditable actor (cr664_user) cannot be resolved', async () => {
    const deps = makeDeps({
      resolveActorChangedBy: async () => ({ ok: false, reason: 'no platform-user identity matched the actor email' }),
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('identity-unresolved');
    if (out.kind === 'identity-unresolved') {
      expect(out.reason).toMatch(/no platform-user identity/i);
    }
    // Never mutate without an auditable actor.
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects empty user / workspace selection', async () => {
    const deps = makeDeps();
    expect((await changePrimaryWorkspace(baseInput({ platformUserId: '  ' }), deps)).kind).toBe('invalid-input');
    expect((await changePrimaryWorkspace(baseInput({ targetWorkspaceId: '' }), deps)).kind).toBe('invalid-input');
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('fails closed when the target user cannot be read (no mutation)', async () => {
    const deps = makeDeps({
      getUser: vi.fn(async () => ({ success: false, error: { message: 'platform-user read failed' } })),
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('write-failed');
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('reports write-failed and emits a Failed audit when the update fails', async () => {
    const emitAudit = vi.fn(async () => ({ success: true, id: 'audit-fail' }));
    const deps = makeDeps({
      updateUser: vi.fn(async () => ({ success: false, error: { message: 'update rejected' } })),
      emitAudit,
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('write-failed');
    if (out.kind === 'write-failed') expect(out.error).toMatch(/update rejected/);
    // A best-effort Failed audit was attempted.
    expect(emitAudit).toHaveBeenCalledTimes(1);
    const payload = emitAudit.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190001); // Failed
  });

  it('reports readback-mismatch when the lookup did not actually change', async () => {
    let reads = 0;
    const deps = makeDeps({
      getUser: vi.fn(async () => {
        reads += 1;
        // before: banker; after: still banker (write silently did not take).
        return {
          success: true,
          data: { _cr664_primaryworkspace_value: 'ws-banker', cr664_primaryworkspacename: 'Banker Workspace' },
        };
      }),
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('readback-mismatch');
    if (out.kind === 'readback-mismatch') {
      expect(out.expectedWorkspaceId).toBe('ws-manager');
      expect(out.actualWorkspaceId).toBe('ws-banker');
    }
    expect(reads).toBe(2); // before + readback
  });

  it('reports audit-failed when the write + readback succeed but the audit emit fails', async () => {
    let reads = 0;
    const deps = makeDeps({
      getUser: vi.fn(async () => {
        reads += 1;
        return reads === 1
          ? { success: true, data: { _cr664_primaryworkspace_value: 'ws-banker' } }
          : { success: true, data: { _cr664_primaryworkspace_value: 'ws-manager' } };
      }),
      emitAudit: vi.fn(async () => ({ success: false, error: { message: 'audit rejected' } })),
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('audit-failed');
    if (out.kind === 'audit-failed') expect(out.auditError).toMatch(/audit rejected/);
  });

  it('succeeds on a verified write: correct lookup bind + Succeeded audit', async () => {
    let reads = 0;
    const updateUser = vi.fn(async () => ({ success: true }));
    const emitAudit = vi.fn(async () => ({ success: true, id: 'audit-ok' }));
    const deps = makeDeps({
      getUser: vi.fn(async () => {
        reads += 1;
        return reads === 1
          ? { success: true, data: { _cr664_primaryworkspace_value: 'ws-banker', cr664_primaryworkspacename: 'Banker Workspace' } }
          : { success: true, data: { _cr664_primaryworkspace_value: 'ws-manager' } };
      }),
      updateUser,
      emitAudit,
    });
    const out = await changePrimaryWorkspace(baseInput(), deps);
    expect(out.kind).toBe('success');
    if (out.kind === 'success') {
      expect(out.workspaceName).toBe('Manager Command Center');
      expect(out.auditId).toBe('audit-ok');
      expect(out.correlationId).toBeTruthy();
    }
    // The lookup was bound to the target workspace via @odata.bind.
    expect(updateUser).toHaveBeenCalledWith('user-1', {
      'cr664_PrimaryWorkspace@odata.bind': '/cr664_platformworkspaces(ws-manager)',
    });
    // Succeeded audit with the correct before/after + cr664_user ChangedBy bind.
    const payload = emitAudit.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.cr664_outcomestatus).toBe(788190000); // Succeeded
    expect(payload.cr664_eventtype).toBe(788190008); // UserAccessChange
    expect(payload.cr664_oldvalue).toBe('ws-banker');
    expect(payload.cr664_newvalue).toBe('ws-manager');
    expect(payload['cr664_ChangedBy@odata.bind']).toMatch(/^\/cr664_users\(/);
  });
});

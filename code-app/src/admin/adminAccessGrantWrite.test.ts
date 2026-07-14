import { describe, it, expect, vi } from 'vitest';
import {
  writeAdminAccessGrant,
  type AdminAccessGrantAction,
  type AdminAccessGrantDeps,
  type AdminAccessGrantInput,
} from './adminAccessGrantWrite';
import type { AdminEntitlementCandidate } from './adminWorkspaceEntitlementQuery';

/**
 * Governed admin Grant/Revoke Admin Access.
 *
 * Pins the discipline: fail-closed authorization + identity, Admin-tier-only
 * actor gate (a Full-tier actor is refused), actor resolved BEFORE any
 * mutation, duplicate guard on grant, self-lockout guard on revoke, readback
 * verification, honest audit (Succeeded on verified write; best-effort Failed
 * audit + audit-failed outcome on failure). Pure over injected deps.
 */

const ACTOR_BIND = '/cr664_users(11111111-1111-1111-1111-111111111111)';
const BASE: Omit<AdminAccessGrantInput, 'action'> = {
  actorEmail: 'admin@bank.test',
  actorFullName: 'Ada Admin',
  actorSystemUserId: 'sys-1',
  actorAccessTier: 'admin',
  authorized: true,
};

interface StoredRow {
  id: string;
  entitlementName: string;
  accessLevel: number;
  active: boolean;
}

function makeBackend(seed: StoredRow[] = []) {
  const store = new Map<string, StoredRow>();
  for (const r of seed) store.set(r.id, r);
  let counter = 0;

  const deps: AdminAccessGrantDeps = {
    listAdminShapedEntitlements: vi.fn(async (): Promise<{ success: true; rows: AdminEntitlementCandidate[] }> => ({
      success: true,
      rows: [...store.values()]
        .filter((r) => r.active)
        .map((r) => ({ entitlementName: r.entitlementName, accessLevel: r.accessLevel, active: r.active })),
    })),
    createEntitlement: vi.fn(async (payload: Record<string, unknown>) => {
      const id = `new-${++counter}`;
      store.set(id, {
        id,
        entitlementName: payload.cr664_entitlementname as string,
        accessLevel: payload.cr664_accesslevel as number,
        active: true,
      });
      return { success: true, id };
    }),
    getEntitlement: vi.fn(async (id: string) => {
      const row = store.get(id);
      return row
        ? { success: true, row: { entitlementName: row.entitlementName, accessLevel: row.accessLevel, active: row.active } }
        : { success: false, error: { message: 'not found' } };
    }),
    updateEntitlement: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      const row = store.get(id);
      if (!row) return { success: false, error: { message: 'not found' } };
      if ('statecode' in patch) row.active = patch.statecode === 0;
      store.set(id, row);
      return { success: true };
    }),
    emitAudit: vi.fn(async () => ({ success: true, id: 'audit-1' })),
    resolveActorChangedBy: vi.fn(async () => ({ ok: true, changedByBind: ACTOR_BIND })),
  };
  return { store, deps };
}

function run(action: AdminAccessGrantAction, deps: AdminAccessGrantDeps, over: Partial<AdminAccessGrantInput> = {}) {
  return writeAdminAccessGrant({ action, ...BASE, ...over }, deps);
}

const GRANT: AdminAccessGrantAction = {
  kind: 'grant',
  targetPlatformUserId: 'u2',
  targetUpn: 'jane.doe@bank.test',
  targetFullName: 'Jane Doe',
  accessLevel: 'Full',
};

describe('writeAdminAccessGrant — authorization + identity (fail-closed)', () => {
  it('refuses an unauthorized caller and mutates nothing', async () => {
    const { store, deps } = makeBackend();
    const r = await run(GRANT, deps, { authorized: false });
    expect(r.kind).toBe('unauthorized');
    expect(store.size).toBe(0);
    expect(deps.createEntitlement).not.toHaveBeenCalled();
  });

  it('refuses when no Dataverse systemuser identity is present', async () => {
    const { deps } = makeBackend();
    const r = await run(GRANT, deps, { actorSystemUserId: undefined });
    expect(r.kind).toBe('identity-unresolved');
    expect(deps.createEntitlement).not.toHaveBeenCalled();
  });

  it('does NOT mutate when the auditable actor cannot be resolved', async () => {
    const { store, deps } = makeBackend();
    (deps.resolveActorChangedBy as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, reason: 'no cr664_user' });
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('identity-unresolved');
    expect(store.size).toBe(0);
  });
});

describe('writeAdminAccessGrant — tier gate', () => {
  it('refuses a Full-tier actor', async () => {
    const { store, deps } = makeBackend();
    const r = await run(GRANT, deps, { actorAccessTier: 'full' });
    expect(r.kind).toBe('insufficient-tier');
    expect(store.size).toBe(0);
    expect(deps.createEntitlement).not.toHaveBeenCalled();
  });

  it('refuses an actor whose tier could not be resolved', async () => {
    const { deps } = makeBackend();
    const r = await run(GRANT, deps, { actorAccessTier: 'failed' });
    expect(r.kind).toBe('insufficient-tier');
  });

  it('refuses an actor with no admin-shaped entitlement at all', async () => {
    const { deps } = makeBackend();
    const r = await run(GRANT, deps, { actorAccessTier: 'none' });
    expect(r.kind).toBe('insufficient-tier');
  });
});

describe('writeAdminAccessGrant — grant', () => {
  it('requires a selected user', async () => {
    const { deps } = makeBackend();
    const r = await run({ ...GRANT, targetPlatformUserId: '' }, deps);
    expect(r.kind).toBe('invalid-input');
  });

  it('grants Full access, building the identity-carrying entitlement name, and audits it', async () => {
    const { store, deps } = makeBackend();
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('success');
    const created = [...store.values()][0];
    expect(created.entitlementName).toBe('jane.doe@bank.test - Admin Full Access');
    expect(created.accessLevel).toBe(788190000);
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    const payload = (deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.cr664_eventcategory).toBe(788190001);
    expect(payload.cr664_eventtype).toBe(788190009);
    expect(payload.cr664_entitytype).toBe(788190003);
  });

  it('grants Admin-tier access with the correct option value', async () => {
    const { store, deps } = makeBackend();
    const r = await run({ ...GRANT, accessLevel: 'Admin' }, deps);
    expect(r.kind).toBe('success');
    expect([...store.values()][0].accessLevel).toBe(788190002);
  });

  it('refuses a duplicate grant to a user who already has active admin access', async () => {
    const { store, deps } = makeBackend([
      { id: 'existing', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevel: 788190000, active: true },
    ]);
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('duplicate');
    expect(store.size).toBe(1);
    expect(deps.createEntitlement).not.toHaveBeenCalled();
  });

  it('allows granting to a user whose only existing row is INACTIVE (previously revoked)', async () => {
    const { deps } = makeBackend([
      { id: 'old', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevel: 788190000, active: false },
    ]);
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('success');
  });

  it('reports readback-mismatch and still emits a Failed audit when the create does not persist as written', async () => {
    const { deps } = makeBackend();
    (deps.createEntitlement as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, id: 'ghost' });
    // getEntitlement('ghost') will fail (not in store) -> readback-mismatch.
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('readback-mismatch');
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
    expect((deps.emitAudit as ReturnType<typeof vi.fn>).mock.calls[0][0].cr664_outcomestatus).toBe(788190001);
  });

  it('reports audit-failed as an honest partial success (the write persisted)', async () => {
    const { store, deps } = makeBackend();
    (deps.emitAudit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, error: { message: 'audit down' } });
    const r = await run(GRANT, deps);
    expect(r.kind).toBe('audit-failed');
    expect(store.size).toBe(1);
  });
});

describe('writeAdminAccessGrant — revoke', () => {
  const REVOKE_ACTION: AdminAccessGrantAction = {
    kind: 'revoke',
    entitlementId: 'e1',
    entitlementName: 'jane.doe@bank.test - Admin Full Access',
  };

  it('requires a selected entitlement', async () => {
    const { deps } = makeBackend();
    const r = await run({ ...REVOKE_ACTION, entitlementId: '' }, deps);
    expect(r.kind).toBe('invalid-input');
  });

  it('blocks an actor from revoking their OWN entitlement (self-lockout guard)', async () => {
    const { store, deps } = makeBackend([
      { id: 'e1', entitlementName: 'admin@bank.test - Admin Admin Access', accessLevel: 788190002, active: true },
    ]);
    const r = await run({ kind: 'revoke', entitlementId: 'e1', entitlementName: 'admin@bank.test - Admin Admin Access' }, deps);
    expect(r.kind).toBe('self-lockout-blocked');
    expect(store.get('e1')!.active).toBe(true);
    expect(deps.updateEntitlement).not.toHaveBeenCalled();
  });

  it('blocks self-lockout even via the full-name-prefix match', async () => {
    const { store, deps } = makeBackend([
      { id: 'e1', entitlementName: 'Ada Admin - Admin Full Access', accessLevel: 788190000, active: true },
    ]);
    const r = await run({ kind: 'revoke', entitlementId: 'e1', entitlementName: 'Ada Admin - Admin Full Access' }, deps);
    expect(r.kind).toBe('self-lockout-blocked');
    expect(store.get('e1')!.active).toBe(true);
  });

  it('revokes another admin\'s entitlement and audits it', async () => {
    const { store, deps } = makeBackend([
      { id: 'e1', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevel: 788190000, active: true },
    ]);
    const r = await run(REVOKE_ACTION, deps);
    expect(r.kind).toBe('success');
    expect(store.get('e1')!.active).toBe(false);
    expect(deps.emitAudit).toHaveBeenCalledTimes(1);
  });

  it('reports not-found for an unknown entitlement id', async () => {
    const { deps } = makeBackend();
    const r = await run(REVOKE_ACTION, deps);
    expect(r.kind).toBe('not-found');
  });

  it('refuses an entitlement that is already revoked', async () => {
    const { deps } = makeBackend([
      { id: 'e1', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevel: 788190000, active: false },
    ]);
    const r = await run(REVOKE_ACTION, deps);
    expect(r.kind).toBe('invalid-input');
    expect(deps.updateEntitlement).not.toHaveBeenCalled();
  });

  it('reports readback-mismatch when the revoke does not persist', async () => {
    const { deps } = makeBackend([
      { id: 'e1', entitlementName: 'jane.doe@bank.test - Admin Full Access', accessLevel: 788190000, active: true },
    ]);
    (deps.updateEntitlement as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const r = await run(REVOKE_ACTION, deps);
    expect(r.kind).toBe('readback-mismatch');
  });
});
